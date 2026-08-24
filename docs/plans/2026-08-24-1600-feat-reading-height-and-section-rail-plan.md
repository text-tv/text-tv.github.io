---
title: Reading-Column Height and the Sliding Section Rail - Plan
type: feat
date: 2026-08-24
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: misc/design/README.md
execution: code
---

# Reading-Column Height and the Sliding Section Rail - Plan

## Goal Capsule

- **Objective:** Apply the three agreed changes from the designer's handoff: airier rows, a frame sized by the height it is given rather than a fixed width cap, and the nine section shortcuts as a sliding rail pinned above the bottom bar.
- **Means:** `--leading` to 1.5 (KTD1); `--frame-max` derived from `--viewport-height` (KTD2); `QuickLinks` moved from `PageView` into `App` and restyled `.links*` → `.rail*` (KTD3).
- **Authority hierarchy:** `misc/design/README.md` wins on spacing, sizing arithmetic, rail geometry, colours and type. This plan's KTDs win on how that lands in the codebase. `CLAUDE.md` wins on code style and test strategy.
- **Stop conditions:** None.
- **Execution profile:** Work happens on `main`, at the user's explicit direction. No branch, no PR. Commit as you go.
- **Tail ownership:** The calling pipeline owns shipping.

## Product Contract

### Summary

`misc/design/README.md` is a designer handoff for the SVT Text wrapper, agreed and high fidelity for everything it covers. It asks for three things.

**Row spacing.** `--leading` goes 1.26 → 1.5. Every other grid number is derived from it, so columns, mosaics, GIF slices and hotspots do not move; `.frame`'s `aspect-ratio: 520 / calc(400 * var(--leading))` picks the new value up on its own.

**Frame sizing.** Today `--frame-max: 560px` is a fixed width cap. Where the height binds — iPad, landscape phone, desktop — the frame stops at 560px and wastes the rest of the screen. Replace the constant with a budget: the viewport height minus the three bands of chrome, converted to the width that height allows for a 520 × 400·leading frame. Where the width binds (portrait phones) the column's own 100% is smaller and nothing changes.

**The rail.** The two-column `.links` block currently sits *inside* `.pages`, so it scrolls with the frames and disappears on a long page. It becomes a horizontally scrolling row of the same nine sections, pinned directly above `.bar`, in the frames' own palette — chrome rather than page content. This is the pattern svt.se/text-tv uses in mobile view.

The design files in `misc/design/` are references written in HTML, not production code. Their page body is a hand-transcribed approximation of one teletext page, low fidelity by design; the real rendering already exists and is untouched.

### Requirements

- **R1** — Teletext rows are drawn at leading 1.5, with columns, mosaics, GIF slices and hotspots landing exactly where they land today.
- **R2** — On a viewport where the height binds, the frame grows past 560px to fill the height it is given, and the bottom bar's controls stay optically aligned with it wherever the bar has room for it.
- **R2a** — The reading column and the bar's controls stay usable at every viewport, including a landscape phone and a portrait phone with the keypad open, and are never narrower than they were before this change.
- **R3** — On a portrait phone, where the width binds, the frame's width is unchanged.
- **R4** — The frame and the shell never overflow the visual viewport: no page-level scrollbar appears because the chrome constants under-report the real chrome height.
- **R5** — The nine section shortcuts are reachable from any page without scrolling the page content, and do not scroll away with the frames.
- **R6** — The rail scrolls horizontally, clipping at the right edge with no fade, arrow, snapping or animation; the cut-off item is the affordance.
- **R7** — The rail keeps today's data, semantics and spelling: the nine `LINKS`, `aria-label="Genvägar"`, `aria-current='page'` on the page you are on, real `<button>`s in a `<nav>`, capitals in the source.
- **R8** — Tapping a rail item navigates exactly as the old list did.
- **R9** — When the keyboard opens, the frame shrinks with `--viewport-height` rather than the shell scrolling away.

### Out of scope

- Any change to `src/teletext/*` or `src/components/TextFrame.tsx`. The page rendering is correct and must not be reverse-engineered from the mock.
- Porting anything from `misc/design/*.dc.html` or `support.js`.
- A type-face change. Inconsolata stays (KTD0).

## Key Technical Decisions

**KTD0 — Inconsolata stays.**
*Decision:* No font change. *Provenance:* user-approved. *Rejected:* Martian Mono, Azeret Mono, VT323. *Reason:* the designer evaluated all three and found them harder to read at teletext cell size.

**KTD1 — `--leading: 1.5`, and nothing else in the grid moves.**
*Decision:* Change the one custom property. *Provenance:* user-approved. *Rejected:* 1.26, or anything above ~1.8. *Reason:* 1.4–1.6 is comfortable; above ~1.8 the `scaleY(2)` double-height rows look visibly stretched. `--cell-h`, `.frame`'s aspect ratio and every derived offset already read the property, so one edit is the whole change.

