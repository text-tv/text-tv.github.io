---
title: Unseen Characters Read from the Page's Own Alt Text - Plan
type: fix
date: 2026-08-24
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: conversation
execution: code
---

# Unseen Characters Read from the Page's Own Alt Text - Plan

## Goal Capsule

- **Objective:** A character the shipped glyph table has never seen still renders as text, in the page's own font, alongside its neighbours — the `é` in "Alex Norén" on page 300 is a letter, not a blurred cut-out of the GIF.
- **Means:** Label an unresolved cell from the sub-page's own `altText`, aligned to the grid at run time under the same guardrails the build-time table already uses (KTD1, KTD2).
- **Authority hierarchy:** This plan's R-IDs and KTDs win. `CLAUDE.md` wins on code style and test strategy.
- **Stop conditions:** None.
- **Execution profile:** Work happens on `main`, at the user's explicit direction. No branch, no PR, no commit.
- **Tail ownership:** The calling pipeline owns shipping.

---

## Product Contract

### Summary

Teach the renderer to read the response's `altText`. When a cell's bitmap is absent from `src/teletext/glyphs.generated.ts`, align that display row against the sub-page's `altText` and take the character from the column it lands on. The GIF cut-out stays, but only for cells no alignment can name.

### Problem Frame

`altText` is read at build time and nowhere else. `scripts/glyphs.mjs` aligns each captured page's `altText` lines to its grid rows, votes every 13x16 bitmap onto a character, and emits `src/teletext/glyphs.generated.ts`. At run time `src/teletext/resolve.ts` resolves a cell purely by `GLYPHS[maskKey(mask)]`, and never looks at the `altText` sitting in the same response.

So the table covers exactly the characters that happened to appear in `fixtures/` — 80 of them. `é`, `è`, `É`, `!`, `%`, `'`, `;` and `<` are not among them. Each one becomes an `unknown` run that `src/components/TextFrame.tsx` paints as a slice of the source GIF: a blurred, differently-weighted glyph sitting inside a line of sharp text. Confirmed on live page 300, where `altText` line 17 holds `é` at column 30 and no table entry exists for its bitmap.

Widening the fixture corpus would cover `é` and leave the next unseen character broken. The answer is already in the payload.

### Key Decisions

- **Read unknown cells from the sub-page's own `altText` rather than only widening the captured corpus.** The response carries the characters; a corpus fix covers one character and expires. `session-settled: user-directed.` Governs R1, R2.
- **The GIF cut-out survives as the last resort.** A row that cannot be aligned unambiguously is not guessed at — a wrong letter reads as correct and is worse than a visible blur. Governs R4, R5.

### Requirements

- R1. A cell whose bitmap is absent from the glyph table renders as the character at its column in the sub-page's `altText`.
- R2. A character recovered this way joins its neighbours in the same text run, taking the cell's own foreground and background.
- R3. A double-height display row is labelled from the single `altText` line that describes it, as its two grid rows carry one line of text.
- R4. A display row whose occupancy matches no `altText` line, or matches more than one, labels nothing; its unresolved cells stay GIF cut-outs.
- R5. An `altText` line may only label a display row below the one its predecessor labelled; a line that would go level or backwards labels nothing.
- R6. An unresolved cell on a row with no aligned line, or whose aligned column holds a space, stays a GIF cut-out — a blank label is no label.
- R7. Cells the table already knows keep resolving from the table; `altText` is consulted only where the lookup misses.
- R8. `scripts/glyphs.mjs` produces a byte-identical `src/teletext/glyphs.generated.ts` after the change — `npm run glyphs:check` passes with the committed table untouched.
- R9. An aligned line is used only when it agrees with every character the table already knows on that row; on any disagreement the whole line is discarded and the row's unresolved cells stay GIF cut-outs.

### Acceptance Examples

- AE1. **Covers R1, R2.** Given live page 300, whose row 15 draws `  Ingen tourfinal för Alex Norén.... 306` and whose `é` bitmap is not in the table, when the frame resolves, then column 30 renders the character `é` inside the run that holds `Norén`, not as an `unknown` run.
- AE2. **Covers R4.** Given a frame row carrying a mosaic, whose `altText` line spaces the mosaic out and so matches no display row's occupancy, when the frame resolves, then any unresolved cell on that row stays an `unknown` run.

### Scope Boundaries

