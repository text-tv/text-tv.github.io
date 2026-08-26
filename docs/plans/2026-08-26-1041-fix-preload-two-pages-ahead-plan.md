---
title: Preload Two Pages Ahead - Plan
type: fix
date: 2026-08-26
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Preload Two Pages Ahead - Plan

## Goal Capsule

- **Objective:** A second consecutive swipe in the same direction lands on a page that is already there, provided the reader dwells on the current page long enough for its own next neighbour to arrive. Today the first swipe is silent and the second blinks through `Hämtar…`, because the app only ever holds one page in each direction and the page two ahead is never asked for until the reader is standing on the one before it.
- **Means:** One derived value in `src/useTextTv.ts` — the `next` of the page that is already the current page's `next` — passed to the same `prefetch` the hook already owns, and added to the reach the same effect already prunes to (KTD1, KTD2, KTD4). No new hook, no new module, no change to the gesture.
- **Authority hierarchy:** `CLAUDE.md` wins on code style, API boundaries and test strategy. `CONCEPTS.md` wins on vocabulary. `docs/plans/2026-08-26-0532-fix-swipe-hardening-plan.md` still wins on the held-neighbour rotation and the freshness window — this plan changes neither and depends on both. This plan's KTDs win on where the code lives; its requirements win on behaviour, including where they supersede the reach comment at `src/useTextTv.ts:284`.
- **Execution profile:** One unit. The behaviour change and the revision of the two suite tests that pin the old one-deep reach land together, because those tests assert the exact request set and cannot pass on either side of the change alone.
- **Stop conditions:** Stop and report if the depth-2 target cannot be derived from `known` during render without a second state write — a chain that needs its own state would put a fetch-driven loop in the hook, which is a different change from the one scoped here.
- **Tail ownership:** The invoking pipeline owns commits. Work happens on `main`; commit locally, no push and no PR. (session-settled: user-directed — chosen over a feature branch with a PR: the user said so this session.)

---

## Product Contract

### Summary

Swiping forward twice in a row should be silent both times. It is silent once. The prefetch resolves the current page's own two neighbours (`src/useTextTv.ts:280-290`) and stops there, so the page two forward is only asked for after the reader has already committed onto the page before it — which is exactly the moment the reader is looking at the sheet that has to say `Hämtar…` first and content second. Widening the window to two pages forward and one back closes that, at the cost of one more page held in memory.

### Problem Frame

Landing on a page costs nothing when the page was prefetched: the load effect's freshness window (`src/useTextTv.ts:199-214`) finds a store entry younger than `REVALIDATE_AFTER_MS`, paints it, and returns without calling `fetchPage`. That path already works and this plan does not touch it.

The gap is upstream of it. `ownNext` and `ownPrev` come from the *current* page's payload (`src/useTextTv.ts:273-274`), and the page two forward is named only by the payload of the page one forward. So on 104 the app fetches 104, 102 and 105 and stops. Swiping to 105 makes 106 knowable for the first time, and the prefetch for it starts in the same render in which the reader is already looking at 105 — 106 arrives only if they wait. Swipe again before it lands and the 106 sheet mounts with nothing, shows `Hämtar…`, and fills in a moment later. That is the jump.

The suite pins the one-deep behaviour twice, by name and by assertion:

- `hämtar en sida till framåt efter ett byte, inte åt båda hållen` (`src/app.test.tsx:1312`) asserts the request set after a commit is exactly `['106']`, with a comment explaining that 104's payload is the only thing naming anything.
- `hämtar båda grannarna när sidan har landat` (`src/app.test.tsx:1245`) waits for exactly three requests and asserts `['102', '104', '105']`.

Both are correct descriptions of a decision this plan reverses, so both are revised rather than deleted.

Backward is not part of the gap. One page back is what the current prefetch already holds, and the held-pair rotation from `docs/plans/2026-08-26-0532-fix-swipe-hardening-plan.md` means the page the reader came from is the page behind them. The user's "one backward" is therefore a confirmation of existing behaviour, not new work — it is stated as a requirement so a future reader can see it was decided rather than overlooked.

### Key Decisions

