---
title: A reload of a hash entry leaves Chrome for iOS sized to the screen, not the slot
date: 2026-08-30
category: runtime-errors
module: src
problem_type: runtime_error
component: frontend
symptoms:
  - The shell is laid out from behind the address bar and ends a toolbar's height above the bottom of the visible area
  - Only after reloading a history entry reached by an in-app link; a typed URL reloaded is fine
  - Only Chrome for iOS; Safari and Brave on the same phone are unaffected
  - "Nothing the page can measure disagrees: safe-area insets, visualViewport offsets, scrollY and every rect are self-consistent and correct"
  - Rotating the phone, or locking and unlocking it, clears it instantly
root_cause: wrong_api
resolution_type: code_fix
severity: high
tags: [chrome-ios, viewport, slot, svh, hash-routing, same-document-navigation, visualviewport, device-only-bug]
---

# A reload of a hash entry leaves Chrome for iOS sized to the screen, not the slot

## Problem

On Chrome for iOS, reloading a page the reader had reached by an in-app
navigation drew the app half behind the address bar: the top band sat under
Chrome's toolbar and the bottom bar ended a toolbar's height below the bottom
of the screen. Routing here is hash-based (`#100`), so every in-app page change
is a same-document navigation, which made this the ordinary case rather than an
exotic one — open the app, tap a page, pull to reload, and the shell is
displaced.

Chrome for iOS does not draw its toolbars *over* the web view the way Safari
does. It draws them beside it and sizes the view to the slot between them. That
sizing is bookkeeping Chrome re-seeds per navigation, and
`FullscreenWebStateObserver::DidFinishNavigation` calls `ResetForNavigation()`
only when the navigation changes document. Reloading a same-document history
entry skips the reset, so the view is left at the full height of the screen
while the toolbars are still drawn. The page is laid out into a box taller than
what is visible, and nothing in the page can see it.

## Symptoms

- Only Chrome for iOS. Safari and Brave on the same phone are unaffected — both
  are WKWebView, so this is not WebKit.
- Only after a reload of a history entry reached by an in-app tap. Typing the
  URL and reloading never reproduces it.
- Rotating the phone, or locking and unlocking it, clears the state instantly.
- A comparable page with no service worker and ordinary path URLs (txtv.nu)
  does not reproduce it.
- Every number the page can read agrees with every other. On the reporter's
  phone (402x874 CSS px) safe-area insets were `0px`, `scrollY` 0,
  `scrollingElement.scrollTop` 0, and `visualViewport` reported 402x874 with
  `offsetTop` 0, `pageTop` 0, `scale` 1 — perfectly self-consistent, and wrong.

## What Didn't Work

Roughly ten fixes shipped before the cause was known. Every one of them aimed
at a number the page could read, and every one was plausible because a snapshot
of the already-broken page is internally consistent.

- **Correcting by `visualViewport.offsetTop`**, clamped so a negative offset
  could not push the shell further off. It reports zero here; there is nothing
  to correct by.
- **Re-reading the viewport once the load had settled** — in a `requestAnimationFrame`,
  behind a 400ms timer, on `pageshow`. The settled reading is the broken one.
- **Zeroing scroll**: `history.scrollRestoration = 'manual'` plus `scrollTo(0, 0)`
  and clearing every scroll container. The document was never scrolled.
- **`viewport-fit=cover`**, then restricting cover to an installed copy — which
  is what `index.html:22-25` still does, for its own reasons. In a tab the
  insets come back `0px`, so cover only means drawing under chrome the page
  cannot measure.
- **Restructuring the shell**: from `position: fixed` with a JS-written height
  into a flow box `100svh` tall with no document scroll range (`.app` at
  `src/index.css:138-146`). It made the shell simpler and did not touch this.
- **Giving the document a scroll range** — transiently, permanently, and from
  first paint — and then a real finger-driven scroll over that range. The
  toolbars never collapsed, because they were never in the way of the *view*.

The tell was there the whole time and unread: while broken, a `100svh` probe
still measured 676 — the slot — against an `innerHeight` of 874. Chrome had
gone full-screen-plus-insets rather than merely mis-sizing something.

## Solution

`src/viewportReset.ts`, called from `src/main.tsx:14` before the first render.

Detection needs both halves (`displaced`, `src/viewportReset.ts:61-62`): the
viewport within two pixels of `screen.height`, **and** a `100svh` probe more
than `SLOT_MARGIN_PX` (50, line 41) shorter than that viewport. Either alone is
an ordinary phone — a full-screen viewport is what you get once the toolbars
have scrolled away, and a short slot on its own says only that they are on
their way out. The slot has to be read off a hidden probe box
(`slotHeight`, lines 84-91) because no property reports it.

