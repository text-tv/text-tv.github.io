---
title: Even Bar Margins via a 41-Cell Frame - Plan
type: fix
date: 2026-09-05
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Even Bar Margins via a 41-Cell Frame - Plan

## Goal Capsule

- **Objective:** A full-width bar on any teletext page shows equal black margin on its left and right edges, and every column the broadcast paints stays fully visible.
- **Means:** Draw the page in a frame one cell wider than the page itself: the 40-column picture sits flush left, and the app owns a blank 41st cell on the right (KTD1).
- **Authority hierarchy:** Measurements taken against the live render are authoritative. `misc/design/README.md` is **not** — its central premise is false and this plan corrects it (U3).
- **Stop conditions:** Any full-width bar with unequal margins, or any column-0 character clipped or hidden, means the work is not done.
- **Execution profile:** CSS-only in `src/index.css`, plus two documentation corrections. No component or logic changes.

---

## Product Contract

### Summary

SVT draws its full-width colour bars across page columns 1-39, leaving column 0 blank, and the app draws the page full-bleed. A bar therefore runs flush to the right edge of the screen while a whole blank cell of black sits on its left. This change widens the drawn frame to 41 cells and places the 40-column page flush left, so the app's own blank cell on the right balances the broadcast's blank column 0 on the left. Both margins become exactly one cell.

### Problem Frame

A reader reported the imbalance on device. An earlier attempt (reverted in `36413e0`) tried to remove the left margin by hanging column 0 off the frame and clipping it. That silently destroyed content: column 0 is not always blank.

### Requirements

**Geometry**

- R1. A full-width bar's black margin is equal on its left and right edges, to within one pixel, at any width-bound viewport.
- R2. Every character the broadcast paints in column 0 renders in full. No approach may clip, hide, or overdraw it.
- R3. Height-bound layouts (tall, narrow windows) keep centring the frame with no column hanging off either edge - today's behaviour, which must not regress.

**Rendering paths**

- R4. A page shown as its source GIF (decode fallback) gets the same one-cell right margin, and the GIF renders at its native proportions with no vertical distortion.
- R5. In-page links - tap targets and visible underlines - stay aligned with the printed digits on both rendering paths.

**Documentation**

- R6. No file in the repository asserts that SVT leaves column 0 blank on every page. This covers `misc/design/README.md` and the two code comments that repeat the claim.
- R7. `docs/plans/2026-09-05-1458-fix-frame-margins-plan.md` no longer presents itself as implementation-ready.

### Key Decisions

- **Give the right side a cell of its own, at the cost of 2.44% of cell width.** (session-settled: user-directed — chosen over hanging column 0 off the frame: hanging clips real content.) `misc/design/README.md` rejected this exact alternative, but only because hanging column 0 appeared free. It is not free, so the cost is now the price of the only approach that satisfies R1 and R2 together. Governs R1, R2.
- **The design document's premise is false and is not authoritative.** (session-settled: user-directed — chosen over continuing to treat its geometry as the deliverable: the whole formula derives from the false premise.) Governs R6.

### Scope Boundaries

**Deferred to follow-up work**