- No cross-frame memory. A character learned from one sub-page's `altText` is not carried to the next; every frame resolves from its own payload. A session-wide cache would rescue cells on rows that cannot be aligned, and it would also let one mislabel poison the rest of the session. Deferred, not rejected.
- No change to `scripts/glyphs.mjs`'s voting, overrides, or output. The build-time table stays exactly as it is (R8).
- No new fixtures. `fixtures/raw_*.json` and `fixtures/glyphs/` both feed the glyph corpus, so a captured page containing `é` would teach the table the character and silently retire the very fallback under test.
- No full monotone line-to-row assignment. R9 stops a displaced line from mislabelling a row, but does not give that row its own line back: both are refused and the cells stay cut-outs. Recovering the displaced line needs `align.js` to solve the assignment across all matching lines at once, not pairwise against the previous match. Deferred, not rejected.

### Sources

- `src/teletext/resolve.ts:120-140` — the lookup that misses and emits the `unknown` run.
- `scripts/glyphs.mjs:128-160` (`displayRows`) and `:195-225` (the alignment and voting loop) — the guardrails this plan reuses.
- `src/teletext/mask.js` — the existing precedent for a plain-JS module shared by the Node build script and the browser runtime.
- Measured across all 109 captured sub-pages on 2026-08-24, not inferred from one page: **1357 of 1959 drawn display rows (69.3%)** align to an `altText` line, covering **30999 of 42640 drawn cells (72.7%)**. So the fallback names roughly three quarters of unseen characters; the rest — mostly logo and mosaic rows, whose `altText` is spaced out — keep the GIF cut-out. An earlier draft of this plan cited "12 of 14 lines on page 300", which was a single hand-checked page reported as though it generalised.
- Over the same corpus, every one of those 30999 aligned positions where the table already knows the character agrees with the `altText` character — 0 disagreements. That is the evidence R9's check is a safety net rather than a behaviour change: it discards 0 of the 1357 currently-aligned rows.
- Verified against live `https://www.svt.se/text-tv/api/300` on 2026-08-24: the page's single unresolved cell, the `é` of "Norén", now renders as text.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Align at run time inside `resolvePage`, keyed off a lookup miss.** `resolvePage` already builds the display rows and already knows which cells miss the table, so the labelling costs one alignment pass per frame and no second traversal. Alternative rejected: labelling in `SubPageFrame` after the fact, which would have to rediscover the row structure. Implements Key Decision 1.
- KTD2. **Extract the alignment into `src/teletext/align.js`, imported by both `scripts/glyphs.mjs` and `src/teletext/resolve.ts`.** Plain JS, alongside `src/teletext/mask.js`, for the same reason that module is plain JS: build time and run time have to agree, and one copy is the only way to keep them equal. The shared function takes the display rows' occupancy plus the `altText` and returns one line per display row or `null`; neither side passes bitmaps, so it stays free of both `Cell` and the script's mask arrays.
- KTD3. **`resolvePage(cells, altText?)` takes the text as a second, optional argument.** Its only caller is `src/components/SubPageFrame.tsx`, which already holds `subPage.altText`. Optional keeps `src/teletext/resolve.test.ts`'s existing cases untouched and keeps the no-alt-text path honest.
- KTD4. **A labelled cell goes through `RowBuilder.char`, the same entry the table's own characters use.** That is what makes R2 fall out rather than needing its own merging rule.
- KTD5. **The table checks the alignment (R9).** Occupancy is a weak key: a line whose own row carries a mosaic can never match that row, but it can be the single best fit for a row further down, which it then claims — pushing that row's real line out as out-of-order and rendering confidently wrong letters, the exact outcome Key Decision 2 forbids. The cells the table already resolves are free ground truth, so a line that contradicts them is not this row's line. Rejected alternative: a full monotone assignment of all matching lines in `align.js`, which would also *recover* the displaced line rather than only refusing the wrong one — more correct, more machinery, and deferred (see Scope Boundaries).

### High-Level Technical Design

```
decodeFrame(gif) ──► Cell[] ──┐
                              ├──► resolvePage(cells, altText) ──► DisplayRow[]
subPage.altText ──────────────┘         │
                                        ├─ 1. build display rows (unchanged)
                                        ├─ 2. alignAltText(occupancy[], altText)  ◄── src/teletext/align.js
                                        │       └─ unique occupancy match + forward-only order
                                        └─ 3. per cell: GLYPHS[key]
                                                 ├─ hit      ──► char run
                                                 ├─ mosaic   ──► mosaic run
                                                 └─ miss     ──► aligned line?
                                                                  ├─ non-space char ──► char run
                                                                  └─ otherwise      ──► unknown run (GIF slice)

scripts/glyphs.mjs ──► alignAltText(...) ──► votes ──► glyphs.generated.ts   (same output as today)
```

### Assumptions

