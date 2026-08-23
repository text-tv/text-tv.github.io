---
title: Crisp Text Rendering - Plan
type: feat
date: 2026-08-23
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: conversation
execution: code
---

# Crisp Text Rendering - Plan

## Goal Capsule

- **Objective:** Teletext pages render as real text in a teletext font, crisp at any size, instead of a bitmap that loses stroke weight whenever it is not drawn at a whole-number scale.
- **Means:** Decode each GIF into its 40x25 character grid, resolve every cell to a character through a checked-in glyph table, and render rows of coloured HTML text (KTD1, KTD2).
- **Authority hierarchy:** This plan's R-IDs and KTDs win. `CLAUDE.md` wins on code style, API conventions, and test strategy.
- **Stop conditions:** Stop and report if the target browsers cannot give pixel data back for a decoded frame — no `createImageBitmap`, or `getContext('2d')` returning null.
- **Execution profile:** Work happens on `feat/crisp-text-rendering`. Commit after each unit.
- **Tail ownership:** The calling pipeline owns shipping.

## Product Contract

### Summary

SVT serves each teletext page only as a 520x400 GIF, drawn today at `width: 100%` in a column capped at 560px with `image-rendering: pixelated`.

The frame is almost never drawn at a whole-number multiple of its native size — 2.25x on a 390px column at device pixel ratio 3, 1.077x on a 560px desktop column at ratio 1, below 1x in a narrow window. Because `pixelated` snaps each source pixel to whole device pixels, a non-integer scale gives neighbouring source pixels different widths: a two-pixel stem lands on four device pixels in one glyph and six in the next. Below 1x whole columns are dropped and strokes disappear. Uneven stroke weight across a line of type is what reads as "not crisp".

This change renders the page as text. Each sub-page is decoded once into its 40x25 grid of teletext cells; each cell yields a foreground colour, a background colour, and a 13x16 glyph bitmap. That bitmap is looked up in a checked-in table to get the character it draws. The page then renders as 25 rows of `<span>`s in a teletext font, coloured with CSS — real text, laid out on the same geometry, sharp at every size and at every zoom level.

### Problem Frame

The complaint is legibility. The retro look is wanted; the uneven strokes are not. Rendering the characters rather than a picture of them fixes the cause instead of the symptom, and it makes the page selectable and readable by a screen reader as a side effect.

### Key Decisions

- **KTD1: Resolve characters from the GIF's glyph bitmaps, not from `altText`.** (user-directed direction, planner-settled mechanism, over reading the text straight out of `altText`: `altText` does not map onto the grid. Page 100 has 30 lines for 25 rows — a double-height headline is one line covering two grid rows, and short lines such as the `106-111` page references occupy a row without filling it. Measured, aligning `altText` to rows recovers 84% of non-blank rows and silently misplaces the rest. The cell bitmaps map one-to-one onto cells by construction, so they resolve every cell or none.) Governs R2, R3.
- **KTD2: Colours come from the decoded pixels.** (planner-settled: `altText` carries no colour at all, and teletext colour is per-cell. The pixels carry both content and colour exactly.) Governs R2, R4.
- **KTD3: The glyph table is generated at build time and checked in.** (planner-settled, over resolving glyphs at runtime: there are only 143 distinct glyph bitmaps across all 18 captured sub-pages, so the table is small, and a checked-in table means the runtime does a map lookup rather than character recognition. Labels are bootstrapped from the rows where `altText` does align, then completed by hand once.) Governs R3, U2.
- **KTD4: An unrecognised glyph falls back per cell, not per page.** (planner-settled, over failing the whole frame: the table is built from captured fixtures and live pages will eventually contain a glyph it has never seen. Drawing that one cell from the GIF keeps the rest of the page as text.) Governs R6.
- **KTD5: The font is supplied as a file in the repo; until it lands, the app falls back to the system monospace.** (user-directed: the user will provide an appropriate teletext font. The work assumes the glyph shapes are correct and that this plan only has to get colour, size, weight and underlining right. Nothing here depends on which font it is, so the font can land before or after this work.) Governs R5.
- **KTD6: Decoding happens in the browser at render time.** (planner-settled, over a build-time atlas of whole pages: pages are live and unbounded. `createImageBitmap` plus a canvas gives the pixels for any page. Canvas tainting is not a concern — `src/api.ts` builds the frame as a `data:` URL from the JSON payload, so the image never crosses an origin.) Governs R1.

### Requirements

**Decoding**