- Relocating the change mark into the app-owned 41st cell. See KTD4 for why it is not in this change.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Frame is 41 cells; the page is 40 cells flush left.** A bar occupies page columns 1-39, so in frame coordinates it runs from edge 1 to edge 40, leaving exactly one cell of black on each side. Placing the spare cell on the left instead would give two cells left and none right - strictly worse. Centring the page (half a cell each side) would give 1.5 left and 0.5 right - still uneven. Flush left is the only placement that balances the bar. (session-settled label inherited from the governing Key Decision; cites R1, R2.)
- KTD2. **`.frame` becomes the query container and owns `--cell-w`.** `--cell-w` must be a fraction of the *frame* (41 cells) while `.text-frame` is 40 cells wide, and a box cannot size itself from its own width. Moving `container-type: inline-size` up to `.frame` and declaring `--cell-w: calc(100cqw / 41)` there lets `.text-frame`, `.frame__gif`, and `.hotspots` all read one definition. Nothing hangs outside the frame under this geometry, so no `overflow` clipping is added anywhere.
- KTD3. **`.frame:has(.frame__gif)` becomes `533 / 400`, not `520 / 400`.** The GIF is still a 40-column picture, but it now occupies 40 of the frame's 41 cells. For the frame's height to match the GIF's own proportions, the ratio must be `1.3 x 41/40 = 533/400`. Keeping `520 / 400` would leave the frame taller than the GIF's aspect and, because U2 sizes the image `height: 100%`, would draw every pixel 2.5% tall - a stretch, not a visible gap. That distinction decides how R4 is measured: an assertion about a gap would pass under both ratios and prove nothing, so the Verification Contract asserts the rendered aspect instead. The `learnings-researcher` pass recommended keeping `520 / 400`; that recommendation is rejected on this arithmetic.
- KTD4. **The change mark stays in column 0, unchanged.** Moving it into the app-owned 41st cell was recommended during research and is genuinely cleaner in principle, but it is blocked here: the mark is a child of `.text-frame__row`, whose box is the 40-cell page, and `.text-frame`'s `overflow: hidden` - which clips the row/run half-pixel bleed and must stay - would clip a mark placed at cell 40. Relocating it therefore needs a DOM change that lifts the mark out of the row, which also forfeits the row's `scaleY(2)` inheritance that makes a changed double-height line's mark two rows tall. That is a larger, behaviour-bearing change than this fix warrants. The accepted cost: on a row whose column 0 carries an asterisk, a refresh mark transiently overdraws part of that glyph for about 1.7s before fading.
- KTD5. **Verification is a browser measurement, not the test suite.** `src/index.css` is loaded by nothing the suite renders and `happy-dom` computes no layout, so a green `npm test` is silent about this change (see `docs/solutions/best-practices/the-suite-never-loads-the-stylesheet-so-a-green-run-is-silent-about-layout.md`). The Verification Contract names the numbers to assert in a real Chromium pass.

### High-Level Technical Design

Frame coordinates, in cells, under the new geometry:

```
cell width   = available width / 41
frame        = 0 .................................................. 41
page picture = 0 .......................................... 40        (flush left)
column 0     = 0 ..... 1                                              (broadcast, may carry a glyph)
full bar     =         1 .................................. 40
app margin   =                                             40 ..... 41
```

Left black = column 0 = 1 cell. Right black = the app's spare cell = 1 cell. Equal.

Measured at a 390px viewport on fixture pages 100, 104, 105, 331, and 377: left margin 9.45px, right margin 9.45px after the row/run bleed is clipped, cell width 9.463px against 9.700px full-bleed - a 2.44% reduction.

### Assumptions

- Bars span page columns 1-39 on every page. Measured across all five decodable fixture pages; every one reported a widest coloured run starting at column 1 and ending at the right edge of column 39.
- Column 0 carries characters on some pages but never on all. Confirmed in `fixtures/raw_104.json` (rows 13, 15) and `fixtures/raw_105.json` (row 10), and observed live on page 300.

### Sequencing

U1 before U2: U2's rules read the `--cell-w` and container that U1 establishes. U3 and U4 are documentation and independent of both.

---

## Implementation Units

### U1. Widen the frame to 41 cells

- **Goal:** Make `.frame` a 41-cell query container that owns the shared cell width, and size the reading-column cap to match.
- **Requirements:** R1, R3, R4
- **Dependencies:** none
- **Files:**
  - `src/index.css` (`:root --frame-max` and its comment, `.frame` and its comment, `.frame:has(.frame__gif)`)
