---
title: Refresh a Page - Plan
type: feat
date: 2026-08-26
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: misc/design/README.md
execution: code
---

# Refresh a Page - Plan

## Goal Capsule

- **Objective:** Give the reader two ways to ask SVT for the page again — a ↻ button in the bottom bar and a pull down from the top of the page — and mark, for 1.7s, the rows that came back different. Today `reload()` exists but only `TransportError` reaches it, so a refresh is available only after a failure, and pages that are read *because* they change (377 Målservice above all) cannot be re-asked at all.
- **Means:** One new entry point on `useTextTv` (`refresh()`, `refreshing`, `markId`) beside the existing `reload()`; a downward branch in the axis lock `useSwipeNavigation` currently abandons; a new `.pull-track` wrapper that owns the vertical translate so the two axes never write the same transform; a row-level diff computed beside the decode in `SubPageFrame`, where the decoded rows actually live.
- **Authority hierarchy:** `misc/design/README.md` wins on behaviour, values, timings, easings and Swedish copy — it is declared high-fidelity and final. `CLAUDE.md` wins on code style, module boundaries and test strategy. `CONCEPTS.md` wins on vocabulary. `docs/plans/2026-08-26-0532-fix-swipe-hardening-plan.md` still wins on the held-neighbour rotation and the freshness windows; this plan changes neither. This plan's KTDs win where the design doc left a mechanism open ("or a small hook beside it").
- **Execution profile:** Five units, in order. U1 is the state the rest consume; U2 and U3 are its two cheap chrome consumers; U4 is the gesture; U5 is the marks. Each unit is independently testable and leaves the tree green.
- **Stop conditions:** Stop and report if the decoded-row comparison cannot be made from what `SubPageFrame` already holds without a second decode pass — decoding a page twice to diff it would cost the reader the frame budget this rendering exists to protect.
- **Tail ownership:** The invoking pipeline owns commits. Work happens on `main`; commit locally, no push and no PR. (session-settled: user-directed.)

---

## Product Contract

### Summary

Text-TV pages age, and a few are read precisely because they change. The app has no reader-initiated way to ask again. This adds two, plus a way for the page to say what came back: a ↻ in the bottom bar between ⌂ and ▶, a pull-down gesture that reveals a 44px strip and fetches on release, and a yellow mark in column 0 of every row whose decoded content differs from the copy that was on screen.

No polling is introduced. The comment in `src/useTextTv.ts:332` — "No polling. Refetch only when the reader comes back to a stale page." — still holds; the refresh is explicit and reader-initiated, which is the same principle from the other side.

### Problem Frame

Three gaps, all in code that already exists.

**The fetch is reachable but not offered.** `reload()` (`src/useTextTv.ts:330`) bumps `reloadCount`, and the load effect's `keep` guard (`:219-230`) short-circuits on `reloadCount <= fetchedForReload.current`, so a reload always fetches and ignores both freshness windows. That is exactly the behaviour a refresh wants. It has one reader-facing caller: `PageSheet`'s `onRetry`, reached only from `TransportError` (`src/components/PageSheet.tsx:38`). Its only other caller is the visibility-change revalidation (`src/useTextTv.ts:339`), which the reader never asks for.

**The gesture throws downward drags away.** `useSwipeNavigation` locks an axis and, on `y`, clears the gesture before the track has moved a pixel (`src/useSwipeNavigation.ts:229-232`). Every downward drag is released to native scrolling, including the one at `scrollTop === 0` that has nothing to scroll.

**Nothing compares payloads.** A revalidation replaces `known[pageNumber]` wholesale (`src/useTextTv.ts:255`). `SubPageFrame` re-decodes and swaps its rows (`src/components/SubPageFrame.tsx:32-46`), deliberately holding the old rows until the new ones resolve — but it discards the old ones without looking at them. After a refresh the reader is left comparing screens from memory, which on a scores page is the whole task.

The design doc's State Management table names `previous` and `changedRows` as living in `useTextTv` "(or a small hook beside it)". `useTextTv` holds `FetchResult`s — base64 GIFs — and has no decoded rows and no decoder. The doc's own diff rule is explicit that the comparison is over decoded rows, not over the GIF. So the diff belongs beside the decode; see KTD5.

### Key Decisions

- **A reader-initiated refresh is a different thing from a background revalidation, and the hook must say which.** Both go through the same fetch, but only one turns the freshness status cyan, dims the ↻, opens the strip and licenses marks. One boolean beside `stale`/`pending` carries it. Governs R2, R6, R13, R14.

- **The refresh reuses `reload()`'s fetch path exactly.** No second fetch path, no change to `fetchPage`, no change to either freshness window. `refresh()` is `reload()` plus a flag. Governs R1, R2, R5, R7.

- **The vertical translate lives on its own element.** The horizontal gesture writes `translate3d(x, 0, 0)` straight to `.swipe-track` and reads it back with `DOMMatrixReadOnly.m41` (`src/swipe.ts:98`). Putting a Y on the same element would make every one of those reads and writes carry the other axis. A `.pull-track` wrapper inside `.content` takes the Y; `.swipe-track` is untouched. Governs R19, R22, R24.

- **One pointer stream, one hook.** A second hook listening on the same `.content` element would double-handle every `pointerdown` and each would decide an axis without the other. The pull is a branch in the axis lock `useSwipeNavigation` already performs. Governs R17, R18, R25, R26.

- **The marks are a real comparison or they are nothing.** A refresh that brings nothing new marks nothing; a page whose sub-page count changed marks nothing rather than guessing. Governs R30, R34, R35.

- **The strip belongs to the pull, not to the fetch.** The ↻ button dims itself and turns the freshness status cyan; it does not open the strip. The strip is the pull gesture's own surface, and the design's own reason for having no spinner — "the strip plus the status line already say the same thing twice" — argues against inventing a third place to say it. Governs R12, R13.

- **The design doc's Open Questions are out of scope.** A shorter arrival window for live pages, what a failed refresh says and where, and whether marks survive a page change are named in the doc as not designed. None is implemented and none is guessed at.

### Requirements

**The hook**

- R1. `useTextTv` exposes `refresh()`, which fetches the current page ignoring both freshness windows, exactly as `reload()` does today.
- R2. `useTextTv` exposes `refreshing: boolean`, true from the moment `refresh()` is called until that fetch settles.
- R3. `reload()` keeps its current behaviour and its current callers. A background revalidation — the visibility-change path at `src/useTextTv.ts:333-343` — and a `TransportError` retry both leave `refreshing` false.
- R4. `refreshing` returns to false when the fetch resolves, when it fails, and when the reader leaves the page before it lands.
- R5. A refresh whose response is a transport error behaves as today: the cached copy stays on screen, the error is dropped (`src/useTextTv.ts:250-253`), and the freshness bar returns to the `Uppdaterad HH:MM` it showed before.
- R6. `useTextTv` exposes `markId: number`, incremented once each time a reader-initiated fetch lands a `page` payload whose sub-page count matches the payload that was on screen. It is not incremented for a background revalidation, for a not-broadcast or error outcome, or when the sub-page count changed.
- R7. Neither freshness window (`ARRIVAL_WINDOW_MS`, `REVALIDATE_AFTER_MS`) changes, and no polling is added.

