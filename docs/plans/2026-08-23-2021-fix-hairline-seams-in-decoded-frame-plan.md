---
title: Hairline Seams in the Decoded Frame - Plan
type: fix
date: 2026-08-23
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: conversation
execution: code
---

# Hairline Seams in the Decoded Frame - Plan

## Goal Capsule

- **Objective:** A solid block of colour in a decoded page is solid — no black hairline runs through the blue banner on page 300.
- **Means:** Let each row and each run bleed a fraction of a pixel into its right and bottom neighbour, so the crack left by fractional-pixel rounding is always painted over (KTD1).
- **Authority hierarchy:** This plan's R-IDs and KTDs win. `CLAUDE.md` wins on code style and test strategy.
- **Stop conditions:** None.
- **Execution profile:** Work happens on `main`, at the user's explicit direction. No branch, no PR.
- **Tail ownership:** The calling pipeline owns shipping.

## Product Contract

### Summary

A phone screenshot of page 300 shows a black horizontal line running the full width of the blue `sport` banner. SVT's own render of the same page has no such line, and neither does the source GIF: the banner is one unbroken block of blue.

The line is not in the data — it is a painting artifact of the vector renderer. `TextFrame` draws the page as absolutely positioned boxes on a grid derived from the container width: a cell is `2.5cqw` wide and `--cell-h` = `cell-w * 16 / 13 * 1.26` tall, and row *n* is placed at `top: n * cell-h` with `height: cell-h` (`src/index.css:186-194`). None of those values is a whole number of device pixels — at a 402px-wide frame a cell is 10.05px wide and 15.58px tall — so each box's top and bottom edges are rounded to the device pixel grid independently. Where the row above rounds down and the row below rounds up, a sub-pixel crack opens between them, and `.text-frame`'s own `background: #000` (`src/index.css:163`) shows through it. That is the black line, and it is why it appears at some row boundaries and not others: it depends on where each boundary happens to fall.

The same mechanism applies horizontally between adjacent runs, which are placed at `left: col * cell-w` with `width: width * cell-w` (`src/index.css:207-215`) — a vertical black hairline between two runs sharing a background colour. It is less conspicuous because a run boundary usually coincides with a colour change, but it is the same defect and is fixed by the same change.

The recent leading and type-scale commits (`9973877`, `249631b`, `f91701b`) did not introduce the defect; they changed `--leading`, which moves where the boundaries land, which is why the artifact became visible now.

### Requirements

- **R1** — Two vertically adjacent cells with the same background colour draw as one unbroken block: no frame background is visible between them, at any viewport width.
- **R2** — The same holds for two horizontally adjacent cells with the same background colour.
- **R3** — The grid itself does not move: a cell stays at the same position and the same size, so type, mosaics, GIF slices and the hotspot overlay stay registered with each other.
- **R4** — Double-height rows, which are drawn scaled, are covered by R1 and R2 too.

### Out of scope

- The `image-rendering: pixelated` GIF path (`.frame__gif`). It draws one picture, so it has no internal seams.
- The frame's own outer edges, and how much of the viewport width the frame takes. Settled in the full-bleed and gutter work.
- `--leading`, `--type-scale` and the row spacing they set. The seam is independent of their values.

## Key Technical Decisions

- **KTD1 — Rows and runs bleed a half pixel into the neighbour that paints after them.** `.text-frame__row` gains `0.5px` of height and `.text-frame__run/__mosaic/__slice` gain `0.5px` of width, without moving `top` or `left`. Rows are emitted top to bottom and runs left to right, so the neighbour that overlaps the bleed is always painted later and covers it: the overlap is invisible and only the crack it fills changes. `overflow: hidden` on `.text-frame` clips the last row's and last column's bleed. *Rejected:* snapping `--cell-w` and `--cell-h` to whole device pixels from JavaScript with a `ResizeObserver`. It removes the crack at the source, but it re-introduces the per-frame measuring that the container-query geometry exists to avoid, and it cannot express the sub-device-pixel case on a 3x screen anyway.
- **KTD2 — The bleed is applied to the box size, not by painting a backing layer per row.** A cheaper-sounding alternative is to give `.text-frame` a per-row background band behind the runs, but a row's background is not uniform — it changes per run — so the band would have to replay the run grouping in a second element per run. *Rejected:* duplicate backing elements; a page carries hundreds of runs already.
- **KTD3 — `0.5px`, not `1px`.** The crack is at most one device pixel; on a 2x or 3x screen half a CSS pixel is one or more device pixels, which is enough to cover it, while staying below the width of anything the eye can catch if the paint order ever changed. On a 1x screen it rounds up to the one pixel that is needed. *Rejected:* `1px`, which buys nothing and doubles to 2px under a double-height row's `scaleY(2)`.

## Implementation Units

### U1 — Bleed the row and run boxes

**Files:** `src/index.css`

`.text-frame__row` height becomes `calc(var(--cell-h) + 0.5px)`. The shared `.text-frame__run, .text-frame__mosaic, .text-frame__slice` rule keeps `height: 100%` and takes `width: calc(var(--width) * var(--cell-w) + 0.5px)`. `.text-frame__row--double .text-frame__slice`, which overrides height for the unscaled GIF slice, gains the same `0.5px` so a slice under a double-height row is not left short.

The `.text-frame__slice` `background-size` and `background-position` stay in exact cell units — the slice's picture must not be stretched by the bleed, only its box extended (the extra half pixel repeats nothing, since `background-repeat: no-repeat`; it shows the run's `backgroundColor` instead, which is the neighbouring cell's own background in every case that matters).

A comment records why the boxes overlap and why the paint order makes it safe.

Satisfies R1, R2, R3, R4.

### U2 — Not implemented: no automated cover for the change

Sub-pixel painting is a property of the browser's rasteriser at a given device pixel ratio; jsdom has no rasteriser, and the project's test strategy (`CLAUDE.md`) is app-level tests with the network faked, not visual snapshots. Asserting the computed `calc()` string would test the stylesheet against itself.

Verification is `npm test` and `npm run build` staying green — the change must not disturb the existing decoded-frame tests — plus a look at page 300 in the running app, where the banner reads as one unbroken blue block.

## Risks

- **The bleed is visible as a colour fringe if paint order ever changes.** Rows and runs are emitted in document order by `TextFrame`, and no `z-index` or stacking context is set on them, so later siblings paint over earlier ones. A future change that gives runs a stacking order would need to revisit this. The comment in U1 says so.
- **The crack may not be the only artifact.** If a black line survives the change, the next suspect is the `transform: scaleY(2)` on a double-height row, whose scaled bottom edge rounds separately from the row that follows it; the fix there is to extend that row's height before the scale rather than after.