- **R1:** Each sub-page's GIF is decoded once into a 40x25 grid. Decoding produces no grid when the frame's natural size is not 520x400, when any cell carries more than two distinct colours, or when any step throws.
- **R2:** Each cell yields its background colour, its foreground colour, and a 13x16 one-bit glyph mask. A cell painted in a single colour is a blank cell in that colour.
- **R3:** Each cell's mask is resolved to a character through the checked-in glyph table.

**Rendering**

- **R4:** The page renders as 25 rows of text at the frame's native geometry — 40 columns of 13x16 cells across 520x400 — with each run of same-coloured cells one `<span>` carrying its foreground and background colour.
- **R5:** Text renders in the teletext font when present, falling back to the system monospace. Cell size is driven by the frame's rendered width so the grid always fills the same box the GIF occupies today.
- **R6:** A cell whose mask is not in the table renders that cell's bitmap from the GIF, leaving the rest of the row as text.
- **R7:** A double-height row renders as one row of text at twice the height, and the grid row beneath it is consumed rather than drawn.

**Preserved behaviour**

- **R8:** Link hotspots keep working, at the same coordinates.
- **R9:** The frame keeps its `520 / 400` aspect ratio and its place in the reading column; nothing above or below it moves.
- **R10:** When decoding produces no grid, the sub-page renders today's `<img>` unchanged.

### Out of Scope

- Changing the palette, the geometry, or the `--frame-max` cap.
- Sourcing or designing the font itself (KTD5).
- Rendering pages the API does not broadcast, or any change to `src/api.ts`.

## Planning Contract

### Research Findings

Confirmed against the captured fixtures with a throwaway decoder. Note `fixtures/raw_200.json` is a `status: fail` page carrying no frame, so five fixtures have GIFs, across 18 sub-pages.

- Every frame is 520x400, an exact 40x25 grid of 13x16 cells.
- No cell in any fixture carries more than two distinct colours, so R2's blank/background/foreground model holds. R1 still guards it, because the fixtures are a small sample of a live page space.
- 143 distinct non-blank glyph bitmaps across 18,000 cells; 18 of them appear only once.
- Teletext's eight-colour palette holds throughout. Page 100 uses five colours.
- Double-height rows appear as two consecutive grid rows carrying the top and bottom halves of one glyph, and `altText` emits them as a single line.
- Aligning `altText`'s lines to grid rows by blank-cell pattern recovers 267 of 317 non-blank rows (84%). The misses are concentrated on double-height rows and short lines, which is why KTD1 does not rely on it at runtime.

### Assumptions

- SVT keeps serving 520x400 GIFs. R1's size guard turns any change into the `<img>` fallback rather than a broken page.
- The supplied font has correct teletext letterforms, so this work only sets colour, size, weight and underlining (KTD5).
- The target browsers support `createImageBitmap` and 2D canvas `getImageData`. R10 covers the rest.

### Risks

- **Mosaic block graphics have no character.** Logos and charts are drawn with 2x3 sextant cells. If the supplied font lacks those glyphs they render as tofu. Mitigate by rendering a mosaic cell as a CSS 2x3 block grid rather than a character — exact, font-independent, and cheap. Decide this in U3 once the font is known; until then the R6 per-cell fallback covers them.
- **First-paint decode cost on multi-sub-page pages.** `PageView` renders every sub-page at once and page 331 has 14 — roughly 2.9M pixel reads on first paint. Memoisation prevents repeats but not the first pass, and `StrictMode` doubles it in development. Measure on page 331.
- **Glyph table coverage.** Built from 5 captured pages, so live pages will hit unknown glyphs. R6 bounds the damage to one cell; track how often it fires.

## Implementation Units

### U1 - Decode a GIF into a cell grid

`src/teletext/decode.ts` (new). Export an async `decodeFrame(dataUrl)` returning `{ cells }` or `null`.

Split the base64 payload off the data URL and decode it with `atob` into a `Uint8Array`, then construct the `Blob` directly — do **not** `fetch` the data URL. `src/test/setup.ts` runs msw with `onUnhandledRequest: 'error'`, which fails a `data:` fetch outright, and in production a fetch would route an image decode through the service worker for no reason.

Then `createImageBitmap`, draw to an `OffscreenCanvas` (falling back to a detached `<canvas>`), `getImageData`, and walk 40x25 cells of 13x16. Per cell, tally colours: one colour means a blank cell; two means the majority colour is the background and the other the foreground, with the mask set wherever the pixel is not the background; three or more means return `null` for the whole frame. Return `null` when the bitmap is not 520x400 or any step throws.