**The ↻ button**

- R8. The bottom bar carries a `<button type="button">` with the glyph `↻` (U+21BB) and `aria-label="Uppdatera sidan"`, in source and tab order between ⌂ and ▶.
- R9. It is `--ink` `#ffffff` at rest and `#3a3a3a` while a **reader-initiated refresh** is in flight (`refreshing`), with `transition: color 140ms linear` on the refresh button alone. The other bar glyphs keep their instant colour change: the design's table marks ◀ ▶ ⌂ unchanged, and fading the arrows would lag the one signal that says whether a swipe will go anywhere.
- R10. While `refreshing` it carries `aria-disabled="true"` and its click is a no-op. It never takes the native `disabled` attribute — the same reason the arrows avoid it (`src/components/BottomBar.tsx:23-34`): disabling a focused button drops focus to `<body>`. It stays live during a background revalidation and during a page's first load, per KTD4.
- R11. `.bar__input` narrows from `4.5em` to `3.8em` with `padding: 0 6px`; `.bar__inner` gap drops from `8px` to `2px` and its padding from `0 12px` to `0 10px`. Six controls plus the keypad fit a 390px bar.
- R12. Tapping it starts a reader-initiated refresh. It does not open the pull strip.

**The freshness bar**

- R13. While a reader-initiated refresh is in flight the status reads `Hämtar…` in `#00ffff`.
- R14. A background revalidation still shows the existing `Cachad · uppdaterar…` in `--dim`. The cyan is reserved for the reader-initiated case.
- R15. `.freshness__status` is a polite live region, so `Hämtar…` → `Uppdaterad 15:41` is announced once.
- R16. When the refresh settles, the bar shows `Uppdaterad HH:MM` from SVT's publication time — never the fetch time, per the existing rule (`src/api.types.ts:26-33`).

**The pull gesture**

- R17. A vertical axis lock with `dy > 0` becomes a pull when the current sheet is at `scrollTop === 0`; otherwise it is released to native scrolling exactly as today. A vertical lock with `dy < 0` is always released.
- R18. The axis lock rule is unchanged: horizontal when `|dx| >= 1.5 * |dy|`, else vertical, past a 6px dead zone. Once locked the axis does not change, so a pull and a page swipe are mutually exclusive per gesture.
- R19. The pull follows the finger 1:1 for the first 44px, then `y = 44 + (dy - 44) * 0.34`, capped at 88px. No transition while the finger is down.
- R20. A 44px strip is revealed above the sheet, full width, `border-bottom: 1px solid #1c1c1c`, its content centred on both axes. Its label is Inconsolata at `font-stretch: 150%`, `13px`, `letter-spacing: 0.16em`, uppercase — `DRA NER FÖR ATT UPPDATERA` in `#00ffff` below the threshold and `SLÄPP FÖR ATT UPPDATERA` in `#ffff00` at or past it.
- R21. A 2px fill rule pinned to the strip's bottom edge, full width, `#ffff00`, `transform: scaleX(min(1, y / 40))` with `transform-origin: left center`, visible only while the finger is down.
- R22. Release at or past 40px of travel starts a reader-initiated refresh: the pull track snaps to exactly 44px with `transform 200ms cubic-bezier(.32,.94,.28,1)` and stays there for the fetch. The strip reads `HÄMTAR <page>…` in `--dim`, and the fill rule is hidden.
- R23. Release below the threshold returns the pull track to 0 with `transform 280ms cubic-bezier(.22,1,.36,1)` and nothing else happens.
- R24. When the payload lands, the pull track returns to 0 with `transform 300ms cubic-bezier(.22,1,.36,1)`.
- R25. A pull is ignored while a reader-initiated refresh is already in flight (`refreshing`). It is permitted during a background revalidation and during a first load, which can therefore produce a second request for a page already being fetched — accepted, per KTD4.
- R26. The existing rescue listeners — `pointerup`, `pointercancel` and `blur` on `window`, and the `visibilitychange` finisher (`src/useSwipeNavigation.ts:326-349`) — return the pull track to 0 for an abandoned pull. The sheet never parks 44px down with nothing to bring it back.
- R27. `EDGE_GUTTER` / `SWIPE_GUTTER_PX` behaviour for horizontal drags is untouched, and the pull is not gutter-restricted: the OS back gesture is horizontal.
- R28. Under `prefers-reduced-motion: reduce` the strip does not follow the finger. A release past the threshold opens it instantly at 44px and it closes instantly when the payload lands. The marks are unaffected — they are a colour change, not motion.
- R29. Leaving the page mid-refresh closes the strip and clears `refreshing`.

**The marks**

- R30. After a reader-initiated payload lands, every row whose decoded content differs from the rows that were on screen carries a mark in column 0: solid `#ffff00`, `width: max(3px, 0.42 × cell width)`, `top: 20%`, `height: 60%` of the row box.
- R31. The mark is drawn inside the row element, so on a double-height row it scales with the row.
- R32. Marks are solid for 1.7s after the payload lands, then fade over `opacity 500ms linear` and are removed at 2.2s. Confirmed against the prototype rather than inferred; see KTD11.
- R33. Marks are decorative: `aria-hidden="true"`, never announced, never focusable, never in the way of a hotspot.
- R34. A refresh that brings nothing new marks nothing, and the comparison is real — over decoded rows, never over the base64 GIF, and never assumed from the fact that a fetch happened.
- R35. Sub-pages are compared like with like by `subPageNumber`; the mark applies within each sub-page's own frame. A page whose sub-page count changed marks nothing.
- R36. A background revalidation marks nothing.

### Non-Goals

- No polling, and no per-page freshness window. The design doc names both as open product questions.
- No failure notice in the strip. The doc names it explicitly as "not designed here, open question"; a failed refresh closes the strip and restores the previous timestamp, and nothing else.
- No persistence of marks across a page change and back. Today they would not survive; the doc leaves that open and this plan leaves it as it is.
- No change to the teletext decoder, the glyph table, the hotspot layer, the sub-page stacking, the store, or the service worker.
- No new fetch path, no change to `src/api.ts` or `src/api.types.ts`.
- The prototypes in `misc/design/` (`Refresh.dc.html`, `Teletext phone.dc.html`, `support.js`) are references, not code. Their own page rendering is a stand-in and is ignored; `TextFrame` already draws the grid correctly.

---

## High-Level Technical Design

The shell gains one element and the vertical axis gains one owner.

```
.app
├── .freshness                      status: cyan "Hämtar…" while refreshing   (U3)
├── .content            ← pointer listeners live here, as today
│   └── .pull-track     ← NEW. useSwipeNavigation writes translate3d(0, y, 0) (U4)
│       ├── .pull-strip     44px, at top: -44px, rides in with the track
│       │   ├── .pull-strip__label   DRA NER… / SLÄPP… / HÄMTAR nnn…
│       │   └── .pull-strip__fill    2px, scaleX(progress), finger-down only
│       └── .swipe-track    ← unchanged: writes translate3d(x, 0, 0)
│           └── .swipe-sheet ×1-3
│               └── .pages → .frame → .text-frame → .text-frame__row
│                                                     └── .text-frame__mark    (U5)
│                                                        col 0, last child
├── .rail
└── .bar                            ↻ between ⌂ and ▶                          (U2)
```