- **Two forward, one back — not symmetric.** Reading teletext runs forward; the page behind the reader is the page they just left and is already in hand. Spending a second backward slot would double the added memory to cover a gesture the reader makes far less often. Governs R1, R2, R3.
- **What this buys is one round trip of head start, not a guarantee.** The two hops are serial: the second is only knowable once the first has resolved, so the page two forward is in hand roughly two round trips after the current page settles. A reader who swipes faster than that sees the same blink as today. That is the shape of the fix and the reason the suite can only assert request sets — no test here asserts timing. Governs R1, R2, R7.
- **A jump is acceptable when the reader outruns the network.** Nothing blocks, delays or spins. A swipe committed before its target has landed shows `Hämtar…` and fills in, exactly as today. The fix raises how far ahead the app is, not what happens when the reader gets ahead of it anyway. Governs R7.
- **A page older than the freshness window is not a jump.** A prefetched page the reader reaches more than `REVALIDATE_AFTER_MS` later is refetched — but it is painted from the store first and marked stale (`src/useTextTv.ts:186-188`), so the sheet is never empty. Revalidation is visible as a freshness-bar state, not as a blink. Governs R7.
- **The page two forward will often be older than the freshness window by the time it is reached, and that is accepted.** Fetching it two swipes and a dwell earlier is exactly what pushes it past `REVALIDATE_AFTER_MS`, so arriving there commonly paints from the store, flips the bar to stale, and spends a second request on a page already in hand. The reader sees no blink, which is what this plan is for; the cost is one duplicate request at ordinary reading pace. The freshness window stays a single answer to "how old is too old" and is deliberately not widened to match the deeper prefetch. Governs R7.
- **One more page in memory is the price, and it is bounded.** The reach grows from three pages to four. The comment at `src/useTextTv.ts:284` — "A page further away than one swipe is not worth a megabyte of memory" — is the decision being reversed, and is rewritten rather than left contradicting the code. Governs R6.

### Requirements

**The window**

- R1. Once the current page has settled, the app holds, or is fetching: the current page, the page one back, the page one forward, and the page two forward.
- R2. The page two forward is identified from the payload of the page one forward, and is prefetched as soon as that payload is known — not on arrival at the page one forward.
- R3. Exactly one page back is prefetched. No second backward page is requested.
- R4. The window never chains past two forward. The page three forward is not requested from a page's own position.
- R5. A page already known, already in the store, or already being prefetched is not requested again — as today.

**What is held**

- R6. Pages outside the window are dropped from memory when the current page changes, as today, with the window widened to include the page two forward.

**Degradation**

- R7. A swipe committed onto a page whose fetch has not landed behaves exactly as it does today: the sheet shows the page number and `Hämtar…`, and fills in when the response arrives. Nothing waits on a prefetch and no gesture is blocked or delayed by one.
- R8. A prefetch that fails is still dropped rather than kept, at both depths, so committing onto the page takes the ordinary load path with its own error and retry.

**The suite**

- R9. `hämtar en sida till framåt efter ett byte, inte åt båda hållen` (`src/app.test.tsx:1312`) is revised to the new window: with 106 given named neighbours, committing 104 → 105 newly requests 107 alone, because 106 was already fetched from 104's position.
- R10. `hämtar båda grannarna när sidan har landat` (`src/app.test.tsx:1245`) is revised to the four-page window.
- R11. A test asserts R4 directly: with 106 given named neighbours so a third hop is reachable at all, 107 is never requested from a settled 104.
- R12. Both tests in R9 and R11 reach past 106, which is not a fixture and answers not-broadcast with no neighbours. They give it neighbours with the existing `takeOffAir` helper rather than adding a fixture, because fixtures are captured real responses.

### Non-Goals

- No cancellation or deprioritisation of an in-flight prefetch when a gesture starts. Fetches are fire-and-forget today and stay so; adding cancellation is a separate concern from window depth.
- No change to the freshness window, the store's eviction policy, `writePage`'s prefetch mode, or the held-neighbour rotation.
- No change to sub-page handling. A prefetch fetches a page's whole payload, sub-pages included, and always has.
- No prefetch of pages reachable only by hotspot or quick-link. The window is the swipe axis.

---

## High-Level Technical Design

The hook already has every part this needs. The one thing it lacks is a name for the page two forward.