- **Approach:**
  1. In `:root`, change `--frame-max`'s numerator from `520` to `533` (41 x 13). Keep the `560px` floor and `640px` ceiling.
  2. Correct the `--frame-max` comment block, which states the old geometry twice: "A frame is 520 x 400*leading" and "A frame is 520px by broadcast". A drawn frame is now 41 cells (533px); the picture inside it is still 520px. The floor and ceiling arguments are unchanged.
  3. On `.frame`, change `aspect-ratio` to `533 / calc(400 * var(--leading))`, add `container-type: inline-size`, and add `--cell-w: calc(100cqw / 41)`.
  4. On `.frame:has(.frame__gif)`, change `aspect-ratio` to `533 / 400` (KTD3).
  5. Rewrite the comment above `.frame`. It currently argues for full bleed and says giving the right side a cell "would cost every page a column of size" - that is the reasoning this change reverses, and leaving it would contradict the code beneath it.
- **Patterns to follow:** the existing `cqw`-derived cell math and the file's habit of explaining *why* a number is what it is.
- **Test scenarios:** Test expectation: none - no computed layout under `happy-dom` (KTD5). Verified per the Verification Contract.
- **Verification:** At a 390px viewport, `--cell-w` resolves to 9.463px and `.frame` is 388px wide.

### U2. Size the page layers to 40 cells, flush left

