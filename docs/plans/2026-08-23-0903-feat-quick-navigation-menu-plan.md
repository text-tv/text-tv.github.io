---
title: Quick Navigation Menu - Plan
type: feat
date: 2026-08-23
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: legacy-requirements
execution: code
origin: misc/menu/README.md
---

# Quick Navigation Menu - Plan

## Goal Capsule

- **Objective:** A reader who has finished a page can reach any of SVT's nine published sections without typing digits.
- **Means:** A nine-item list rendered under the last frame inside the reading column, in the teletext palette (KTD1).
- **Authority hierarchy:** This plan's R-IDs and KTDs win. `misc/menu/README.md` is the origin design spec and wins on anything this plan does not state. The repo conventions in `CLAUDE.md` win on code style.
- **Stop conditions:** Stop and report if the design spec's stated visual gap cannot be reconciled with `.pages` layout (KTD2), or if adding the list breaks an existing test in `src/app.test.tsx` in a way that needs a product decision.
- **Execution profile:** Work happens on `main` (KTD5). Commit after each unit.
- **Tail ownership:** The calling pipeline owns shipping. No branch, no PR.

## Product Contract

### Summary

Add a fixed nine-destination shortcut list to the page view, directly under the teletext frames and inside the existing capped reading column. Each row is a `<button>` showing the page number in teletext yellow and the section name in cyan; tapping it navigates through the app's existing `onNavigate` path. The row matching the page on screen renders white. No heading, no drawer, no hierarchy.

### Problem Frame

The app's only ways to change page are the in-frame hotspots, the prev/next arrows, and typing a three-digit number. Reaching a section you are not already near means knowing its number and typing it. Meanwhile the space below the frame is blank on most pages, because a teletext frame is 520x400 and the reading column is taller than that.

### Key Decisions

- **Implement option 3c only.** (session-settled: user-approved — chosen over 3a pinned rail, 3b sheet behind the bottom bar, and 2a/2b system-styled lists: 3c is the approved option in `misc/menu/README.md`; the others are kept there for context only.) Governs R1, R2, R3.
- **The list is not a menu system.** No drawer, no hamburger, no hierarchy, no reordering, no configurability. Governs R1, R3.

### Requirements

**Destinations and copy**

- R1. The list renders exactly nine destinations, in this order: `100 NYHETER`, `300 SPORT`, `330 RESULTATBÖRSEN`, `377 MÅLSERVICE`, `400 VÄDER`, `500 BLANDAT`, `600 PÅ TV`, `700 INNEHÅLL`, `800 UR`.
- R2. Section names are uppercase in the source string, not via `text-transform`.
- R3. No section heading sits above the list.

**Placement and layout**

- R4. The list renders inside the existing `.pages` container, after the last `.frame`, so it inherits the column's `--frame-max` cap and centring and scrolls with the page.
- R5. The list is a two-column grid of five rows, read across then down. The nine destinations fill nine of the ten cells; the last cell is empty.
- R6. The gap between the last frame and the list is 14px below the 700px breakpoint and 16px at or above it (see KTD2 for how that total is composed).
- R7. At the 700px breakpoint the two font sizes, the column gap, the item gap, and the list's top gap (R6, composed per KTD2) change; nothing else does.

**Behaviour**

- R8. Activating a row navigates to that page through the same `onNavigate(pageNumber)` callback `HotspotLayer` and `BottomBar` use, so the hash route and the browser back button keep working.
- R9. The row whose number equals the page on screen carries `aria-current="page"`, and the white colour is driven off that attribute rather than a class.
- R10. The list renders only alongside a successful page result. The not-broadcast and transport-error views are unchanged.
- R11. Rows are real `<button>` elements inside `<nav aria-label="Genvägar">`, so tab order and Enter/Space work without extra handlers.
- R12. Rows have no pressed or flash state. Pointer devices may brighten the name on hover; nothing else changes.

### Scope Boundaries

- The `--frame-max` cap on `.pages` is out of scope — it already ships (see `src/index.css`, `--frame-max: 560px`).
- No new dependency, no CSS framework, no i18n framework.
- The nine destinations are a module-level constant. They are not fetched, not persisted, not user-editable.

#### Deferred to Follow-Up Work