```
known: Record<PageNumber, FetchResult | undefined>

current page 104 ──payload──▶ ownPrev 102        ownNext 105
                                  │                  │
                              prefetch            prefetch
                                                      │
                                              known['105'] resolves
                                                      │
                                            ahead = known['105'].next  ──▶ 106
                                                                            │
                                                                        prefetch

reach kept in memory: [pageNumber, ownPrev, ownNext, ahead]
```

`ahead` is derived during render from `known`, the same way `own` already is (`src/useTextTv.ts:141`). It is `undefined` while the page one forward is in flight, becomes defined in the render in which that page resolves, and the existing prefetch effect — which already lists its inputs as dependencies — fires for it then. No new state, no new effect, no chain driven from inside a `.then`.

The depth bound falls out of the shape rather than being enforced by a counter: `ahead` is read from `known[ownNext]` only. Nothing reads `known[ahead]`, so there is no third hop to write.

---

## Implementation Units

### U1 — Widen the prefetch window to two forward

- **Requirements:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12. Implements KTD1, KTD2, KTD3, KTD4, KTD6.
- **Files:** `src/useTextTv.ts`, `src/app.test.tsx`, `CONCEPTS.md`.

- **Approach:**

  In `src/useTextTv.ts`, beside `ownPrev`/`ownNext` (`:273-274`), derive the second forward hop from what is already known about the first:

  ```ts
  /**
   * The page two forward, named by the page one forward rather than by the
   * current page - the only thing that can name it. Undefined until that
   * neighbour's own payload lands, which is when the effect below asks for it.
   */
  const ahead = ownNext ? neighboursOf(known[ownNext])?.next : undefined
  ```

  In the prefetch effect (`:280-290`), add `if (ahead) prefetch(ahead)` after the two existing calls, add `ahead` to the reach array at `:286`, and add `ahead` to the dependency array. Rewrite the comment at `:283-284` so it states the new window and why it is asymmetric, replacing the "not worth a megabyte of memory" line that argues for the old one. Update the doc comment on `TextTvState.contentFor` (`:51-56`) if it still says "one swipe".

  Nothing else in the file changes. `prefetch` (`:252`) is unchanged: it already guards on `latest.current[target]`, the store, and the in-flight set, so R5 and R8 hold at the second depth for free.

  In `CONCEPTS.md`, rewrite the reach sentence of the **Prefetch** entry — "It reaches exactly one page in each direction, and after a page change only one further in the direction of travel" — to state two pages forward and one back, and why the two directions differ. The rest of that entry still holds: a prefetch is still a convenience that never evicts a stored page, and a failed one is still discarded.

- **Test scenarios** (app level, `msw` + fixtures, per `CLAUDE.md`):

  Both forward-chain tests below open with `takeOffAir('106', { prev: '105', next: '107' })` (`src/test/server.ts:19`, already used at `src/app.test.tsx:1551`). Without it 106 answers not-broadcast with empty neighbours, so 107 is unreachable by any implementation and both assertions would hold against a completely broken prefetch. (R12)

  - From a settled 104, the app requests `102`, `104`, `105` and `106`. Revises `hämtar båda grannarna när sidan har landat` (`:1245`), whose `toHaveLength(3)` wait becomes four. (R1, R2, R10)
  - From a settled 104, `107` is never requested, though 106 now names it. (R4, R11)
  - Committing 104 → 105 newly requests `107` alone — `106` was already fetched from 104's position, and `104` is not refetched. Revises `hämtar en sida till framåt efter ett byte, inte åt båda hållen` (`:1312`), whose own `toHaveLength(3)` wait becomes four before it snapshots the request count, and its explanatory comment. (R9)
  - Swiping back 105 → 104 still refetches neither, as `hämtar inte om grannen man kom ifrån när man sveper tillbaka` (`:1331`) asserts unedited. Run as-is; it is a regression check on the rotation, not a new test. (R3)
  - A held response for the page two forward leaves the current page fully interactive and unblocked — `holdPage` (`src/test/server.ts:65`) on `106`, open 104, assert 104's frame draws and the bar arrows work. The hold only bites once 105 has resolved, so wait for `106` to appear in the request set rather than on a fixed delay. (R7)

- **Execution note:** The two revised tests are revised in the same commit as the behaviour change; they cannot pass on either side of it alone. Before counting the R4 test as written, confirm it goes red by chaining a third hop — which is only observable because `takeOffAir` made 107 reachable — per the repo's standing check in `docs/solutions/best-practices/synthetic-events-produce-no-follow-on-events.md`.

