---
title: Canvas getImageData returns colour-managed pixels, so exact RGBA equality is not pixel identity
date: 2026-08-23
category: runtime-errors
module: src/teletext
problem_type: runtime_error
component: frontend
symptoms:
  - A feature that reads pixels back from a canvas works on one machine and silently degrades on another
  - Headless browsers and CI never reproduce it; only a real display does
  - Colours come back one step off the source palette, e.g. 255,255,254 beside 255,255,255
root_cause: wrong_api
resolution_type: code_fix
severity: critical
tags: [canvas, getimagedata, colour-management, srgb, pixel-decoding, display-profile]
---

# Canvas getImageData returns colour-managed pixels, so exact RGBA equality is not pixel identity

## Problem

Teletext frames are decoded in the browser by drawing SVT's GIF to a canvas and reading the pixels back, then splitting them into a grid of character cells. Each cell is meant to hold at most two colours — teletext has an eight-colour palette — and a cell with a third colour means the frame is not the grid the model assumes, so the whole frame is abandoned to the original image.

On a colour-managed display every frame tripped that guard. The entire feature fell back to the image it was written to replace, for every page, on most real machines.

## Symptoms

- Every frame fell back to the original GIF; the app looked exactly as it did before the change.
- Reproduced only on a real machine. Headless Chromium is always plain sRGB, so the automated suite and every scripted browser check passed.
- Reading the pixels back by hand showed the palette plus near-duplicates: `255,255,255` alongside `255,255,254`, `0,0,0` alongside `0,0,1` and `1,0,0`, `0,0,255` alongside `1,0,255`.

## What Didn't Work

- **Suspecting the data.** The GIFs decode cleanly outside the browser: correct dimensions, no cell over two colours, no transparency, no graphic control extension. The bytes were never the problem.
- **Suspecting a stale build or service worker.** A plausible story, since the app is a PWA and a worker will happily serve an old shell — but the built bundle demonstrably contained the new code, and the failure survived a clean rebuild.
- **Forcing a display profile in headless Chromium.** `--force-color-profile=display-p3` and `generic-rgb` do not perturb `getImageData` there, so the test passed under all three profiles and proved nothing. A headless browser could not reproduce this at all.

## Solution

Stop treating exact RGBA equality as identity. Teletext's eight colours have every channel either off or full, so each channel is snapped before any comparison:

```ts
const pack = (pixels: Uint8ClampedArray, offset: number): number => {
  const r = pixels[offset] < 128 ? 0 : 255
  const g = pixels[offset + 1] < 128 ? 0 : 255
  const b = pixels[offset + 2] < 128 ? 0 : 255
  return ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0
}
```

The build-time generator reads palette indices rather than canvas pixels, so it does not suffer the drift — but it must snap identically, or a palette entry a step away from another would split a cell there that the runtime reads as one colour, and the two would disagree about what a glyph looks like.

The fallback also now names its reason on the console. A fallback that degrades silently and still renders a readable page is precisely one that can be in force everywhere and go unnoticed.

## Why This Works

`getImageData` does not hand back the source bytes. It hands back the canvas backing store after colour conversion, and that conversion depends on the display profile the browser is working in. On plain sRGB it is the identity; on anything else — a wide-gamut laptop panel, a calibrated monitor — values land a step or two either side of where they started. The shift is small enough to be invisible and large enough to break equality.

Snapping quantises away exactly the noise the conversion introduces, without discarding anything real, because the source palette only ever uses the extremes of each channel.

## Prevention

- **When reading pixels back for identity or classification, quantise to the palette you expect.** Exact equality on `getImageData` output is a latent environment dependency, not a comparison.
- **Do not treat a headless browser as evidence about colour.** It is always sRGB, so it cannot reproduce this class of bug. A check that passes under `--force-color-profile` variants is not the assurance it appears to be — verify the flag actually perturbs the pixels before believing a negative result.
- **Make silent fallbacks announce themselves.** This survived review, a full test suite and several scripted browser checks; what found it was a person running the app and noticing the picture had not changed. A fallback that logs its reason would have been found in a minute.
- **A degraded path that still looks correct is the dangerous kind.** Prefer a loud signal over a graceful one when the graceful one is indistinguishable from success.

## Related Issues

- The same class of environment blindness produced a second bug in this work: double-height rows were sized with a larger `font-size`, which widens glyphs as well as raising them, so headlines drew twice their column width and were clipped. No test could see it either — the test DOM performs no layout. Both were found only by looking at the running app.