- Horizontal padding on `.pages`. The list sits flush to the column edges on a phone, the same way the frames already do. Changing that is a column-wide decision, not a menu decision.

### Assumptions

- A1. The `:hover` brightening in R12 is implemented, guarded by `@media (hover: hover)`. The origin marks it optional; including it costs three lines and matches the design's pointer-device intent.
- A2. The navigation test uses `377 MÅLSERVICE` as its destination rather than the origin's suggested `300 SPORT`, because `fixtures/` holds `raw_377.json` but no `raw_300.json`. A destination with a fixture proves the whole path (hash change, fetch, frame render); an unfixtured one only proves the hash change.

### Sources

- `misc/menu/README.md` — the origin design spec. Palette, sizes, spacing, copy, and the component sketch. This is a local design bundle: `misc/` is untracked and gitignored, so the path resolves only in the working tree it was delivered to, not in a fresh clone.
- `src/index.css` — `--frame-max`, `.pages`, and the existing button conventions (`.bar__button`, `.hotspot`) this list mirrors.
- `src/components/HotspotLayer.tsx` — `MIN_TARGET_PX = 44`, the touch-target minimum R-side items match.
- `src/components/PageView.tsx` — the `.pages` container and the `onNavigate` prop already threaded down from `App`.
- `src/test/fixtures.ts` — `FIXTURE_PAGES = ['100', '104', '105', '200', '331', '377']`, the basis for A2.

## Planning Contract

### Key Technical Decisions

- KTD1. **Render the list as a sibling of the frames inside `.pages`, not as a new fixed or sticky region.** (session-settled: user-approved — chosen over a pinned rail or a sheet behind the bottom bar: those are options 3a and 3b, rejected in the origin.) It inherits the column cap and centring for free and needs no scroll or safe-area handling of its own. Instantiates the "implement option 3c only" Key Decision; governs R1, R2, R3, R4.
- KTD2. **Compose R6's gap from the existing `.pages` flex gap plus a small margin: `margin-top: 2px` below 700px and `4px` at or above it.** `.pages` is `display: flex; flex-direction: column; gap: 12px`, so 2 + 12 = 14px and 4 + 12 = 16px, which is what R6 states. The origin's CSS sketch writes `margin-top: 14px` / `16px`, which would stack on the flex gap and produce 26px / 28px; the origin's own closing note offers the 2px form as the alternative. R6 wins on the number.
- KTD3. **Drive the current-page colour off `[aria-current='page']`, not a modifier class.** One source of truth for "you are here", and the accessible name carries it too. Instantiates R9.
- KTD4. **Test at the app level in `src/app.test.tsx` with msw and the captured fixtures; do not unit-test `QuickLinks`.** `CLAUDE.md` names app-level testing as the repo convention and `src/imageMap.ts` as its one exception.
- KTD5. **Work on `main`; do not open a pull request.** (session-settled: user-directed — chosen over cutting a feature branch and opening a PR: the user directed it.) Commit after each unit.

### Implementation Constraints

- Plain hand-written CSS appended to `src/index.css`. BEM-ish class names matching the existing `.bar__button` / `.frame__gif` shape.
- All user-visible strings are Swedish and inline.
- Item `min-height: 44px`, matching `MIN_TARGET_PX` in `src/components/HotspotLayer.tsx`. No radii, borders, or shadows.
- Item gap is 8px below the 700px breakpoint and 10px at or above it (R7).
- Type is `ui-monospace, SFMono-Regular, Menlo, monospace` — the only monospace surface in the app besides the frames. The rule declaring it must reach the row's spans: a UA stylesheet sets `font` on every `button`, so inheritance stops at the row unless the row carries `font: inherit`, exactly as `.bar__input` already does in `src/index.css`.

### Sequencing

U1 then U2. U2 asserts behaviour U1 introduces.

## Implementation Units

### U1. QuickLinks component, styles, and page-view wiring

**Goal:** The nine shortcuts render under the frames on every successfully fetched page and navigate when activated.

**Requirements:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12; KTD1, KTD2, KTD3; A1.

**Dependencies:** none.

**Files:**
- `src/components/QuickLinks.tsx` (create)
- `src/index.css` (modify — append)
- `src/components/PageView.tsx` (modify)