Own the cache here: a module-level `Map` keyed on the data URL.

Types in `src/teletext/types.ts`: `Cell { bg, fg, mask }` with `mask` a `Uint16Array` of 16 rows, 13 bits each, and `mask: null` for a blank cell.

### U2 - Generate the glyph table

`scripts/glyphs.mjs` (new), emitting `src/teletext/glyphs.generated.ts` — a map from a mask hash to `{ char, half }`, where `half` is `top`, `bottom`, or absent for a normal-height glyph.

Decode every fixture sub-page, collect the distinct masks (143 today), and label them: align `altText`'s lines to grid rows by blank-cell pattern, and where a row aligns, take each cell's character from the corresponding column. That labels the large majority automatically. Print the unlabelled masks as ASCII art for a one-time hand pass, and fail the script if any mask reaches the output unlabelled.

Add `npm run glyphs` to `package.json`. The script is dev-only; the generated table is checked in.

### U3 - Resolve a grid to characters

`src/teletext/resolve.ts` (new). Pure function taking a decoded grid and returning 25 rows of runs, each run carrying its text, foreground colour, background colour, and double-height flag. Hash each cell's mask, look it up, and group adjacent cells that share both colours into one run. A cell whose mask is not in the table is emitted as an unresolved run carrying the mask, for R6. A row whose cells are all `top` halves is marked double-height and the row beneath it dropped, per R7.

This is a pure module, so it is unit-testable per `CLAUDE.md`'s exception.

### U4 - Render the text

`src/components/TextFrame.tsx` (new). Renders a `<div>` at the frame's box holding 25 absolutely-positioned rows, each row a sequence of `<span>`s from U3's runs, coloured with inline `color` and `background-color`. Cell metrics come from CSS custom properties derived from the frame's rendered width, so the grid scales with the column. Double-height rows get twice the line height and font size. An unresolved run renders its cells as GIF-backed slices.

Font wiring lives in `src/index.css`: an `@font-face` for the teletext font with a `monospace` fallback, per KTD5.

### U5 - Wire it into the frame

`src/components/SubPageFrame.tsx`. Track three explicit states — **pending**, **resolved**, **failed**. Render `TextFrame` when resolved, the `<img>` only when failed, and hold the frame box empty while pending: rendering the `<img>` during the decode window would flash the blurry frame on every page load, and it would make R10's fallback untestable by making failure indistinguishable from not-yet-resolved.

Reset to pending when `subPage.gifDataUrl` changes, and drop results from a superseded URL in the effect's cleanup so a stale grid never paints under a new sub-page. `HotspotLayer` stays outside the branch so R8 holds on both paths. Keep `altText` on the container as the accessible name; the rendered text is now readable directly, so the label is a backstop rather than the only source.

### U6 - Tests

`src/app.test.tsx`, app-level with `msw` and the captured fixtures per `CLAUDE.md`. Cover: a broadcast page renders its headline as real text; hotspots still navigate; a frame that fails to decode falls back to the `<img>`.

Two test-environment facts shape the stub. happy-dom 20 returns `null` from both `OffscreenCanvas.getContext` and `HTMLCanvasElement.getContext` without a canvas adapter, and its `createImageBitmap` has no pixel backing, so the stub must cover the whole chain: override `createImageBitmap` to return a 520x400 stand-in, and patch both `getContext` implementations to return a fake 2D context exposing `drawImage` and `getImageData`. And Node has no image decoding, so rather than decoding a GIF at test time, commit a small precomputed decoded-grid fixture generated by `scripts/glyphs.mjs`'s decoder and have the stub replay it.

Unit-test `resolve`'s run grouping and double-height handling directly.

## Verification Contract

- `npm test` passes, including the new app-level cases and the `resolve` unit tests.
- `npm run build` passes typecheck and build.
- `npm run glyphs` regenerates the table with every mask labelled.
- `npm run dev` against the mock shows page 100 as selectable text in the teletext palette, at the same geometry as the GIF.
- Zooming the browser to 200% shows sharp type rather than magnified pixels.
- Page 331 (14 sub-pages) renders without a perceptible first-paint delay.

## Definition of Done

- Broadcast pages render as text; the `<img>` path appears only when decoding fails.
- Page text is selectable.
- Hotspot navigation, sub-page stacking, quick links, and the bottom bar are unchanged.
- The frame's aspect ratio, palette, and position in the reading column are unchanged.
- No new runtime dependency. A dev-only script under `scripts/` and the generated table are permitted.