Two transforms, two elements, no arithmetic between them. A horizontal drag during a parked fetch writes X to `.swipe-track` while `.pull-track` holds its 44px Y, and neither read-back sees the other.

The state flows one way:

```
useTextTv                                        (U1)
  refresh()  ──▶ refreshWanted (ref, compared) ──▶ reloadCount++
                                                          │
                                     existing load effect always fetches
                                                          │
                          ┌───────────────────────────────┴──────────────┐
                          │                                              │
                    payload lands                                  error / cancelled
                          │                                              │
             refreshing ◀─ false                              refreshing ◀─ false
             markId++ when it was a reader refresh                 markId unchanged
             and the sub-page count matched
                          │
       App ──▶ PageSheet(place='current') ──▶ PageView ──▶ SubPageFrame(markId)
                                                                │
                                            decode resolves for a new gifDataUrl
                                            and markId !== markedFor
                                                                │
                                            changed = diffRows(previous, next)
                                                                │
                                                    TextFrame(changed)
```

`SubPageFrame` is already the right place: it holds its resolved rows across a revalidation on purpose (`src/components/SubPageFrame.tsx:34`), and `PageView` keys it by `subPageNumber`, so the component identity *is* the like-with-like pairing R35 asks for.

The pull's arithmetic is pure and lives in `src/swipe.ts` beside the horizontal constants, so it is unit-testable without a DOM — which `CLAUDE.md` permits for exactly this kind of module.

---

## Implementation Units

### U1 — A reader-initiated refresh in `useTextTv`

- **Requirements:** R1, R2, R3, R4, R5, R6, R7. Implements KTD1, KTD2, KTD6.
- **Files:** `src/useTextTv.ts`, `src/app.test.tsx`.

- **Approach:**

  Add three things to `TextTvState`, documented in the same voice as `stale`:

  ```ts
  /** True while a fetch the reader asked for is in flight. */
  refreshing: boolean
  /**
   * Bumped once per reader-initiated payload that can be compared with the
   * one it replaced. What the marks key off; see U5.
   */
  markId: number
  refresh: () => void
  ```

  `refresh()` sets a ref and bumps the same counter `reload()` does:

  ```ts
  const refresh = useCallback(() => {
    setRefreshing(true)
    // Named from inside the updater: `reloadCount` is state, and a callback
    // with no dependencies cannot read the current one. This is also the only
    // place that knows which count the refresh is for.
    setReloadCount((count) => {
      refreshWanted.current = count + 1
      return count + 1
    })
  }, [])
  ```

  Under StrictMode the updater runs twice for one call; both passes compute the
  same `count + 1` and write the same value, so it stays idempotent.

  `refreshWanted` names the `reloadCount` the refresh is for, and is **compared, never consumed** — `docs/solutions/best-practices/a-carve-out-flag-in-an-effect-must-be-compared-not-consumed.md` is about this exact file and this exact hazard: StrictMode runs the load effect, tears it down and runs it again, and a boolean the first pass spends leaves the second pass — the one that matters — thinking no refresh was asked for. The load effect reads `const readerAsked = refreshWanted.current === reloadCount` and leaves the ref alone; it is retired when the *page* changes, not when the fetch succeeds.

  Inside the existing `.then` (`src/useTextTv.ts:242-265`), on every path that ends the fetch:

  - the transport-error early return (`:250-253`) adds `if (readerAsked) setRefreshing(false)` beside the existing `setStale(false)`;
  - the success path adds the same, plus the `markId` bump when `readerAsked && fresh.kind === 'page' && painted?.kind === 'page' && painted.subPages.length === fresh.subPages.length`. `painted` (`:205`) is already the copy that was on screen — the `previous` the design doc's table asks for is a local that already exists, so no new state holds a second payload.

  The effect's cleanup (`:267-270`) is the trap. `reloadCount` is a dependency (`:271`), so `refresh()` bumping it runs the **previous** run's cleanup before the new fetch starts. An unconditional `setRefreshing(false)` there would clear the flag the reader just raised — no cyan, no dim, and U4's close effect would shut the strip the moment it parked. So the cleanup clears only when it is not the one the refresh itself caused:

  ```ts
  return () => {
    cancelled = true
    // The pre-refresh run's cleanup has readerAsked false and leaves the flag
    // alone; a page change during the refresh run does clear it, which is what
    // R4 and R29 ask for.
    if (readerAsked) setRefreshing(false)
    if (inFlight.current === pageNumber) inFlight.current = undefined
  }
  ```

  `refreshWanted` is retired on the page changing, not on the fetch succeeding — the same effect that already retires `firstLoad` at `:193-195` is where the reset belongs.

  `reload()` is untouched, so the visibility-change revalidation (`:339`) and `TransportError`'s retry stay exactly as they are (R3).

- **Test scenarios** (app level, `msw` + fixtures, per `CLAUDE.md`):

  - Calling the refresh entry point requests the page again even though it was fetched moments ago, i.e. inside `ARRIVAL_WINDOW_MS` — `requestedPages()` (`src/test/server.ts:66`) grows by one. (R1, R7)
  - With the response held by `holdPage` (`:72`), the freshness status reads `Hämtar…` while it is held and `Uppdaterad HH:MM` after `releasePage`, using `republish` (`:30`) so the two timestamps differ and the test cannot pass on a repaint. (R2, R16)
  - A refresh whose response fails (`failNextFor`, `:82`) leaves the frame on screen and the bar back on the old `Uppdaterad HH:MM`. (R5)
  - The visibility-change revalidation does not turn the status cyan — it still reads `Cachad · uppdaterar…`. This is the U3-visible half of R3 and is written there; here assert only that `reload`'s callers are unchanged by running the existing revalidation tests unedited.
  - Navigating away with the refresh response still held leaves nothing stuck: the new page settles normally and the strip (U4) is closed. (R4, R29)

- **Execution note:** Before counting the StrictMode case as covered, confirm the compared-ref shape is load-bearing by switching `refreshWanted` to a boolean the `.then` clears and watching the refresh-visible test go red under `StrictMode` — `src/app.test.tsx` already renders under it (`:3`). This is the repo's standing see-it-red check (`docs/solutions/best-practices/synthetic-events-produce-no-follow-on-events.md`).

- **Verification:** `npm test` green; `npm run build` clean.

---

### U2 — The ↻ button and the tightened bar

- **Requirements:** R8, R9, R10, R11, R12. Implements KTD3, KTD12.
- **Files:** `src/components/BottomBar.tsx`, `src/App.tsx`, `src/index.css`, `src/app.test.tsx`.

