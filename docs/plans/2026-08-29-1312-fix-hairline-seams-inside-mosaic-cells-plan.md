---
title: Hairline Seams Inside Mosaic Cells - Plan
type: fix
date: 2026-08-29
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: conversation
execution: code
---

# Hairline Seams Inside Mosaic Cells - Plan

## Goal Capsule

- **Objective:** The `SVT Text` banner on page 100 reads as solid white letterforms on solid blue, the way the source GIF does — no blue hairlines running through the white.
- **Means:** Stop butting the mosaic cell's three sextant bands against each other as separate background layers. Paint the cell as two overlapping layers split left/right, each one gradient with hard stops down the y axis, so no boundary inside a cell is a butt joint that fractional-pixel rounding can crack open (KTD1).
- **Authority hierarchy:** This plan's R-IDs and KTDs win. `CLAUDE.md` wins on code style and test strategy.
- **Stop conditions:** None.
- **Execution profile:** Work happens on `main`, at the user's explicit direction. No branch, no PR.
- **Tail ownership:** The calling pipeline owns shipping.

## Product Contract

### Summary

A desktop screenshot of page 100 shows thin blue lines cutting horizontally through the white `SVT Text` logo inside the blue banner. SVT's own render has no such lines, and neither does the source GIF: the letterforms are unbroken white.

The lines are a painting artifact of the vector renderer, and they are the same defect class as the row/run seams fixed in `docs/plans/2026-08-23-2021-fix-hairline-seams-in-decoded-frame-plan.md` — one level further in. That plan bled *cell* boxes into their neighbours. These seams are *inside* one cell.

`mosaicStyle` in `src/components/TextFrame.tsx:31-40` paints a mosaic cell as three stacked `background-image` layers, one per sextant band, sized `100% 31.25%`, `100% 37.5%`, `100% 31.25%` and positioned at `0 0%`, `0 50%`, `0 100%`. In percentage terms those three tile the cell exactly, meeting at 31.25% and 68.75% of its height. But `.text-frame__mosaic` is `background-repeat: no-repeat` (`src/index.css:473-475`), so each layer is an independent, independently rasterised rectangle — and a cell's height is never a whole number of device pixels (`--cell-h` is derived from `2.5cqw`; at the 640px desktop cap it is 29.538px). Where one band's bottom rounds down and the next band's top rounds up, a sub-pixel crack opens and the element's own `background-color` — the cell's background, blue in the banner — shows through it.

Measured against the fixture GIF, rendered at 1840x1085 with `deviceScaleFactor: 1`, the mismatching scanlines fall only at fractions **0.292-0.308** and **0.662-0.677** of each cell row, and nowhere else. Each mismatch is a single whole device scanline, so its fraction quantises to a band just below the exact 31.25% and 68.75% boundaries depending on where that row's fractional origin falls — those are the two band boundaries, read through the pixel grid. The x split at 6/13 produces no seam, because it is a hard colour stop *inside* each gradient rather than a boundary between layers; that is the shape the fix generalises.

Why it reads as a desktop problem: the crack is at most one device pixel, so on a phone at DPR 3 it is a third of a device pixel of blend, while on a 1x desktop display it is a whole visible pixel. The banner is also the largest unbroken run of lit sextants in the app, so it is where a per-cell artifact adds up into a line.

### Requirements

- **R1** — Two vertically adjacent lit sextants inside one mosaic cell draw as one unbroken block: the cell's background is never visible between them, at any viewport width, on a 1x display.
- **R2** — Two horizontally adjacent lit sextants inside one mosaic cell — the x split at 6 of 13 — stay seam-free, as they already are.
- **R3** — The sextant geometry is unchanged: x splits at 6 of 13, y at 5 and 11 of 16. Mosaic cells still tile with their neighbours and stay registered with type, GIF slices and the hotspot overlay.
- **R4** — Double-height rows, drawn under `transform: scaleY(2)`, are covered by R1 — a scaled cell magnifies any surviving crack.
- **R5** — Still one element per mosaic cell. A page carries hundreds of them, and the current design's one-element budget is not spent to fix this.

### Out of scope

- How much of a wide desktop viewport the frame takes, and the black margin around it. `--frame-max` caps the column at 640px by settled decision (`src/index.css:74-78`); the banner reads badly because of the seams, not the cap. Worth a separate look, not this fix.
- The `0.5px` row/run bleed from the 2026-08-23 plan. It is correct and stays exactly as it is; this change is strictly inside a cell.
- The `image-rendering: pixelated` GIF fallback path (`.frame__gif`) and the R6 GIF slice (`.text-frame__slice`). Both draw one picture and have no internal band layers.
- `--leading` and `--type-scale`. They move where the boundaries land; they do not cause the crack.

## Key Technical Decisions

- **KTD1 — Two overlapping layers split left/right, not three butted top to bottom.** A mosaic cell becomes: layer 1, the left column's three sextants as a single `linear-gradient(to bottom, ...)` with hard stops at 31.25% and 68.75%, sized `calc(100% * 6 / 13) 100%` at `0 0`; layer 2, the right column's three sextants as the same gradient sized `100% 100%` at `0 0`. Layer 1 is listed first, so it paints on top and covers the left 6/13 of layer 2. Every boundary inside the cell is then either a hard colour stop within one gradient (the two y splits) or an overlap where an opaque layer sits on an opaque layer (the x split). Neither can expose the background: a hard stop's worst case is one row blended between the two intended colours, which is what the GIF does at a fractional scale anyway. *Rejected:* growing each band's `background-size` by `0.5px` the way rows and runs are bled. Percentage `background-position` places a layer at `(container - layer) * p`, so growing a band's height moves it up; every band's position would have to be recomputed as a mixed px/% expression, and the bottom band would need to bleed past the element. Fragile arithmetic for the same result.
- **KTD2 — Keep the bit order and the geometry constants where they are.** The sextant bit order (top-left first, bottom-right last) and the 6/13 and 5,11/16 splits are broadcast facts, not implementation detail; the rewrite re-expresses them as gradient stops rather than layer sizes and positions, and the sentence recording where they come from is carried into the reworded comment rather than dropped. *Rejected:* deriving the stops from `--cell-h` in CSS. The proportions are fixed by the broadcast standard, so a percentage is the honest unit.
- **KTD3 — No stacking order, no extra elements.** The fix stays inside the one `<span>` per cell and adds no `z-index` anywhere, which is what the frame's whole bleed arrangement depends on (`docs/solutions/best-practices/a-blank-teletext-column-is-still-painted.md`). *Rejected:* one element per sextant. Six times the DOM for a page already carrying hundreds of cells.