**KTD2 — `--frame-max` is derived from `--viewport-height`, and the chrome constants are made true by pinning the bands' heights.**
*Decision:* Introduce `--rail-height` (44px, 48px ≥700px) and `--freshness-height` (26px), subtract them plus `--bar-height` and both safe-area insets from `--viewport-height` to get `--frame-budget`, then `--frame-max: calc(var(--frame-budget) * 520 / (400 * var(--leading)))`. Give `.freshness` and `.rail` those heights as declared `height`, rather than letting content decide.
*Provenance:* user-approved arithmetic; the pinning is this plan's.
*Rejected:* measuring the freshness bar in JavaScript and publishing a fourth custom property.
*Reason:* the handoff warns that if the real freshness height differs from the constant the frame gains a scrollbar (R4). Declaring the height makes the constant true by construction, with no measurement, no new hook and no layout thrash. `.freshness` is a fixed-size 12px line, so pinning it changes nothing visually.
*No desktop ceiling.* The handoff's `min(…, 900px)` is a "consider", explicitly a case the designer has not seen, and its implementation block leaves the value unbounded. Left unbounded; recorded as a residual.

**KTD3 — `QuickLinks` is rendered by `App`, driven by the hook's `pageNumber`.**
*Decision:* `PageView` stops rendering it; `App` renders `<QuickLinks current={pageNumber} onNavigate={navigate} />` between `</main>` and `<BottomBar …>`. The component keeps its data and semantics and changes only its class names, `.links*` → `.rail*`. The old `.links*` rules are deleted.
*Provenance:* user-approved.
*Rejected:* leaving the block inside `.pages`.
*Reason:* it is chrome now, not page content: it must not scroll away, and it fills black that was previously empty.
*Consequence, and the one behaviour change in this plan:* the rail is now present on every result — including a not-broadcast page and a transport error — because it is shell, not page. `current` comes from the hook rather than from a loaded page, so it is still correct on those results. The existing test asserting the shortcuts are absent on a page that is not broadcast (`visas inte för en sida som inte sänds`) inverts: they are now present, and that is the point of the change. This is the handoff's stated intent, not a conflict with it.

**KTD4 — No scroll-into-view on the rail.**
*Decision:* Do not scroll the current item into view when the page changes. *Provenance:* the handoff marks it "nice-to-have, not required". *Rejected:* `scrollLeft` arithmetic in a `useEffect`. *Reason:* it adds a ref, an effect and a test surface for an unrequired refinement; `scrollIntoView` is forbidden outright because it moves the whole shell. Recorded as a residual.

**KTD5 — the old 560px cap becomes the floor, for the column and the bar alike.**
*Decision:* `--frame-max` is `clamp(560px, calc((--frame-budget - 2px) * 520 / (400 * --leading)), 900px)`. `.pages` and `.bar__inner` both keep their plain `max-width: var(--frame-max)`.
*Provenance:* this plan's, revised after code review.
*Rejected:* leaving `--frame-max` unfloored, and the earlier draft of this KTD, which floored only `.bar__inner` at 320px and let the column collapse.
*Reason:* a height-derived cap collapses where a fixed one could not. A landscape phone leaves roughly 264px of budget, so an unfloored `--frame-max` lands near 229px — narrower than the type can be read at, and *narrower than the same phone got before this change*. Shorter still — a landscape phone with the keypad up — drives the budget negative, `max-width` clamps it to zero, and the page goes blank. Flooring at the old cap means the budget can only ever make the column wider than it used to be, so no screen regresses: R3 holds everywhere rather than just in portrait, R2 still grows the frame on an iPad, and where the floor binds the page scrolls, which is exactly what those screens did before. It also keeps the bar and the column identical at every size, so R2's optical alignment needs no exception. The 2px of slack keeps a fractional column width from rounding into a scrollbar on the one screen the budget was meant to fit exactly. The 900px ceiling is the same argument at the other end: a frame is 520px by broadcast, so beyond that the cells only magnify, and a tall desktop window would otherwise draw the page at more than twice native size.

## High-Level Technical Design

Three layers, in dependency order.

**CSS tokens (`src/index.css`).** `:root` gains `--rail-height` and `--freshness-height` and turns `--frame-max` from a constant into a two-step calc through `--frame-budget`. `--viewport-height` already exists with its `100vh`/`100dvh` fallback ladder, so the budget degrades sensibly where `visualViewport` is absent. The `@media (min-width: 700px)` block that today widens `.links` carries the handoff's wider rail gap and larger rail type, and additionally raises `--rail-height` to 48px — which feeds back into `--frame-max` automatically, since the budget is a calc over the property and custom-property substitution takes the cascade-winning value regardless of source order.

**Shell structure (`src/App.tsx`, `src/components/PageView.tsx`).** The rail is a third band in `.app`'s column flex, between the `flex: 1` `.content` and `.bar`. `.content` stays the only *vertical* scroll container; the rail scrolls only sideways. `PageView` loses one import and one element and becomes purely the sub-page stack.

