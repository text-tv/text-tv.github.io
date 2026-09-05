---
title: Frame Margins - Plan
type: fix
date: 2026-09-05
artifact_contract: ce-unified-plan/v1
artifact_readiness: superseded
product_contract_source: ce-plan-bootstrap
execution: code
---

# Frame Margins - Plan

> **Superseded — do not implement.** This plan rests on the premise that SVT leaves column 0
> blank on every page. It does not: text rows use column 0 for the `*` markers a page's legend
> explains. The geometry here hung column 0 off the frame and clipped it, which dropped those
> markers; it shipped and was reverted in `36413e0`.
>
> Replaced by `docs/plans/2026-09-05-1610-fix-even-bar-margins-41-cell-frame-plan.md`, which
> reaches the same goal by widening the frame to 41 cells instead of hiding a column.
>
> Kept as the record of what was tried and why it failed.

## Goal Capsule

- **Objective:** A full-width bar on any teletext page shows equal black margin on its left and right edges, with the reading grid no smaller than it is today.
- **Means:** Reserve 0.42 of a cell at column 0 for margin plus the change mark, and derive every cell dimension from 39.84 columns instead of 40 (KTD1, KTD2).
- **Authority hierarchy:** `misc/design/README.md` is authoritative on the geometry — its numbers are the deliverable, not a sketch. This plan follows it; a conflict between this plan and that file is a plan bug, not a license to deviate.
- **Stop conditions:** Any full-width bar with unequal left/right margins, or a change mark clipped outside the frame's own box, means the work is not done.
- **Execution profile:** Pure CSS change. No new state, no component edits, no data fetching.

---

## Product Contract

### Summary

SVT's broadcast frame leaves column 0 blank but runs full-width bars flush to column 39, so a full-bleed render (today's behavior) touches the right edge of the screen while a full cell of black sits on the left. This change gives the frame a small, equal margin on both sides by treating the page as 39 used columns instead of 40, letting column 0 hang mostly off the left edge of the frame.

### Problem Frame

A reader noticed the imbalance on device; it reads as a layout bug even though the offset originates in the broadcast source, not the app.

### Requirements

- R1. A full-width bar's black margin is equal on the left and right edges, to within a pixel, on any width-bound (portrait phone) layout.
- R2. The reserved margin costs no reading size: cell width must not shrink below today's full-bleed value.
- R3. The change mark (a refresh-brought-back-different indicator) moves to the right end of column 0 and stays fully inside the frame's own box, in the margin, ending exactly where a full-width bar begins.
- R4. Height-bound layouts (tall, narrow windows) keep centering the 40-column grid with no column hanging off either edge — this is today's behavior and must not regress.
- R5. Pages shown as their source GIF (undecoded fallback) get the same margin treatment as decoded text pages.
- R6. Existing in-page links — the tappable hotspots and their visible underlines, drawn over both the decoded-text and GIF-fallback frame — stay accurately aligned with the printed page after the margin change.

### Key Decisions