## Implementation Units

### U1 — Repaint the mosaic cell as two overlapping halves

**Files:** `src/components/TextFrame.tsx`

Replace the `MOSAIC_BANDS` table and `mosaicStyle`'s three-layer composition with the two-layer form in KTD1.

The sextant bits keep their meaning: bit `band*2` is the left column of band `band`, bit `band*2 + 1` the right. The left layer's gradient reads bits 0, 2, 4 and the right layer's bits 1, 3, 5; an unlit sextant is the cell's background colour, as now.

`MOSAIC_SPLIT_X` (`calc(100% * 6 / 13)`) survives as the left layer's `background-size` width instead of an in-gradient stop. The band stops become a shared constant — 31.25% and 68.75% — with the comment explaining that they are SVT's y splits at 5 and 11 of 16, and that they are now stops inside one gradient specifically so no layer boundary can crack.

`backgroundColor: bg` stays: it is the fallback under both layers and the colour of an unlit sextant at the blended edge.

The JSDoc above the mosaic constants (`src/components/TextFrame.tsx:15-21`) currently opens "A mosaic cell's six sextants, as three stacked background bands" — a description of the construction being removed, sitting directly above the new code. Reword it to the two-overlapping-layers form, keeping the sentence that records SVT's 6/13 and 5,11/16 splits and the one-element-per-cell budget.

Satisfies R1, R2, R3, R4, R5.

### U2 — Record why the seam is gone in the stylesheet comment

**Files:** `src/index.css`

`.text-frame__mosaic`'s comment (`src/index.css:468-472`) already scopes its seam-free claim correctly — "so neighbouring cells tile without a seam" — and is the only record of where the 6/13 and 5,11/16 proportions come from. It is not wrong, so this is an addition, not a correction: keep that sentence and append what now makes the *inside* of a cell seam-free — hard stops in one gradient down y, an overlapping layer across x — so the next person does not reintroduce the stacked-band form. `background-repeat: no-repeat` stays: the left layer must not tile across the cell.

Satisfies R1 (as documentation of it).

### U3 — Not implemented: no automated cover for the change

Sub-pixel painting is a property of the browser's rasteriser at a given device pixel ratio. jsdom has no rasteriser, and the project's test strategy (`CLAUDE.md`) is app-level tests with the network faked, not visual snapshots — asserting the computed `background-image` string would test the stylesheet against itself.

Verification is `npm test` and `npm run build` staying green, plus a browser check of page 100 at a desktop viewport with `deviceScaleFactor: 1`.

The criterion is **the cell's background never appears inside a lit run** — the `SVT Text` letterforms read as unbroken white. It is deliberately not pixel-exact equality with the fixture GIF: a single scanline blended between the two sextant colours at the 31.25% and 68.75% boundaries is the expected output of a hard gradient stop at a fractional position, and passes. Only a scanline showing the cell background is a failure.

The construction was prototyped against the running app before this plan was written — the two-layer form patched onto all 159 mosaic cells of page 100 at 1840x1085, DPR 1. The six background-gap scanlines collapsed to three blend rows, and the banner became visually indistinguishable from the source GIF. That is the expected shape of the result, not a target to reproduce exactly.

Page 300's `sport` banner is the second case to look at, since it is the one the earlier seam fix was written against.

## Risks

- **A hard colour stop can still blend one row of pixels.** That is a blend of white and blue, not blue showing through white, and it is what a scaled bitmap does too. The prototype in U3 shows it is invisible at 1x. If it ever did read badly, the lever is *not* a px-valued stop derived from `--cell-h` — CSS cannot see the device pixel grid, and KTD2 keeps the proportions in percentages — but the R6 route: paint the cell from a small generated bitmap under `image-rendering: pixelated`, which snaps every boundary the way the GIF slice already does. That is a larger change and is not proposed here.
- **The x overlap depends on layer order.** `background-image` paints the first layer on top, and the right layer is sized `100% 100%`. Listing it first therefore does not shift the x split by 7/13 of a cell — it paints the right column's sextants over the whole cell and the x split disappears entirely. Visible immediately on any mosaic page, so it is not a silent failure, but the comment in U1 must say which layer is which and why.
- **The percentages resolve against a box bled by half a pixel.** `.text-frame__row` and the run/mosaic/slice rule each add `0.5px` (`src/index.css:421-422`, `:438-446`), so `calc(100% * 6 / 13)` and the 31.25%/68.75% stops land roughly 0.16-0.23px past the true cell fractions. This is unchanged from the three-layer form and introduces no regression — it is recorded because it is the reason a pixel-exact comparison with the fixture GIF is the wrong acceptance criterion (U3).
- **Other seams may survive.** If a hairline remains after this change, the remaining suspect is the `transform: scaleY(2)` on a double-height row, whose scaled bottom edge rounds separately from the row after it — the same open item the 2026-08-23 plan left.