- **Approach:**

  `BottomBar` takes two new props, `refreshing: boolean` and `onRefresh: () => void`, and renders between the ⌂ and ▶ buttons:

  ```tsx
  <button
    type="button"
    className="bar__button bar__button--refresh"
    aria-label="Uppdatera sidan"
    {...(refreshing ? { 'aria-disabled': true, onClick: () => {} } : { onClick: onRefresh })}
  >
    ↻
  </button>
  ```

  The `aria-disabled`-not-`disabled` shape is the one the file's `arrow` helper already documents (`:23-34`) and the existing `.bar__button[aria-disabled='true']` rule (`src/index.css:625-628`) already colours it `#3a3a3a`, so R9's dim state needs no new selector — only the transition and the one-pixel size correction:

  ```css
  .bar__button {
    transition: color 140ms linear;
  }

  /* A pixel under the other glyphs: ↻ carries a heavier curve than ◀ ▶ ⌂. */
  .bar__button--refresh {
    font-size: 21px;
  }
  ```

  `.bar__inner` gap `8px` → `2px`, padding `0 12px` → `0 10px`; `.bar__input` width `4.5em` → `3.8em`, padding `0 8px` → `0 6px`. Rewrite the `.bar__inner` comment to say why the gaps are this tight — six controls and the keypad on a 390px bar — so the next person does not restore them.

  `App.tsx` passes `refreshing` and `onRefresh={refresh}` from U1.

  The glyph is text in the bar's fallback stack, as the existing arrows are (`src/index.css:574-578`); nothing is added to the font subset and no asset is introduced.

- **Test scenarios:**

  - `screen.getByLabelText('Uppdatera sidan')` is a `<button type="button">`, and clicking it requests the page again. (R8, R12)
  - With the response held, it carries `aria-disabled="true"` and a second click adds no further request; it never carries `disabled`. (R10)
  - Focus survives the in-flight window: focus the button, start the refresh, and `document.activeElement` is still the button rather than `<body>`. This is the case `aria-disabled` exists for, and it fails if someone swaps in `disabled`. (R10)
  - Tapping it does not open the pull strip — `.pull-strip` stays closed. Written in U4, where the strip exists. (R12)

- **Execution note:** R11's fit is a CSS change with no layout in happy-dom to assert against; it is verified by reading the rule, not by a test. Do not write a test that asserts computed geometry the test environment cannot produce.

- **Verification:** `npm test` green; `npm run build` clean.

---

### U3 — Cyan `Hämtar…` and a polite status

- **Requirements:** R13, R14, R15, R16. Implements KTD4.
- **Files:** `src/components/FreshnessBar.tsx`, `src/index.css`, `src/app.test.tsx`.

- **Approach:**

  `FreshnessBar` takes one new prop, `refreshing: boolean`, tested ahead of `stale` in the existing ladder (`src/components/FreshnessBar.tsx:18-24`):

  ```tsx
  const status = refreshing
    ? 'Hämtar…'
    : stale
      ? 'Cachad · uppdaterar…'
      : ...
  ```

  The cyan is a modifier class on the status span, not an inline colour, so the teletext palette stays in the stylesheet with the rest of it:

  ```css
  /* The one place the chrome borrows a broadcast colour: a refresh the reader
     asked for is the only wait they are standing over. */
  .freshness__status--refreshing {
    color: #00ffff;
  }
  ```

  `aria-live="polite"` goes on `.freshness__status` itself, which is present from first render and only changes its text — the shape a live region needs. Nothing else in the bar becomes a live region; `.freshness__source` is static.

  The order matters and is the whole of R14: a background revalidation sets `stale` and leaves `refreshing` false, so it keeps `Cachad · uppdaterar…` in `--dim`. Both flags can be true at once — a refresh over a painted copy — and the reader-initiated reading wins.

- **Test scenarios:**

  - With a held refresh response, the status reads `Hämtar…` and carries the refreshing modifier; after release it reads the new `Uppdaterad HH:MM` (`republish` again, so the timestamp is provably new). (R13, R16)
  - A visibility-driven revalidation with a held response shows `Cachad · uppdaterar…` and *not* the modifier. This is the test that keeps the cyan reserved. (R14)
  - `.freshness__status` carries `aria-live="polite"`. (R15)

- **Execution note:** The existing freshness tests in `src/app.test.tsx` assert `Cachad · uppdaterar…` and `Uppdaterad HH:MM` and must pass unedited. If the new branch changes what a background revalidation shows, the ladder is in the wrong order.

- **Verification:** `npm test` green; `npm run build` clean.

---

### U4 — The pull gesture and the strip

- **Requirements:** R17, R18, R19, R20, R21, R22, R23, R24, R25, R26, R27, R28, R29. Implements KTD7, KTD8, KTD9.
- **Files:** `src/swipe.ts`, `src/swipe.test.ts`, `src/useSwipeNavigation.ts`, `src/App.tsx`, `src/index.css`, `src/app.test.tsx`.