- **Reserve exactly 0.42 cells (the change mark's own width) as the margin, not a full cell.** A 41-cell box (full margin) lands the bars evenly but costs every page 2.4% of type size for a margin nobody asked to be that big. Bleeding into column 0 is cheaper but paints ink into a cell the broadcast leaves blank and gives the mark nowhere to live. Inset like svt.se's mobile view is correct-looking but costs two full cells of reading width. (see origin: `misc/design/README.md`) — Governs R1, R2, R3.
- **The margin and the mark share one token (`MARGIN = 0.42`).** The mark can never be wider than the margin that holds it, and the two move together if this number ever changes. (see origin: `misc/design/README.md`) — Governs R2, R3.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Move `container-type: inline-size` from `.text-frame` to `.frame`, and define `--cell-w` once on `.frame`.** `--cell-w` must be a fraction of the *available* width while the frame's own content is 40 cells wide and hangs left of that width — a box cannot size itself from its own width. Making `.frame` the query container lets every child's `cqw` resolve against the un-hung available width. Defining `--cell-w: calc(100cqw / 39.84)` once on `.frame` (removed from `.text-frame`, never duplicated on `.frame__gif` or `.hotspots`) means the margin and mark stay one token in practice, not just in the Key Decision above — a future retune of `MARGIN` changes one declaration. (see origin: `misc/design/README.md` for the container-type move; the single-declaration consolidation is this plan's own choice, made during review, to keep the Key Decision's "one token" claim true of the CSS and not just the prose.)
- KTD2. **Give `.frame__gif` the same absolute-position, calc-based left/width treatment as `.text-frame`.** The design doc requires the GIF fallback to hang the same way (R5) but only specifies the outcome, not the mechanism, since its own "Implementation notes" enumerate rules for `.text-frame` only. `.frame__gif` is currently a static `width: 100%; height: 100%` block; giving it `position: absolute; left: calc(var(--cell-w) * -0.58); width: calc(var(--cell-w) * 40)` mirrors `.text-frame` and reads the shared `--cell-w` KTD1 puts on `.frame`. `.frame:has(.frame__gif)`'s own `aspect-ratio` stays `520 / 400` (no leading) — unchanged, per the design doc's Assets section.
- KTD3. **Give `.hotspots` (the link tap-target and underline layer) the same left/width treatment, sourced from the same shared `--cell-w`.** `HotspotLayer.tsx` computes every link's `leftPct`/`widthPct`/click position as a percentage of a 40-column, 520px-native frame (`src/imageMap.ts`: `leftPct: (x1 / frame.width) * 100`), and assumes its own box (`.hotspots`, currently `inset: 0` against `.frame`) *is* that 40-column frame. Once `.text-frame`/`.frame__gif` hang left of `.frame`'s own (39.84-column) box, `.hotspots` no longer coincides with the visible content, so every link mark and tap target lands off the printed digits (R6). Repositioning `.hotspots` exactly like `.text-frame`/`.frame__gif` restores that coincidence — `.hotspots`' 0-100% space is again exactly the 40-column frame — with no change to `HotspotLayer.tsx` or `imageMap.ts`, which stay correct because their percentages were always relative to their container's box, not to `.frame`'s. (Identified during document review; the alternative of rescaling the percentage math in `imageMap.ts`/`HotspotLayer.tsx` was considered and rejected — it would duplicate the margin formula in a third place, in JS, where KTD1 already established one CSS token as the single source of truth.)
- KTD4. **Add `overflow-x: hidden` (not `overflow: hidden`) to `.frame` itself, as part of the same geometry change** — not scoped to the GIF case, and not deferred to a later unit. `.text-frame`'s own `overflow: hidden` clips its internal row/run bleed (see the existing rule's own comment), not the part of `.text-frame` that now hangs past `.frame`'s edge — only `.frame`'s own overflow can clip that, for every rendering path (`.text-frame`, `.frame__gif`, and `.hotspots` alike). Scoping to `overflow-x` (rather than both axes) avoids clipping `.hotspot`'s vertical touch-target overscan on the frame's top/bottom rows, where a target is grown to `max(heightPct%, 44px)` and can extend past `.frame`'s own height.
- KTD5. **No new automated test for the pixel geometry itself.** `--cell-w`, `left`, and `width` here resolve via `cqw` and `calc()`, which jsdom does not lay out — existing tests never assert on stylesheet-derived container-query values (they assert `style.transform`/`style.backgroundImage`, which are inline styles JS itself sets). Verify the geometry visually instead, at the widths in the Verification Contract below. Existing behavioral tests (mark class presence, GIF fallback rendering, mosaic geometry, hotspot navigation) keep covering the logic untouched by this change.

### High-Level Technical Design

Worked example at a 390px-wide phone, `--leading: 1.5` (from `misc/design/README.md`; unchanged by this plan, reproduced here as the number this change must reach):

| Value | Full bleed (before) | New (after) |
| --- | --- | --- |
| Cell width | 9.700px | 9.739px |
| Frame left | 0px | −5.649px |
| Black left of a full-width bar | 9.70px | 4.09px |
| Black right of a full-width bar | 0px | 4.09px |

Formula (`MARGIN = 0.42` cells):

```
cell width  = available width / (39 + 2 × MARGIN)   = available width / 39.84
frame left  = −(1 − MARGIN) × cell width             = −0.58 × cell width
frame width = 40 × cell width
mark left   = (1 − MARGIN) × cell width              = 0.58 × cell width
```