- Occupancy is a sound alignment key: a cell is non-blank exactly where its `altText` column is not a space. This is what `scripts/glyphs.mjs` already relies on across 109 captured sub-pages, and what the page 300 prototype confirmed.
- `altText` lines are in display order. The forward-only rule (R5) is the existing defence against the cases where they are not.

### Sequencing

U1 extracts the shared module with the build script's behaviour pinned by `npm run glyphs:check`. U2 consumes it at run time. U3 covers the new behaviour. U1 before U2; U3 after both.

---

## Implementation Units

### U1. Extract the alt-text alignment into a shared module

- **Goal:** One implementation of the alignment, imported by the build script and available to the runtime, with the generated table unchanged.
- **Requirements:** R5, R8
- **Files:** `src/teletext/align.js` (new), `src/teletext/align.d.ts` (new), `scripts/glyphs.mjs`
- **Approach:** Move the occupancy match, the uniqueness test, and the forward-only ordering out of `scripts/glyphs.mjs` into `alignAltText(occupancies, altText, cols)`, returning an array parallel to `occupancies` holding each display row's padded line or `null`. Keep the mask-to-occupancy step and the vote counting in the script — the shared module sees booleans and text only (KTD2). Type it in a hand-written `.d.ts`, as `src/teletext/mask.js` is. The script keeps reporting rejected lines and votes; take those counters from the returned mapping.
- **Test Scenarios:** `npm run glyphs:check` passes against the committed `src/teletext/glyphs.generated.ts`, and the script's summary still reports 162 glyphs, 130 auto-labelled, 0 rejected lines.
- **Verification:** `npm run glyphs:check && npm test`

### U2. Label unresolved cells from the sub-page's alt text

- **Goal:** An unseen character renders as text in the page's own font.
- **Requirements:** R1, R2, R3, R4, R6, R7
- **Files:** `src/teletext/resolve.ts`, `src/components/SubPageFrame.tsx`
- **Approach:** Give `resolvePage` an optional `altText` (KTD3). Build the display rows first, collect their occupancy — a double-height row's occupancy is the union of its two grid rows, as `scripts/glyphs.mjs` already computes it (R3) — and call `alignAltText`. In `resolveRow`, when the glyph lookup misses, read the row's aligned line at that column; a non-space character goes to `RowBuilder.char` with the cell's own colours (KTD4), anything else keeps the `unknown` run. Pass `subPage.altText` from `SubPageFrame`.
- **Test Scenarios:** Covered by U3.
- **Verification:** `npm run build && npm test`

### U3. Cover the fallback and refresh the wording

- **Goal:** The new behaviour and its refusals are pinned by tests, and the docs no longer say an unseen bitmap always costs a cell.
- **Requirements:** R1, R2, R3, R4, R5, R6
- **Files:** `src/teletext/resolve.test.ts`, `src/test/canvas.ts`, `src/app.test.tsx`, `CONCEPTS.md`, `README.md`
- **Approach:** Extend the existing `resolvePage` suite — a pure module, which `CLAUDE.md` permits unit-testing — reusing its `UNSEEN` mask and Swedish test names: a labelled cell merged into its neighbours' run (R1, R2), the same at double height (R3), a line fitting two rows and a line that would go backwards (R4, R5), and the existing no-alt-text case as the `unknown` path (R6). Then prove it at app level, where `CLAUDE.md` wants the behaviour tested: today's `addUnknownCell` blanks the top-left cell, which changes its row's occupancy and so tests the refusal rather than the fallback. Add `addUnseenCell`, which rewrites the first cell the page *draws*, leaving occupancy intact so the row still aligns, and assert page 100 renders with no slice at all. Then correct `CONCEPTS.md:21` and `README.md:105`, which both state that an unseen bitmap falls back to a picture.
- **Test Scenarios:** As above. The app-level test fails without U2 — verified by stubbing the label out.
- **Verification:** `npm test && npm run build`

---

## Verification Contract

- `npm test` — Vitest, once. The whole suite, including `src/app.test.tsx` at the app level with msw.
- `npm run build` — `tsc -b` then the production build. The `resolvePage` signature change is a typecheck concern.
- `npm run glyphs:check` — proves U1 left the generated table byte-identical (R8).
- Manual: `npm run dev` against the mock renders the fixture pages unchanged. Page 300 against the live API is the `é` case, but it is a live page and will move; the U3 tests are the durable proof.

## Definition of Done

- Every requirement R1-R8 holds.
- `npm test`, `npm run build`, and `npm run glyphs:check` all pass.
- `src/teletext/glyphs.generated.ts` is unmodified.
- No fixture was added or changed.
- No prototype, probe, or scratch file remains in the repo.
- The tree is left uncommitted at a coherent stopping point, on `main`, for the user to review.