- **Goal:** Draw all three page layers - decoded text, GIF fallback, and the link layer - as a 40-cell box at the frame's left edge, so the spare 41st cell falls on the right.
- **Requirements:** R1, R2, R4, R5
- **Dependencies:** U1
- **Files:**
  - `src/index.css` (`.text-frame` and its comment, `.frame__gif`, `.hotspots`, `.text-frame__mark`'s comment)
- **Approach:**
  1. On `.text-frame`: remove `container-type: inline-size` and its own `--cell-w: 2.5cqw` declaration (both now live on `.frame`); replace `inset: 0` with `top: 0; bottom: 0; left: 0; right: auto; width: calc(var(--cell-w) * 40)`. Keep `overflow: hidden` - it clips the row/run half-pixel bleed, which is also what keeps the right margin exactly one cell.
  2. Correct `.text-frame`'s comment, which after step 1 names neither the right container nor the right fraction: `.frame` is the query container, one cell is 1/41 of it, and this box is 40 of those cells flush left.
  3. On `.frame__gif`: change from `display: block; width: 100%` to `position: absolute; left: 0; width: calc(var(--cell-w) * 40); height: 100%`, keeping `image-rendering: pixelated`.
  4. On `.hotspots`: replace `inset: 0` with the same `top/bottom/left/right/width` set as `.text-frame`. Do not touch `src/components/HotspotLayer.tsx` or `src/imageMap.ts` - their percentages are relative to this box, which is again exactly the 40-column picture.
  5. Correct `.text-frame__mark`'s comment (R6). It currently says column 0 is "the one cell SVT leaves blank on every page, so the mark costs no character and never sits on top of text" - the same false claim U3 removes from the design document, and it contradicts KTD4, which ships beside it. State instead that bars leave column 0 blank but text rows may use it for `*` markers, and record KTD4's accepted cost. Do not change the rule itself.
- **Patterns to follow:** U1's shared `--cell-w`; do not redeclare it in any of these three rules.
- **Test scenarios:** Test expectation: none for geometry (KTD5). The existing link-navigation tests in `src/app.test.tsx` must keep passing unmodified, which is what shows the hotspot click math was not disturbed.
- **Verification:** A full-width bar's left and right black margins are equal within a pixel; a column-0 asterisk on page 104 renders whole; a GIF-fallback page fills its frame with no letterbox band.

### U3. Correct the design document's premise

- **Goal:** Stop the design document and the component comment asserting the false premise that produced the reverted attempt.
- **Requirements:** R6
- **Dependencies:** none
- **Files:**
  - `misc/design/README.md`
  - `src/components/TextFrame.tsx` (comment only, no code change)
- **Approach:**
  1. Correct the claim that SVT "leaves column 0 blank on every page": bars leave it blank, but text rows use it for `*` markers that the page's own legend explains. Cite `fixtures/raw_104.json` rows 13 and 15 and `fixtures/raw_105.json` row 10.
  2. Mark the hang-and-clip geometry (MARGIN 0.42, -0.58 cell offset, 39.84 divisor) as withdrawn, and record that its rejection of the 41-cell box no longer holds.
  3. Do not rewrite the document into a new design. It is a historical handoff; correcting the false claim and marking the withdrawn geometry is the whole job.
  4. In `src/components/TextFrame.tsx`, correct the comment that states "Column 0 is blank on every SVT page". Comment text only - the mark's rendering is unchanged (KTD4).
- **Test scenarios:** Test expectation: none - documentation.
- **Verification:** No reader of the file can come away believing column 0 is always blank.

### U4. Supersede the withdrawn plan

- **Goal:** Stop `docs/plans/2026-09-05-1458-fix-frame-margins-plan.md` presenting itself as ready to implement.
- **Requirements:** R7
- **Dependencies:** none
- **Files:**
  - `docs/plans/2026-09-05-1458-fix-frame-margins-plan.md`
- **Approach:**
  1. Change its `artifact_readiness` from `implementation-ready` to `superseded`.
  2. Add a short note under the title: the premise was falsified, the work was reverted in `36413e0`, and this plan replaces it.
  3. Leave the rest of the document intact as the record of what was tried and why it failed.
- **Test scenarios:** Test expectation: none - documentation.
- **Verification:** Neither a human nor an agent picking the file up cold would start implementing it.

---

## Verification Contract

- `npm test` - must pass unmodified, including the link-navigation tests in `src/app.test.tsx`. Passing is necessary, not sufficient: it says nothing about layout (KTD5).
- `npm run build` - typecheck and production build must succeed.
- **Browser measurement** (Playwright 1.62.1 per `CLAUDE.local.md`, headless, against `npm run mock` + `npm run dev`). At a 390px viewport, assert:
  - `--cell-w` is 9.463px (`available/41`), against 9.700px before.
  - On pages 100, 104, 105, 331, and 377: the widest coloured run's left and right black margins are equal within 1px (expected 9.45px each).
  - On page 104: the column-0 `*` run starts at `.frame` + 0 and is fully inside the frame.
  - On a GIF-fallback page: `.frame__gif`'s rendered width/height equals 520/400 within a pixel - it is not stretched - and its height fills the frame exactly. Assert the ratio, not the absence of a gap: a gap assertion passes under both the old and new ratio and would prove nothing (KTD3).
  - A link's underline sits on its printed digits and clicking the digits navigates.

## Definition of Done

- U1-U4 landed. `src/index.css` is the only file whose behaviour changes; `src/components/TextFrame.tsx` receives a comment correction only.
- `npm test` and `npm run build` pass.
- Every browser measurement above matches its expected value.
- No dead CSS or stale comment left behind from the reverted attempt or from this one.

---

## Sources / Research

- Live measurement of fixture pages 100, 104, 105, 331, 377 in Chromium: coloured bars span page columns 1-39 on every page; the 41-cell geometry yields 9.45px margins on both sides.
- `fixtures/raw_104.json`, `fixtures/raw_105.json` - the column-0 `*` characters that falsify the design document's premise.
- `docs/solutions/best-practices/the-suite-never-loads-the-stylesheet-so-a-green-run-is-silent-about-layout.md` - why the suite cannot verify this change (KTD5).
- `docs/solutions/best-practices/a-half-pixel-bleed-only-works-between-siblings.md` - the row/run bleed is a fixed 0.5px and does not depend on column count, so it needs no change here.
- `docs/solutions/best-practices/a-blank-teletext-column-is-still-painted.md` - why the mark is the row's last child, which KTD4 preserves.
- `misc/design/README.md` - the withdrawn geometry and the source of the false premise.