- **Approach:**

  **`src/swipe.ts` — the numbers and the one piece of arithmetic.** Added beside the horizontal constants, in the same documented block:

  ```ts
  export const PULL_STRIP_PX = 44
  export const PULL_THRESHOLD_PX = 40
  export const PULL_CEILING_PX = 88
  export const PULL_RESISTANCE = 0.34

  /**
   * How far the strip has travelled for a finger that has moved `dy` down.
   *
   * 1:1 while the strip is opening, then resisted and capped. The threshold is
   * inside the 1:1 region on purpose, so arming reads as "the strip is fully
   * open" rather than as a distance the reader has to estimate.
   */
  export function pullOffset(dy: number): number {
    if (dy <= 0) return 0
    if (dy <= PULL_STRIP_PX) return dy
    return Math.min(PULL_CEILING_PX, PULL_STRIP_PX + (dy - PULL_STRIP_PX) * PULL_RESISTANCE)
  }
  ```

  Unit-tested in `src/swipe.test.ts` — a pure module with no DOM of its own, which `CLAUDE.md` allows.

  **`src/useSwipeNavigation.ts` — the downward branch.** Three structural edits before the branch itself, each fixing a place the existing shape blocks the pull outright:

  1. **The gutter test moves.** `onPointerDown` returns at `:188` when the touch lands within `EDGE_GUTTER` — *before* a gesture object exists, so no axis is locked and no pull is possible. On a 390px phone that silently kills the outer 23% of the screen, and no happy-dom test would catch it because every existing test starts the finger at x=500. `Gesture` gains `startedInGutter: boolean`, recorded at `pointerdown`; the early return is deleted and the test is applied in the **horizontal** arm of the axis lock and in `endGesture`'s horizontal branch instead. R27 is satisfied by construction rather than by assertion: the gutter guards the axis the OS competes for, and only that axis.

  2. **The axis lock moves above the `!motion` return.** `onPointerMove` returns at `:221` before the lock at `:224`, so under `prefers-reduced-motion` `live.axis` is never set at all — today's horizontal reduced-motion path at `:299` works *because* of that, not despite it. R28 needs the lock to run in both modes, so `if (!motion) return` moves below the lock block and guards only the per-move transform write. Consequence to state plainly: a non-pull vertical lock now ends the gesture under reduced motion too, where today it survives to `endGesture`. That matches what a vertical lock means in both modes and removes an inconsistency rather than adding one.

  3. `Gesture` gains `pull: boolean`.

  Then the branch: the vertical arm of the axis lock (`:229-232`) becomes a downward lock at `scrollTop === 0` with no reader refresh in flight; every other vertical lock keeps today's give-up. The scroll position is read once, at the lock, from the current sheet:

  ```ts
  const sheet = track.current?.querySelector('.swipe-sheet--current')
  ```

  One query per gesture, at the moment the axis is decided — not per move.

  New `Options`: `pullTrack: RefObject<HTMLElement | null>`, `canPull: () => boolean` (false while `refreshing`, R25), `onPullState: (state: 'idle' | 'below' | 'armed' | 'fetching') => void`, `onRefresh: () => void`. Per-move work writes `pullTrack.style.transform` and the fill's `scaleX` straight to the DOM, exactly as the horizontal drag does and for the same reason (`:74-78`): a state write per `pointermove` would re-render every decoded frame on screen. `onPullState` fires only when the label actually changes — at most twice per gesture — so React sees a handful of renders, not one per frame.

  `endGesture` gains a pull arm before the horizontal one. Past the threshold: set `PULL_SNAP_IN`, transform to `PULL_STRIP_PX`, report `'fetching'`, call `onRefresh()`. Below it: `PULL_SNAP_BACK` to 0 and report `'idle'`. Aborted, at any distance: the same close as below-threshold — this is R26, and it is the reason the close lives in `endGesture` rather than in the release branch, so the `window` `pointerup`/`pointercancel`/`blur` rescues and `onVisibilityChange` all reach it for free.

  Closing when the payload lands (R24) is a `useLayoutEffect` on `refreshing` going false: set `PULL_CLOSE` and transform to 0. It must not fight a gesture that has since grabbed the track — the same ownership question `settle` answers, and for the same reason (`docs/solutions/best-practices/a-hand-driven-css-transition-must-check-who-owns-the-element-before-finishing.md`): **check `gesture.current` before writing.**

  Under `!motion` (R28) the follow is skipped entirely — nothing is written per move — but the lock still records that the gesture is a pull, and the release still decides from `live.last.y - live.start.y`. Opening and closing are instant: no transition is set. This mirrors what `endGesture` already does for the horizontal case at `:299-306`.

  **`src/App.tsx`** renders the wrapper and the strip, and holds the label state:

  ```tsx
  <main className="content" ref={content}>
    <div className="pull-track" ref={pullTrack}>
      <div className="pull-strip" aria-hidden="true">
        <span className="pull-strip__label">{PULL_LABEL[pullState](pageNumber)}</span>
        <span className="pull-strip__fill" ref={pullFill} />
      </div>
      <div className={...}>{/* .swipe-track, unchanged */}</div>
    </div>
  </main>
  ```

  The strip is `aria-hidden`: the freshness bar's live region (U3) is what announces the fetch, and having both speak would say it twice. The copy is exact and Swedish, inline, as `CLAUDE.md` requires: `DRA NER FÖR ATT UPPDATERA`, `SLÄPP FÖR ATT UPPDATERA`, `HÄMTAR ${pageNumber}…`.

  **`src/index.css`** — the strip, its label, its fill, and the three named transitions. `.pull-track` is `position: absolute; inset: 0` and takes over the box `.swipe-track` had; `.swipe-track` keeps `inset: 0` inside it and is otherwise untouched. `.pull-strip` sits at `top: -44px`, `height: 44px`, full width, `border-bottom: 1px solid #1c1c1c`, flex-centred both ways. `.pull-strip__label` is Inconsolata `font-stretch: 150%`, `13px`, `0.16em`, `text-transform: uppercase`, coloured by a modifier: `#00ffff` below the threshold, `#ffff00` armed, `--dim` fetching. `.pull-strip__fill` is `2px`, bottom-pinned, `#ffff00`, `transform-origin: left center`, `transform: scaleX(0)`, hidden unless the finger is down.

  `.content` keeps `overflow: hidden`, which clips the strip when the track is at 0 — the strip is above the box, not inside a scroller. `html, body { overscroll-behavior: none }` (`src/index.css:92`) already suppresses Chrome's own pull-to-refresh, so the two do not fight; a comment says so at the new rules.

  **`touch-action` is an open decision, not a given — see OQ1.** There is no `touch-action` anywhere in `src/`: `.content` sits at the browser default `auto`, and `docs/plans/2026-08-25-1857-feat-swipe-between-pages-plan.md` KTD8 *rejected* `pan-y` deliberately, because `pan-y` without `pan-x` makes Chrome register a system-gesture-exclusion rect that suppresses the Android back gesture over the content area. That plan still stands under this plan's authority hierarchy, so this feature does not overturn it silently. Ship on `auto` unless OQ1 is answered otherwise.

- **Test scenarios:**

  Dispatch the whole chain by hand — happy-dom synthesises nothing, per `docs/solutions/best-practices/synthetic-events-produce-no-follow-on-events.md`. The existing swipe tests already have a helper shape to follow (`swipeFrom`, `src/app.test.tsx:487`); add a `pullFrom` beside it. happy-dom has no layout, so `scrollTop` is 0 by default and the pull-at-top case is the default case; the scrolled case sets `scrollTop` on the current sheet explicitly.

  - A downward drag past 40px, released, requests the page again and shows `HÄMTAR <page>…` while the response is held. (R17, R22)
  - The same drag on a sheet with `scrollTop > 0` requests nothing and leaves the strip closed. (R17)
  - An upward drag requests nothing. (R17)
  - A downward drag released below 40px requests nothing and closes the strip. (R23)
  - Crossing 40px flips the label from `DRA NER FÖR ATT UPPDATERA` to `SLÄPP FÖR ATT UPPDATERA`, and back if the finger returns above it. (R20)
  - A drag that is more sideways than down still changes the page, and a drag that is more down than sideways never does. Both directions of R18, because the ratio is what keeps them apart.
  - A `pointercancel` mid-pull closes the strip and requests nothing; so does a `blur` on `window`, and so does a `visibilitychange` to hidden. Three separate assertions — the three rescue paths R26 names. (R26)
  - A pull while a refresh is already in flight does nothing: the request count does not grow. (R25)
  - Navigating away mid-refresh closes the strip. (R29)

- **Execution note:** Confirm the R25 lockout and each of the three R26 rescues go red with their guard removed before counting them written. The rescue tests in particular are the class the repo has been bitten by twice.

- **Verification:** `npm test` green; `npm run build` clean.

---

### U5 — Marking the rows that changed

- **Requirements:** R30, R31, R32, R33, R34, R35, R36. Implements KTD5, KTD10, KTD11.
- **Files:** `src/teletext/diff.ts` (new), `src/teletext/diff.test.ts` (new), `src/components/SubPageFrame.tsx`, `src/components/TextFrame.tsx`, `src/components/PageView.tsx`, `src/components/PageSheet.tsx`, `src/App.tsx`, `src/index.css`, `src/app.test.tsx`.