The correction (`renavigate`, lines 129-134) is `location.replace` of the same
URL with a marker query parameter, `omritad`. The parameter forces a document
fetch rather than a replay of the entry, which is what makes Chrome run its
reset; `replace` rather than `assign` keeps Back where the reader expects it;
and `dropMarker` (lines 137-142) strips it with `replaceState` once the new
document is running.

`sessionStorage` caps this at two attempts (`MAX_ATTEMPTS`, line 31) and the
counter is cleared on any load that comes up right (line 173). Every storage
access is wrapped in `try`/`catch` (lines 99-121) — this runs before the first
render, and a browser that blocks storage must not be handed a blank page; a
session that cannot count gets exactly one attempt. An installed copy returns
`settle` immediately (line 76), since it has no browser toolbars.

The resize that does the damage lands a frame or two after load, so
`resetChromeViewport` looks once and then watches `resize` for `WATCH_MS`
(3000, line 34) in case it has not happened yet.

## Why This Works

The displacement lives in Chrome's own geometry, not in the page's. No
correction expressed in what the page can measure could reach it, which is why
ten attempts at one failed identically. What *does* reach it is a
document-changing navigation, because that is the exact condition
`DidFinishNavigation` tests before resetting — the same thing rotation and a
lock/unlock achieve by other routes, and the only one of the three a page can
perform for itself.

The two-part detection is what keeps this from firing on healthy phones. `100svh`
is defined as the toolbars-shown height, so it keeps reporting the slot even
while Chrome has handed the page the whole screen; that disagreement between
two numbers with different provenance is the only signature the bug has. The
unit tests pin both halves as load-bearing (`src/viewportReset.test.ts`),
including the two near-misses: full screen with a full-screen slot, and a short
slot inside a short viewport.

## Prevention

**When every measurement agrees and the picture is still wrong, the wrongness
is outside the page.** Exact self-consistency is the tell, not reassurance — a
real layout bug leaves at least one number disagreeing with another.

**Sample the numbers over time, not once they have settled.** Ten fixes were
aimed at settled snapshots that all said the same correct thing. The
breakthrough came from writing a line at +0/100/300/1000/3000ms
(`SAMPLES`, `src/components/Diagnostics.tsx:81`) and on every event that could
move the page — scroll, resize, pageshow, visibilitychange, touchend,
orientationchange (line 99). That log showed a `resize` at roughly 40ms with no
user interaction, `innerHeight` going 676 → 874 and staying, where a good load
sat at 676 for the whole session and fired no resize at all.

**Compare numbers that are not the browser's own report of itself.**
`innerHeight` against `screen.height` against a measured `100svh` probe: any one
alone is unfalsifiable, and it is the disagreement that carries the
information.

**A device-only bug needs a readout on the device.** `?diag`
(`src/components/Diagnostics.tsx:21`) and the in-memory log (`src/log.ts`, 300
lines from boot) are kept in the app for this, with the log copyable to the
clipboard (line 132 of `Diagnostics.tsx`) — that is how a phone session becomes
a report someone else can read.

**When the cause is a browser bug, read the browser's source.** That is what
turned "rotation fixes it" from a curiosity into a fix.

**A workaround that renavigates must be capped and self-clearing.** Two
attempts, a counter cleared on any healthy load, and storage failures that
degrade to one attempt rather than to a blank page.

## Related Issues

- `docs/solutions/runtime-errors/canvas-getimagedata-is-colour-managed.md` — the repo's other bug whose cause was the environment rather than the code, and which also appeared only on real hardware. Its rule that a silent fallback must announce itself is what the on-device readout here is the next iteration of.
- `docs/solutions/best-practices/the-suite-never-loads-the-stylesheet-so-a-green-run-is-silent-about-layout.md` — a green suite says nothing about layout, and prescribes a real browser instead. This bug extends that ladder a rung: a headless Chromium pass would have been just as silent, because the defect is in Chrome for iOS's own view sizing. A browser pass covers stylesheet and layout defects, not shell geometry.
- A stale bundle can masquerade as this bug on a phone. The service worker precaches the shell and swaps itself on the next foreground (`src/serviceWorker.ts`), so a device can be running code from before a fix while appearing to test it — which is why the readout names the commit it was built from. Background the app, reopen, and repeat once before trusting a negative result. (session history)