**Rail presentation (`src/index.css`, `src/components/QuickLinks.tsx`).** `.rail` is a flex row with `overflow-x: auto`, `overscroll-behavior-x: contain`, hidden scrollbars in both engines, the frames' face at `font-stretch: 150%`, and a `#1c1c1c` hairline top border matching `.bar`'s. `.rail__item` is `flex: 0 0 auto` with `align-self: stretch` so the whole band is the tap target — up from the old 30px, which was a deliberate compromise that the move makes unnecessary. Stretch rather than the handoff's `min-height: var(--rail-height)`: `* { box-sizing: border-box }` is global, so the hairline top border leaves the rail a 43px content box and an item asking for 44px would overflow it by half a pixel at each end. Colours are the teletext palette: `#ffff00` numbers, `#00ffff` names, `#fff` for `aria-current='page'`. The rail spans the full viewport width, unlike the other two chrome bands; `.pages` and `.bar__inner` keep following `--frame-max`.

The component's doc comment describes the old placement ("under the frames") and must be rewritten to describe the rail.

## Implementation Units

**U1 — Leading.**
`src/index.css`: `--leading: 1.26` → `1.5`, and update the property's comment if it names the old value. Nothing else.

**U2 — Height-bound frame width.**
`src/index.css`: add `--rail-height: 44px` and `--freshness-height: 26px` to `:root`; add `--frame-budget`; redefine `--frame-max` as the derived width. Replace the old `--frame-max` comment with one explaining the budget and why width still wins on a phone. Give `.freshness` `height: var(--freshness-height)` and `align-items: center` (its 6px block padding becomes redundant; keep the inline padding). `.pages` keeps its `max-width: var(--frame-max)` declaration unchanged; `.bar__inner`'s becomes `max-width: max(var(--frame-max), 320px)` (KTD5).

**U3 — Move the rail out of the page.**
`src/components/PageView.tsx`: drop the `QuickLinks` import and element.
`src/App.tsx`: render `<QuickLinks current={pageNumber} onNavigate={navigate} />` between `</main>` and `<BottomBar …>`.

**U4 — Rail markup and styles.**
`src/components/QuickLinks.tsx`: `links` → `rail`, `links__item` → `rail__item`, `links__num` → `rail__num`, `links__name` → `rail__name`; rewrite the doc comment for the new placement. Data, `aria-label`, `aria-current`, capitals and the literal space between the two spans are unchanged.
`src/index.css`: replace the `.links*` block — including its `@media (hover: hover)` and `@media (min-width: 700px)` rules — with the `.rail*` rules from the handoff, and add `--rail-height: 48px` to the ≥700px block.

**U5 — Tests.**
`src/app.test.tsx`: rename the `genvägarna under bilden` group to match the new placement. Invert `visas inte för en sida som inte sänds` — both its name, to `visas även för en sida som inte sänds`, and its assertion: the rail *is* present on a page that is not broadcast, with `aria-current` on no item (200 is not one of the nine). The remaining five tests are unchanged — they address the rail through `getByLabelText('Genvägar')` and button names, both of which survive.

## Test Scenarios

Tested at app level with `msw` and the captured fixtures, per `CLAUDE.md`. No unit tests for components.

- **T1 (R7, R8)** — The five existing shortcut tests still pass unchanged: the nine names in order, navigation on tap, the back gesture, `aria-current` on the page you are on, and `aria-current` moving when you change page.
- **T2 (R5, KTD3)** — Opening `200` shows `Sidan ej i sändning` *and* the `Genvägar` nav. Replaces today's inverted assertion. The transport-error result takes the rail by the same structural route — the rail is a sibling of `.content` — so it is covered by T3 rather than by a second result-specific test.
- **T3 (R5)** — The rail is not inside `.pages`: `screen.getByLabelText('Genvägar')` is not a descendant of the element the frames are in.
- **T4** — `npm run build` typechecks clean and `npm test` is green.

R2a is checked the same way as R2/R3, in `npm run preview` at a landscape phone viewport and with the number input focused.

CSS-only requirements (R1–R4, R6, R9) are not asserted in jsdom — it computes no layout and resolves no `calc`. They are verified by reading the arithmetic and, for R2/R3, by `npm run preview` at a phone and an iPad viewport.

## Risks

- **The freshness bar's real height.** Mitigated by KTD2's pinning rather than left to a constant.
- **Sub-page stacks.** A page with several sub-pages still stacks them in `.content` with the 12px gap; only the first frame fits the budget exactly. Correct, and stated by the handoff.
- **iOS keyboard.** `--viewport-height` shrinks when the number input opens, so `--frame-budget` and the frame shrink with it. The handoff asks that this be checked for a distracting jump, with "freeze `--frame-max` while the input has focus" as the fallback. Not implemented up front; recorded as a residual for a device check.

## Residuals

1. Scroll the current rail item into view on page change — not implemented (KTD4).
2. iOS keyboard frame jump — needs a device check. KTD5's floor removes it on a portrait phone (the budget stays above 560px with the keypad up, so the viewport's own width still binds and nothing moves); the check is about tablets and landscape.
3. Rail names in title case rather than capitals — capitals kept, designer's call, one-line change.