- **Approach:**

  **`src/teletext/diff.ts`** — one pure function over `DisplayRow[]`, unit-testable with no DOM:

  ```ts
  /**
   * Which grid rows differ between two decodes of the same sub-page.
   *
   * Rows are compared by what they draw, colours included: teletext says things
   * with colour, and a score that turns from white to yellow has changed. The
   * comparison is by `row`, not by position in the array: a double-height row
   * covers the grid row beneath it and that row is never emitted on its own, so
   * the same row number can be present on one side and absent on the other.
   */
  export function changedRows(before: DisplayRow[], after: DisplayRow[]): number[]
  ```

  Implemented by keying each side on `row` and comparing a stable signature of the row — its `doubleHeight` flag and its runs' `col`, `width`, `fg`, `bg` and payload (`text`, `bits`, or the `unknown` marker). A row present on one side only counts as changed. Nothing here knows about React or the DOM.

  **`src/components/SubPageFrame.tsx`** — the diff runs where the rows are. The component already holds its resolved rows across a revalidation on purpose, and `PageView` keys it by `subPageNumber`, so its identity is the like-with-like pairing R35 wants. It takes one new prop, `markId: number`, and keeps one ref, `marked`, naming the `markId` it has already spent:

  ```ts
  void decodeFrame(subPage.gifDataUrl).then((cells) => {
    if (!current) return
    if (cells === null) { setDecoded({ status: 'failed' }); return }
    const rows = resolvePage(cells, subPage.altText)
    // The previous decode is the copy that was on screen. A first decode has
    // none, so a page arriving for the first time never marks.
    if (markId !== marked.current && decoded.status === 'resolved') {
      marked.current = markId
      setChanged(changedRows(decoded.rows, rows))
    }
    setDecoded({ status: 'resolved', rows })
  })
  ```

  `markId` is compared, never consumed — the same rule U1's `refreshWanted` follows, and for the same StrictMode reason. It is read from a ref inside the `.then` so it is not a dependency of the decode effect; the effect still keys on `gifDataUrl`/`altText` alone, which means an unchanged page never re-decodes and therefore never marks. That is R34 falling out of the existing shape rather than being enforced: no fetch, no new GIF, no diff, no mark.

  A second effect clears them: `setTimeout(() => setFading(true), 1700)` and `setTimeout(() => setChanged([]), 2200)`, both cleared on unmount and on a new `changed`. See KTD11 for the two-timer reading of R32.

  **`src/components/TextFrame.tsx`** takes `changed: readonly number[]` (defaulting to `[]` — the same shape `changedRows` returns, so nothing converts) and renders, as the **last** child of each changed row:

  ```tsx
  <span className="text-frame__mark" aria-hidden="true" />
  ```

  Last, not first, and this is load-bearing. Column 0 being blank does **not** mean nothing is painted there: `RowBuilder.space()` (`src/teletext/resolve.ts:78-88`) emits a blank column as a text run of spaces carrying an opaque `bg`, which `TextFrame` renders as a `backgroundColor` (`:68`). Runs carry no stacking order by design (`src/index.css:275-286`), so paint order decides, and a mark drawn first would be covered by the very run that follows it — every mark invisible, and U5 looking like a broken diff. Rendering it after the runs keeps it visible without giving anything a `z-index`, so the half-pixel bleed the row rule depends on is untouched.

  Inside the row element, so R31's double-height scaling is the row's own `scaleY(2)` and needs no special case — unlike `.text-frame__slice`, which undoes it (`src/index.css:360-364`) because it is a piece of the GIF rather than a mark.

  **Threading:** `App` passes `markId` to the current `PageSheet` only — a neighbour has nothing to compare and marks nothing (R36 for prefetched sheets); `PageSheet` passes it to `PageView`, which passes it to each `SubPageFrame`.

  **`src/index.css`:**

  ```css
  /*
   * A changed row, marked in column 0 - the one cell SVT leaves blank on every
   * page, so the mark costs no character and never sits on top of text.
   */
  .text-frame__mark {
    position: absolute;
    left: 0;
    top: 20%;
    height: 60%;
    width: max(3px, calc(var(--cell-w) * 0.42));
    background: #ffff00;
    transition: opacity 500ms linear;
  }

  .text-frame__mark--fading {
    opacity: 0;
  }
  ```

  It is a sibling of the runs and carries no stacking order, which the bleed comment at `src/index.css:275-286` warns against giving them — column 0 is blank, so nothing is painted under it to be covered.

- **Test scenarios:**

  Unit, `src/teletext/diff.test.ts`:

  - Identical row arrays produce no indices.
  - A changed character in one row produces that row's index alone.
  - A row that changed only colour is reported — teletext says things with colour.
  - A row present on one side only is reported.
  - Rows are matched by their `row` number, not by array position.

  App level, `src/app.test.tsx`, using `reframe` (`src/test/server.ts:46`), which republishes a page carrying another page's frame under its own sub-page numbers — the way SVT rolls a live page over, and exactly the fixture affordance this needs:

  - Open 377, wait for the frame to draw, `reframe('377', '331')`, refresh: marks appear on the rows that differ, and `.text-frame__mark` count is greater than zero and less than every row. (R30, R34)
  - Refresh without reframing: no marks at all. This is the test that keeps R34 from degrading into "a fetch happened, so mark everything". (R34)
  - A background revalidation with a reframed page draws the new rows and marks nothing. (R36)
  - Marks are `aria-hidden` and are not in the accessible name of the frame group. (R33)
  - With fake timers, marks carry the fading modifier at 1.7s and are gone by 2.2s. (R32)
  - Marks appear on the current sheet only; a prefetched neighbour carries none. (R36)

- **Execution note:** The see-it-red check belongs on the **R36 background-revalidation-with-reframe** test, which is the one the `markId !== marked.current` guard actually decides. "Refresh without reframing" cannot go red for that guard: an unchanged `gifDataUrl` leaves the decode effect's deps untouched, so the `.then` holding the guard never runs at all. Keep that test, but as the pin on R34's no-decode-no-diff shape. Row granularity is checked at the unit level in `src/teletext/diff.test.ts`, not at the app level — `reframe` swaps a whole frame and cannot change a single row.

- **Verification:** `npm test` green; `npm run build` clean; `npm run glyphs:check` if the reframed fixture pairing touches the glyph table.

---

## Key Technical Decisions

- KTD1. **`refresh()` is `reload()` plus a compared flag, not a second fetch path.** The load effect already ignores both freshness windows for a reload (`src/useTextTv.ts:219-230`), which is precisely what a refresh needs; the only thing missing is a name for *why* the fetch is running. Adding a parallel path would double the cancellation, store-write and error handling that file has spent three plans getting right. Governs R1, R2, R5, R7.

- KTD2. **The refresh flag is compared against `reloadCount`, never consumed.** `docs/solutions/best-practices/a-carve-out-flag-in-an-effect-must-be-compared-not-consumed.md` is about this file: StrictMode mounts, tears down and mounts again, so a boolean the first pass spends leaves the second — the one whose result is kept — believing no refresh was asked for, and the reader would get a silent fetch with no cyan, no strip and no marks. Retiring it on the page changing rather than on the fetch succeeding is the other half of that lesson. Governs R2, R6.

