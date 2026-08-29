---
title: A half-pixel bleed only works between siblings, so inside one element overlap the background layers instead
date: 2026-08-29
category: best-practices
module: src
problem_type: best_practice
component: frontend
applies_when:
  - An element is painted from several background-image layers that tile it edge to edge
  - The element's size is a fraction of its container, so its internal boundaries miss the device-pixel grid
  - The layers are no-repeat, so each is rasterised as its own rectangle over the element's background-color
  - The boundary that cracks is inside one element, where there is no later sibling to paint over a bleed
severity: high
tags: [css, background-image, gradient, subpixel-rounding, hairline-seam, teletext, mosaic, paint-order, decoded-frame]
related_components: [frontend]
---

# A half-pixel bleed only works between siblings, so inside one element overlap the background layers instead

## Context

The decoded frame draws a teletext page as real text and painted boxes rather than as SVT's GIF. A *mosaic* cell is block graphics — a 2x3 grid of sextants, split by SVT at x = 6 of 13 and y = 5 and 11 of 16 — and each cell is a single `<span class="text-frame__mosaic">`, because a page carries hundreds of them.

Cells are sized as a fraction of the container: `--cell-w: 2.5cqw` with `--cell-h` derived from it (`src/index.css:392-393`). No cell boundary therefore lands on a whole device pixel — at the 640px frame cap (`--frame-max`, `src/index.css:74-78`) a cell is 29.538px tall. That is deliberate, and it is what lets the 40x25 grid scale to any width.

The old `mosaicStyle` painted a cell as three stacked layers, one per y band, sized `100% 31.25%` / `100% 37.5%` / `100% 31.25%` at positions `0 0%` / `0 50%` / `0 100%`, each a left-to-right gradient with a hard stop at 6/13. In percentages the three tile the cell exactly, meeting at 31.25% and 68.75% of its height.

They do not tile in device pixels. `.text-frame__mosaic` is `background-repeat: no-repeat` (`src/index.css:480`), so each band was an independently rasterised rectangle and the two internal boundaries were **butt joints**. Where one band's bottom rounded down and the next band's top rounded up, a sub-pixel crack opened and the element's own `background-color` showed through — thin blue hairlines cutting horizontally through the white `SVT Text` logo on page 100. The source GIF has no such lines.

Two things made it easy to miss:

- **Desktop-only in practice.** The crack is at most one device pixel. At DPR 3 that is a third of a pixel of blend; at DPR 1 it is a fully visible line. A phone-shaped check passes on a bug desktop users see.
- **The construction was never chosen as a layering decision.** It arrived from a DOM-node reduction — 159 mosaic cells on page 100 were rendering 1,113 nodes where 159 would do, so seven elements per cell collapsed into one painted from CSS layers. The sextant percentages are a restatement of the measured 13x16 glyph geometry. Nothing weighed a butt joint against an overlap; the boundary risk was never raised. *(session history)*

An earlier fix had already cured this exact crack one level out. Seams *between* cells were fixed by bleeding `.text-frame__row` and the run boxes half a pixel into the neighbour that paints after them (`src/index.css:422`, `src/index.css:445`; `docs/plans/2026-08-23-2021-fix-hairline-seams-in-decoded-frame-plan.md`). The reflex is to reach for that bleed again. It does not transfer.

## Guidance

**A bleed is a between-siblings technique.** It works only because a later-painted neighbour hides the overlap. Inside one element there is no such neighbour, and percentage `background-position` places a layer at `(container - layer) * p` — so growing a band's height *moves it up*. Every band's position would have to be recomputed as a mixed px/% expression, and the last band would need to bleed past the element. That is arithmetic that is exact only at the sizes you tried.

**Restructure instead, so no internal boundary is a butt joint.** Make every boundary inside the element one of two things:

1. a hard colour stop **within a single gradient** — one rasterised rectangle, so there is no second rectangle to round away from; or
2. an **opaque-over-opaque overlap** — a smaller layer sitting on one that covers at least the whole seam.

Both are exact under any rounding. For the mosaic cell that means two layers split left/right rather than three stacked top to bottom: the left column as one top-to-bottom gradient carrying both y splits as hard stops, listed first so it paints over a full-width right column (`src/components/TextFrame.tsx:41-56`).