- **Verification:** `npm test` green with no test outside `src/app.test.tsx` edited; `npm run build` clean.

---

## Key Technical Decisions

- KTD1. **The second hop is derived during render from `known`, not chained from a `.then`.** `neighboursOf(known[ownNext])?.next` is a pure read of state the hook already holds, computed in the same place `own` is (`src/useTextTv.ts:141`). Chaining inside `prefetch`'s `.then` would instead mean a fetch callback starting another fetch — untestable without timing, invisible in the dependency array, and one edit away from being unbounded. The derived form makes the depth bound structural: nothing reads `known[ahead]`, so there is no third hop. Governs R1, R2, R4.

- KTD2. **The existing prefetch effect fires it; no second effect is added.** The effect at `:280` already runs on `[pageNumber, ownPrev, ownNext, settled, prefetch]`; adding `ahead` to that list makes it re-run in the render in which the page one forward resolves, which is precisely when the second hop becomes knowable. A separate effect would duplicate the `settled` guard and the reach pruning, and the two would have to be kept in step. Governs R2.

- KTD3. **`prefetch` is not touched.** Its three guards — `latest.current[target]`, the store read, and the `prefetching` set (`:252-270`) — are depth-agnostic, as is its error handling. Depth is a property of who calls it, not of what it does. Governs R5, R8.

- KTD4. **The reach and the prefetch calls are widened together, in one edit.** The pruning at `:285-289` drops everything outside `reach`, so widening the window without widening `reach` would fetch the page two forward and throw it away at once: adding `ahead` to the effect's dependencies makes the effect re-run in the very render the second hop resolves, and the prune it carries would drop the page it had just asked for — worse than not fetching it. They are one decision expressed in two lines and are changed as one. Governs R6.

- KTD5. **Backward stays at one and is written down as a decision.** (session-settled: user-directed — chosen over a symmetric two-back window: reading runs forward, and the page behind the reader is the one they just left, already in hand.) No code changes for it; R3 exists so the suite keeps holding it and a future reader sees it was chosen. Governs R3.

---

- KTD6. **The forward chain is made testable with `takeOffAir`, not with a new fixture.** Reaching two pages forward from 104 needs 106 to name a neighbour, and 106 is not among the captured fixtures — unknown numbers answer `status: 'fail'` with empty `prevPage`/`nextPage`, which the client maps to a not-broadcast result naming nothing. `CLAUDE.md` makes `fixtures/raw_*.json` captured real responses, so hand-writing `raw_106.json` is not available. `takeOffAir` (`src/test/server.ts:19`) already exists for exactly this and is already used this way at `src/app.test.tsx:1551`. Without it both forward-chain assertions pass against any implementation, bounded or unbounded, which is the failure the repo's see-it-red rule exists to catch. Governs R9, R11, R12.

---

## Risks

| Risk | Response |
| --- | --- |
| Memory grows by one held page — on a fourteen-sub-page page that is real. | Bounded and explicit: reach goes from three pages to four and cannot grow further without another edit. The store's own eviction (`src/pageStore.ts:104-106`) is unchanged and still refuses to sacrifice a stored page for a prefetched one. |
| A background page's prefetch competes with the current page's fetch on a slow link. | Accepted, per the degradation decision. The second hop starts only after the first has resolved, so it never contends with the fetch for the page the reader is actually waiting on. |
| The revised tests bake in fixture-specific numbers (104/105/106/107). | They already do — the whole suite is anchored to the captured fixtures per `CLAUDE.md`. Only 104 and 105 have frames; 106 and 107 exist to the tests as request targets and named neighbours, which is why those assertions are on the request set rather than on rendered content (KTD6). |

## Origin

- `docs/plans/2026-08-26-0532-fix-swipe-hardening-plan.md` — the freshness window (KTD7) is what makes a prefetched page free to land on, and the held-pair rotation (KTD5) is what makes the page behind the reader the page they came from. This plan depends on both and changes neither.
- `docs/plans/2026-08-25-2005-feat-swipe-follows-the-finger-plan.md` — the gesture's geometry and the sheet rotation. Unchanged here.
- `docs/solutions/best-practices/synthetic-events-produce-no-follow-on-events.md` — a guard test counts as written only once seen red with the guard removed.