**Approach:**
1. Create `QuickLinks` taking `current: PageNumber` and `onNavigate: (pageNumber: PageNumber) => void`. Hold the nine destinations in a module-level readonly constant of `[PageNumber, string]` pairs; the component keeps no state.
2. Render `<nav className="links" aria-label="Genvägar">` wrapping one `<button type="button">` per destination, each containing a number span and a name span. Set `aria-current="page"` on the matching row and leave it `undefined` otherwise (R9).
3. Append the `.links` block to `src/index.css`: a `1fr 1fr` grid with `column-gap: 16px` / `row-gap: 2px`, the monospace stack, and KTD2's `margin-top: 2px`. Style the row itself as a flex line with `gap: 8px`, `min-height: 44px`, `font: inherit`, left-aligned text, and the border / background / padding / tap-highlight resets the Implementation Constraints name. Style `.links__num` yellow with tabular numerals and `.links__name` cyan with `letter-spacing: .02em` and `white-space: nowrap`, both 15px. Add the `[aria-current='page']` white override, the `@media (hover: hover)` name brightening (A1), and a `@media (min-width: 700px)` block raising both sizes to 17px, `column-gap` to 24px, the row's own gap to 10px, and `margin-top` to 4px.
4. Render `<QuickLinks current={page.pageNumber} onNavigate={onNavigate} />` as the last child of `.pages` in `PageView`. `PageView` already receives both values; nothing new threads through `App`. R10 follows for free because `App` renders `PageView` only for `result.kind === 'page'`.

**Patterns to follow:** `src/components/HotspotLayer.tsx` for the transparent-button + `-webkit-tap-highlight-color: transparent` treatment and the 44px target floor; `src/components/BottomBar.tsx` for the `onNavigate` call shape; the existing `src/index.css` section comments for the one-comment-per-block style.

**Test scenarios:** covered in U2. This unit's own verification is visual and structural.

**Verification:** `npm run build` typechecks and builds. `npm test` still passes — in particular the `länkar i bilden` and `överlappande länkar` suites, whose `screen.getByLabelText('Sida NNN')` and `getAllByRole('img')` queries must not start matching the new buttons.

### U2. App-level coverage for the shortcuts

**Goal:** The navigation path and the current-page marking are pinned by tests in the repo's existing style.

**Requirements:** R1, R8, R9; KTD4; A2.

**Dependencies:** U1.

**Files:**
- `src/app.test.tsx` (modify)

**Approach:** Add one `describe` block in Swedish, alongside the existing `länkar i bilden` and `knapparna längst ned` blocks. Reuse the file's existing `openOn`, `currentPage`, and `frames` helpers and its msw server; add no new fixture and no new helper unless a scenario needs one.

**Test scenarios:**
- Opening page 100 renders all nine shortcut buttons, and the first reads `100` and `NYHETER`.
- Opening page 100 and clicking the `377 MÅLSERVICE` shortcut sets the hash to `#377`, moves the current-page indicator to `377`, and renders a frame from the `raw_377.json` fixture.
- After that navigation, the browser back button returns to page 100 — the shortcut goes through the hash route, not a direct state write.
- On page 100 the `100 NYHETER` row carries `aria-current="page"` and no other row does; on page 377 the `377 MÅLSERVICE` row carries it instead.
- Page 200 is not broadcast, so no shortcut buttons render — only the `Sidan ej i sändning` view.

**Verification:** `npm test` passes with the new block included, and the pre-existing suites are unmodified.

## Verification Contract

| Gate | Command | Applies to | Signal |
|---|---|---|---|
| Typecheck and build | `npm run build` | U1, U2 | `tsc -b` clean, Vite build succeeds |
| Test suite | `npm test` | U1, U2 | Vitest exits 0; no pre-existing test changed to accommodate the new markup |

No new dependency may appear in `package.json`.

## Definition of Done

**Global**

- All nine destinations render in the specified order and copy, under the frames, inside the capped column.
- Activating a shortcut navigates through the hash route; the back button returns to the previous page.
- The current page's row carries `aria-current="page"` and renders white.
- `npm run build` and `npm test` both pass.
- No dead code from abandoned attempts remains in the diff.
- Each unit is committed on `main`. No branch, no PR (KTD5).

**Per unit**

- U1: the component, its styles, and the `PageView` wiring exist and the existing suite is green.
- U2: the new `describe` block covers every scenario listed above and passes.