- KTD3. **The ↻ takes `aria-disabled`, never `disabled`.** `BottomBar` already documents the reason for its arrows (`:23-34`) — disabling a focused button drops focus to `<body>` — and the refresh button is more exposed to it than they are, because the reader's own tap is what starts the in-flight window they are focused during. The existing `[aria-disabled='true']` rule already carries the `#3a3a3a`. Governs R9, R10.

- KTD4. **The cyan is reserved for a fetch the reader asked for.** `stale` and `refreshing` can both be true, and the ladder tests `refreshing` first. A background revalidation keeps `Cachad · uppdaterar…` in `--dim`: the point of the colour is that the reader is standing over this particular wait, and spending it on a fetch they did not ask for would make it mean nothing. Governs R13, R14.

- KTD5. **The row diff lives in `SubPageFrame`, beside the decode — not in `useTextTv`.** The design doc names `useTextTv` "(or a small hook beside it)" while also requiring the comparison be over decoded rows rather than the GIF. `useTextTv` holds `FetchResult`s and has no decoder; putting the diff there means decoding every payload a second time, off the render path, purely to compare it — on a fourteen-sub-page page that is the frame budget this rendering exists to protect. `SubPageFrame` already decodes, already holds its resolved rows across a revalidation (`src/components/SubPageFrame.tsx:34`), and is already keyed by `subPageNumber`, which is the like-with-like pairing the doc asks for. Governs R30, R34, R35.

- KTD6. **The sub-page-count check is the hook's, not the frame's.** A `SubPageFrame` sees one sub-page and cannot know the page's shape changed. `useTextTv` has both payloads at the moment the new one lands — `painted` (`:205`) is the copy that was on screen — so it withholds the `markId` bump and every frame stays quiet without any of them knowing why. Governs R6, R35.

- KTD7. **The vertical translate gets its own element.** `.swipe-track`'s transform is written per frame and read back with `DOMMatrixReadOnly.m41` (`src/swipe.ts:98`), which reads X out of whatever matrix it is handed; a shared element would mean composing and decomposing two axes on every move and every takeover, in code whose subtlety is already documented in two solutions files. A `.pull-track` wrapper costs one div and makes the two axes independent by construction — including the case R22 creates, where the strip is parked at 44px and the reader swipes sideways. Governs R19, R22, R24.

- KTD8. **The pull is a branch in `useSwipeNavigation`, not a second hook.** Both would listen on `.content`; both would see every `pointerdown`; each would lock an axis in ignorance of the other, and R18's mutual exclusivity would become a race rather than a property. The existing hook already owns the axis lock, the rescue listeners and the takeover semantics — the pull needs all three and gets them by being inside it. Governs R17, R18, R25, R26.

- KTD9. **The per-frame work is written to the DOM; only the label crosses into React.** The hook's own comment (`:74-78`) says why: a state write per `pointermove` re-renders every decoded frame on screen. The strip's offset and the fill's `scaleX` are written straight to their elements; `onPullState` fires at most twice per gesture, when the label's text actually changes. Governs R19, R20, R21.

- KTD10. **`markId` is a counter, not a boolean.** The payload lands, then the decode resolves — asynchronously, and possibly more than once under StrictMode. A boolean would be read by whichever decode got there first and spent; a counter compared against a per-frame ref is idempotent, survives the async window, and lets each sub-page decide independently whether it has already marked this refresh. Governs R6, R30, R36.

- KTD11. **"Cleared 1.7s after the payload lands" starts the fade at 1.7s.** The design gives both a lifetime (1700ms) and a fade (`opacity 500ms linear`); the State Management table says `changedRows` is *emptied* at 1.7s, and an emptied array unmounts the marks with nothing left to fade. Read together, 1.7s is when the clearing begins and the 500ms is how it is carried out, so the marks are solid for 1700ms, fade over the next 500ms, and unmount at 2200ms. The alternative reading — fade starting at 1200ms so it completes at 1.7s — makes the mark solid for less than three quarters of its stated lifetime on a page the reader is scanning. If the design's author meant the other one, it is one constant. Governs R32.

- KTD12. **The ↻ does not open the strip.** The strip is the pull gesture's own surface — it is the thing the finger dragged into view. The design's argument against a spinner is that the strip and the status line "already say the same thing twice"; opening the strip for a tap that never touched it would be the third. The button's own feedback is its dim and the cyan status. Governs R12, R13.

---

## Open Questions, Settled By Default

Document review raised five decisions neither the design doc nor the repo answers. The user was unavailable, so each is settled here with the most conservative option and recorded so the design's author can overturn any of them cheaply. Each names what it would cost to change.

- **OQ1. `touch-action` stays at the browser default `auto`.** The pull ships without a `touch-action` declaration. `pan-y` is the obvious enabler and was *rejected* by `docs/plans/2026-08-25-1857-feat-swipe-between-pages-plan.md` KTD8: without `pan-x` it makes Chrome register a system-gesture-exclusion rect that suppresses the Android back gesture over the content area, which that plan settled must always win. Overturning a standing decision on a live plan is not this feature's call. **Cost of the default:** a real browser may claim a downward drag for scrolling and answer with `pointercancel`, which R26 treats as an abandoned pull — so the gesture may be less reliable on some Android builds than the prototype suggests. No test in this repo can settle it; only a device check can. **To change:** one CSS line plus the Android back-gesture re-verification that plan's Q1 attaches to it.

- **OQ2. R36 stands: a background revalidation marks nothing.** The design doc does not say either way. Marks answer "what changed since I asked", so a fetch the reader did not ask for should not flash yellow at them unprompted — particularly on the visibility-change path, where the marks would land as the reader returns to the tab and would read as "this changed while you were away", which is not what the comparison measures. **Cost of the default:** `markId`, R6, KTD6 and KTD10 exist, and `markId` is threaded through `App` → `PageSheet` → `PageView` → `SubPageFrame`. **To change:** delete `markId` and let `SubPageFrame` diff on every re-decode; U5 loses three files.

- **OQ3. ↻ and the pull stay available on the `TransportError` and not-broadcast screens**, routing to the same `refresh()`. `TransportError`'s own retry button is left exactly as it is — two affordances for one fetch is worse than none, but removing a working retry is a bigger change than this feature is scoped for. The pull's `scrollTop` read is guarded against a sheet with no scroller, so it cannot throw on the error screen.

- **OQ4. Reduced motion follows the design doc literally**, which means the strip opens only on release. **Known consequence, flagged for the design's author:** `DRA NER FÖR ATT UPPDATERA` and `SLÄPP FÖR ATT UPPDATERA` become unreachable under `prefers-reduced-motion` — the two strings that tell a reader the gesture exists and that it has armed. Snapping the strip open at the axis lock would keep both reachable while still removing the 1:1 follow, which is the motion the setting objects to. That is a design change, not a plan fix, so it is not taken unilaterally. **To change:** one branch in the axis lock.