Height-bound layouts need no code change: `--frame-max` already caps the reading column and centres it with `margin-inline: auto`, so once `--frame-max`'s own numerator is updated (U1), `100cqw` inside that capped column is the centred width and no negative offset applies.

### Assumptions

- The GIF-fallback treatment (KTD2) and the hotspot-layer treatment (KTD3) are this plan's own technical choices, not stated mechanically in `misc/design/README.md`. If a future edit to that source document specifies a different mechanism, both should be revisited against it.
- KTD5's manual-visual-only verification stands as this plan's decision, made without a user available to weigh it: this repo's test convention (`CLAUDE.md`) already limits automated coverage to app-level behavior faked at the network boundary, not CSS layout, and there is no existing Playwright-based visual-regression pattern in this repo to extend. Introducing one is a bigger step than this narrow geometry fix warrants. This is revisitable — a future plan could add a Playwright pixel-geometry check as its own unit if regressions on this geometry recur.

### Sequencing

U1 before U2 and U3: both depend on `.frame` already being the `cqw` query container and carrying the shared `--cell-w`, updated aspect-ratio, and `overflow-x: hidden`, which U1 establishes. U2 and U3 do not depend on each other.

---

## Implementation Units

### U1. Text-frame margin geometry

- **Goal:** Give the decoded text frame the 0.42-cell margin: resize the grid to 39.84 columns, hang column 0 off the left, and move the change mark to the right end of column 0.
- **Requirements:** R1, R2, R3, R4
- **Dependencies:** none
- **Files:**
  - `src/index.css` (`:root --frame-max`, `.frame`, `.text-frame`, `.text-frame__mark`)
- **Approach:**
  1. On `.frame`: add `container-type: inline-size` and `overflow-x: hidden` (KTD1, KTD4); add `--cell-w: calc(100cqw / 39.84)` (KTD1); change `aspect-ratio` to `517.92 / calc(400 * var(--leading))` (`517.92 = 39.84 × 13`).
  2. On `.text-frame`: remove `container-type: inline-size` (moved to `.frame`); remove its own `--cell-w` declaration (now inherited from `.frame`); add `left: calc(var(--cell-w) * -0.58)`; add `right: auto`; add `width: calc(var(--cell-w) * 40)`; keep `overflow: hidden` (it clips the row/run bleed described in the existing comment — the hang past `.frame`'s edge is clipped by `.frame`'s own `overflow-x: hidden` from step 1, not by this).
  3. On `.text-frame__mark`: change `left` from `0` to `calc(var(--cell-w) * 0.58)`.
  4. In `:root`, change `--frame-max`'s numerator from `520` to `517.92` (keep the `560px` floor and `640px` ceiling unchanged).