```ts
const MOSAIC_SPLIT_X = 'calc(100% * 6 / 13)'
const MOSAIC_SPLIT_Y = ['31.25%', '68.75%']

backgroundImage: `${mosaicColumn(bits, 0, fg, bg)}, ${mosaicColumn(bits, 1, fg, bg)}`,
backgroundSize: `${MOSAIC_SPLIT_X} 100%, 100% 100%`,
```

`background-position` is gone; the default `0 0` is right for both layers. `background-repeat: no-repeat` stays and is now load-bearing for a new reason — it stops the narrow left layer tiling across the rest of the cell.

**The layer order is the construction, not a preference.** CSS paints the first `background-image` layer on top. Because the right layer is full width, listing it first would not *move* the x split but erase it: the cell would draw entirely in the right column's sextants. Paint order is load-bearing in the decoded frame in both directions — between siblings it is what makes the bleed invisible (`a-blank-teletext-column-is-still-painted.md`), and inside the cell it is what creates the x split at all.

**Check appearance at DPR 1.** Sub-pixel defects shrink with device pixel ratio, so the low-DPR case is the one that falsifies.

## Verification

Measured, not asserted. Playwright at `deviceScaleFactor: 1`, viewport 1840x1085, fixture pages 100, 104 and 105 — 159 + 47 + 47 = 253 mosaic cells. Inside mosaic bounding boxes only, count pixels that differ from an identical pair directly above and below; that is a hairline through solid colour. **139 before, 0 after.** The baseline came from `git stash`ing the change and re-measuring, so it is like-for-like rather than a remembered number.

The measuring script was ad hoc and is not in the repo, so those two numbers cannot be re-derived by running something — the method above is the reproducible part. `CLAUDE.local.md` documents the Playwright setup it needs.

A green suite proves nothing here — `src/index.css` is imported only by `src/main.tsx` and happy-dom computes no layout (`the-suite-never-loads-the-stylesheet-so-a-green-run-is-silent-about-layout.md`). What the DOM *can* see is pinned by an app-level test (`src/app.test.tsx:193`): every `.text-frame__mosaic` carries `backgroundSize` exactly `calc(100% * 6 / 13) 100%, 100% 100%` and exactly two gradients, plus one asymmetric cell fixing the bit-to-side mapping. It was mutation-tested — reversing the layers and swapping the sides each turn it red — because an assertion about a construction the suite cannot render is worth only what its failure modes prove.

Two limits, stated rather than glossed:

- **Double-height rows are unverified.** No fixture puts a mosaic on a `transform: scaleY(2)` row, so "fewer boundaries cannot add cracks" is reasoning, not measurement.
- **The 6/13 split resolves against the element**, so it holds only because the resolver emits mosaic runs one cell wide (`src/teletext/resolve.ts:208`). Merging adjacent identical mosaic cells into wider runs — a tempting optimisation — would break the sextant grid.

Note also that snapping cell geometry to whole device pixels has been argued once and rejected: KTD1 of `docs/plans/2026-08-23-2021-fix-hairline-seams-in-decoded-frame-plan.md` turned down a JavaScript `ResizeObserver` that would round `--cell-w` and `--cell-h` to whole device pixels, because it reintroduces the per-frame measuring the container-query geometry exists to avoid and still cannot express the sub-device-pixel case on a 3x screen. Read that before proposing it again.

## Related Issues

- `docs/solutions/best-practices/a-blank-teletext-column-is-still-painted.md` — the sibling half of this rule: the 0.5px bleed between rows and runs, and why a `z-index` would break it.
- `docs/solutions/best-practices/the-suite-never-loads-the-stylesheet-so-a-green-run-is-silent-about-layout.md` — why the suite is silent about anything you would check by looking.
- `docs/plans/2026-08-23-2021-fix-hairline-seams-in-decoded-frame-plan.md` — the between-cells fix for the same class of crack.
- `docs/plans/2026-08-29-1312-fix-hairline-seams-inside-mosaic-cells-plan.md` — the plan for this change.