- **OQ5. The strip's label holds through the close, and names the page actually being fetched.** Two defects the plan's first draft would have shipped: reverting to cyan `DRA NER FÖR ATT UPPDATERA` during the 300ms close reads as an instruction rather than a completion, and deriving the label from the live `pageNumber` lets `HÄMTAR 331…` name a page that is not in flight once the reader swipes sideways during a parked fetch. So the page number is captured when the refresh starts, by a single entry point both the button and the gesture call.

  The holding needs no state of its own. An earlier draft added a `closing` value to `PullState`; review showed it was unreachable as a distinct behaviour, because the state simply stays `fetching` until the strip has finished sliding away and `transitionend` retires it to `idle`. The label therefore holds by construction, and `PullState` has four values rather than five.

---

## After the First Deploy

The feature shipped and the reader reported the same thing about both entry points: on a quick connection it does not feel like an update happens. That is real and it is a consequence of the design being right about everything except duration. A page already in the store, or one SVT answers immediately, settles inside a frame or two — so the cyan status, the dimmed ↻ and the parked strip all appear and vanish faster than they can be read.

Two changes, both reader-directed:

- **`MIN_REFRESH_VISIBLE_MS` (500ms), in `useTextTv`.** A floor on how long `refreshing` stays true, not on when the fetch leaves: the request goes out on release and the new page paints the moment it lands. Placing it on the flag rather than on the strip is what makes one mechanism serve both entry points — everything that reports a refresh reads the same flag. Cancellation is exempt: a reader who has navigated away is not waiting, and holding the flag would colour the status of the page they went to.

- **A spinner in the strip, overriding the design.** The design doc says *"No spinner. Teletext has no spinners, and the strip plus the status line already say the same thing twice."* The reasoning holds right up until the thing said twice is said for 80ms. Overridden on the reader's own report. It is the same ↻ glyph as the bar button, turning, so whichever way the reader asked, the thing that answers looks the same; `prefers-reduced-motion` keeps the glyph and drops the turning.

The held half-second is what makes the spinner legible, and the spinner is what makes the held half-second read as work rather than as lag. Neither alone would have fixed the report.

---

## What Review Changed

Recorded because six of these would have shipped broken and are not visible in the final diff.

| Found | Consequence had it shipped |
| --- | --- |
| Column 0 is blank but still *painted* — the resolver emits it as a run of spaces with an opaque background | Every mark drawn and then covered. The whole of U5 looking like a broken diff. |
| `reloadCount` is a dependency of the load effect, so `refresh()` runs the previous run's cleanup | `refreshing` cleared the instant a refresh started: no cyan, no dim, strip shutting as it parked. |
| `startsInGutter` returned before the gesture object existed | The outer 44px of a 390px phone unable to pull. Invisible to every test, which start at x=500. |
| `if (!motion) return` sat above the axis lock | Reduced-motion pull unimplementable; the reduced-motion path worked *because* no axis was ever locked. |
| The close effect consumed the falling edge of `refreshing` before its ownership check | A finger down when the payload landed — a hotspot tap is enough — parked the strip 44px down for the session. |
| `.text-frame__mark`'s opacity transition bubbles into `settle` | The first transition ever to exist inside the swipe track: a mark fading out could finish a snap and navigate mid-animation. |
| A refresh returning an identical GIF bumps `markId` but runs no decode | The frame left owing that id, spending it on the next change from any source — a background revalidation marking, against R36. |
| Neighbour sheets seeded with `markId={0}` | A sheet rotated from neighbour to current stays behind the counter and marks on the next change. |

Three of the tests written for this change were themselves vacuous and were caught by the repo's see-it-red rule: two never triggered the revalidation they claimed to test, because the freshness window refused a page fetched moments earlier, and one could not bite because dropping the last sub-page leaves the others untouched. Every guard listed above now has a test that goes red when the guard is removed.

---

## Risks

| Risk | Response |
| --- | --- |
| The marks depend on the GIF changing, so a page SVT republishes byte-identically marks nothing. | That is correct behaviour, not a gap: nothing changed. It also means the diff never runs for an unchanged page, which is the cheap path. R34's "refresh without reframing" test pins it from the other side. |
| A horizontal swipe starting while the strip is parked at 44px. | The two transforms are on different elements (KTD7), so the swipe writes X to `.swipe-track` and the parked Y is untouched. The reader swiping away mid-refresh is R29: the load effect's cleanup clears `refreshing`, and the close effect returns the pull track to 0. |
| The close-on-payload effect fights a gesture that has grabbed the track. | The same ownership question `settle` already answers, with the same answer: check `gesture.current` before writing. `docs/solutions/best-practices/a-hand-driven-css-transition-must-check-who-owns-the-element-before-finishing.md` is cited at the code. |
| happy-dom has no layout, so none of the pull's distances, the strip's geometry or the mark's size can be asserted. | The distances are pure and unit-tested through `pullOffset` in `src/swipe.test.ts`; the geometry is verified by reading the CSS. No test is written that asserts computed geometry the environment cannot produce — that is how a vacuous test gets in. |
| The bar is tight: six controls plus the keypad at a 2px gap on a 390px screen. | The numbers are the design's, measured in its prototype. The keypad narrowing to `3.8em` is part of the same measurement and is not optional. If a wider glyph or a longer page number ever breaks it, the input is the give. |
| `.pull-track` changes the element `.swipe-track`'s absolute positioning resolves against. | It does not: `.pull-track` is `position: absolute; inset: 0` inside `.content`, which is already `position: relative`, and `.swipe-track` keeps `inset: 0` inside it. The boxes are identical while the pull is at 0, which is every moment the existing swipe tests exercise. |
| Marks and the hotspot layer overlapping in column 0. | They cannot: the mark is inside `.text-frame`, the hotspots are a sibling layer with `pointer-events: none` except on the links themselves (`src/index.css:371-375`), and SVT leaves column 0 blank so no hotspot is printed there. |

## Origin

- `misc/design/README.md` — the design handoff this plan implements. High-fidelity: its colours, timings, distances, easings and Swedish copy are taken as final. Its "Open questions" section is out of scope by its own declaration.
- `misc/design/Refresh.dc.html`, `misc/design/Teletext phone.dc.html`, `misc/design/support.js` — the interactive prototypes. Reference for feel only; their page rendering is a stand-in and is ignored.
- `docs/solutions/best-practices/a-carve-out-flag-in-an-effect-must-be-compared-not-consumed.md` — why `refreshWanted` and `markId` are compared rather than spent (KTD2, KTD10).
- `docs/solutions/best-practices/a-hand-driven-css-transition-must-check-who-owns-the-element-before-finishing.md` — why the close-on-payload effect asks who owns the track first.
- `docs/solutions/best-practices/synthetic-events-produce-no-follow-on-events.md` — why every pull test dispatches the whole event chain, and why each guard is seen red before it counts as tested.
- `docs/plans/2026-08-26-0532-fix-swipe-hardening-plan.md` — the rescue listeners, the takeover semantics and the freshness windows this plan builds on and does not change.
- `docs/plans/2026-08-25-2005-feat-swipe-follows-the-finger-plan.md` — the gesture's geometry and the sheet rotation, unchanged here.