- **Patterns to follow:** `src/index.css`'s existing `cqw`-derived cell math (`--cell-w: 2.5cqw` today) and its comment style explaining *why*, not just *what*.
- **Test scenarios:** Test expectation: none — geometry change only, no computed layout under jsdom (KTD5). Verify per the Verification Contract below.
- **Verification:** At 390px width (or the container width used by the design doc's worked example), a full-width bar's left and right black margins are visually equal (~4px each) and the cell reads very slightly larger than before, not smaller. Confirm the column-0 hang is clipped (no ink bleeding past the frame's left edge) even before U2/U3 land.

### U2. GIF-frame margin geometry

- **Goal:** Give the GIF-rendered fallback frame the same left-hang and width as the text frame, without changing its aspect ratio.
- **Requirements:** R5
- **Dependencies:** U1 (needs `.frame` as the `cqw` container, its shared `--cell-w`, and its `overflow-x: hidden`)
- **Files:**
  - `src/index.css` (`.frame:has(.frame__gif)`, `.frame__gif`)
- **Approach:**
  1. On `.frame__gif`: change from a static `width: 100%; height: 100%` block to `position: absolute; left: calc(var(--cell-w) * -0.58); width: calc(var(--cell-w) * 40); height: 100%` (KTD2), reading the `--cell-w` U1 defined on `.frame` — do not redeclare it here (KTD1).
  2. Leave `.frame:has(.frame__gif)`'s `aspect-ratio: 520 / 400` unchanged.
- **Patterns to follow:** U1's `.text-frame` rules — same formula, same variable, no local redeclaration.
- **Test scenarios:** Test expectation: none — same reasoning as U1 (KTD5).
- **Verification:** A page rendered as its source GIF (decode failure) shows the same left/right margin as a decoded text page at the same width.

### U3. Hotspot-layer margin geometry

- **Goal:** Keep every in-page link's tap target and underline aligned with the printed digits after the frame hangs left and widens (R6, KTD3).
- **Requirements:** R6
- **Dependencies:** U1 (needs `.frame`'s shared `--cell-w` and `overflow-x: hidden`)
- **Files:**
  - `src/index.css` (`.hotspots`)
- **Approach:**
  1. On `.hotspots`: add `left: calc(var(--cell-w) * -0.58); width: calc(var(--cell-w) * 40)` alongside its existing `inset: 0` (or replace `inset: 0` with `top: 0; right: auto; bottom: 0` plus the new `left`/`width`, whichever reads cleaner given the existing rule) — same formula as `.text-frame`/`.frame__gif`, reading the same shared `--cell-w`.
  2. Do not touch `src/components/HotspotLayer.tsx` or `src/imageMap.ts`: their `leftPct`/`widthPct`/click-position math is already expressed as a percentage of a 40-column, 520px-native frame, which is exactly what `.hotspots`' box becomes once step 1 lands. No JS change is needed or correct here (KTD3).
- **Patterns to follow:** U1's `.text-frame` rule and U2's `.frame__gif` rule — same left/width formula, no new variable.
- **Test scenarios:** Test expectation: none — same reasoning as U1 (KTD5); `HotspotLayer.tsx`'s existing navigation tests (in `src/app.test.tsx`, e.g. "går till sida 106 när man trycker på den i bilden") stay unmodified and keep proving the click logic, which this unit does not change.
- **Verification:** On a page with visible links, a link's underline (`.hotspot-mark`) sits directly under its printed digits, and tapping/clicking the printed digits navigates to that link's page, at the new geometry.

---

## Verification Contract

- `npm test` — must still pass unmodified, including the existing link-navigation tests in `src/app.test.tsx` (e.g. "går till sida 106 när man trycker på den i bilden"), which prove `HotspotLayer.tsx`'s click logic is untouched by this change (confirmed: `src/components/TextFrame.tsx` has no geometry math of its own).
- `npm run build` — typecheck + production build must succeed (CSS-only change, but confirms nothing else broke).
- Manual/browser check (this repo's Playwright setup, or the pipeline's browser-test step): at a 390px-wide viewport, confirm:
  - A full-width bar's left and right black margins are equal (~4.09px each per the worked example).
  - A marked row's change mark sits fully inside the frame, ending where the bar begins.
  - A tall/narrow (height-bound) window still centers the grid with no margin on either side.
  - A visible link's underline sits on its printed digits, and tapping/clicking the digits navigates correctly, on both the decoded-text and GIF-fallback paths.

## Definition of Done

- U1, U2, and U3 landed in `src/index.css`; no component files changed.
- `npm test` and `npm run build` both pass.
- Visual check confirms equal left/right margins on a full-width bar, the mark inside the frame's box, unchanged centering on height-bound layouts, and links aligned and tappable on both rendering paths.
- No dead-end CSS left from exploring KTD2's or KTD3's mechanism.

---

## Sources / Research

- `misc/design/README.md` — the design handoff this plan implements; owns the geometry formula, the worked example, and the rejected alternatives cited in Key Decisions.
- `misc/design/Teletext phone.dc.html` — HTML design reference demonstrating the geometry and behavior; not production code (per the design doc's own framing).
- `src/index.css` — current `.frame`/`.text-frame`/`.text-frame__mark`/`.hotspots` rules and the `--frame-max` derivation, read directly to confirm the design doc's "current" description matches the live code.
- `src/components/TextFrame.tsx` — confirmed to contain no JS-side geometry math, so this stays a CSS-only change.
- `src/components/HotspotLayer.tsx` and `src/imageMap.ts` — read to confirm link position/click math is expressed as a percentage of `.hotspots`' own box (`leftPct: (x1 / frame.width) * 100`, `FRAME_WIDTH = 520`), which is what U3 relies on to avoid a JS change.
