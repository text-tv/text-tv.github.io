---
title: Freshness must not rest on a write the store is allowed to refuse
date: 2026-08-26
category: best-practices
module: src
problem_type: best_practice
component: caching_layer
applies_when:
  - Code decides whether to skip work by asking when something was last written down
  - The write it asks about is best-effort — it may be dropped on quota, or there may be no storage at all
  - The thing being judged is already in memory, so the answer is knowable without the store
severity: high
tags: [localstorage, quota, prefetch, freshness, cache, silent-failure, best-effort-write, pwa]
related_components: [frontend]
---

# Freshness must not rest on a write the store is allowed to refuse

## Context

Navigating to a page skips the network when the app already has a copy new enough to serve. The load effect decides that with `fetchedAt(pageNumber)` (`src/pageStore.ts:67-70`), which reads the timestamp index out of `localStorage`.

That was the only record of when a page arrived, and the store is allowed not to keep it. Two ways:

- **Quota.** A prefetch writes in `prefetch` mode, which refuses to evict a page the reader actually visited and gives up instead (`src/pageStore.ts:106`). Nothing is stored, so nothing is indexed. Teletext frames are base64 GIFs, so a stored page is large: the captured fixtures run 12–16 KB for a single sub-page and 172 KB for the fourteen-sub-page one. A phone read on for a few days sits at quota routinely.
- **No storage at all.** `storage()` returns `undefined` when `localStorage` throws (`storage()` in `src/pageStore.ts`), and `fetchedAt` then answers `0` for every page, forever.

In both cases the payload is still in memory, already painted on screen. The app just had no record saying so, so it refetched — on every landing, defeating the prefetch entirely in exactly the conditions the prefetch was for.

## Symptoms

- Swiping onto a page visibly reloads it, even though the app fetched it seconds earlier and it is already drawn.
- It happens on *every* navigation, not intermittently, and only on a real device — never in the suite.
- Widening the prefetch window changes nothing, because the pages are being fetched correctly and then distrusted.

## What Didn't Work

- **Fetching more, earlier.** The prefetch window had just been widened from one page each way to two forward. That was necessary but not sufficient: it fixed *whether the page was fetched*, not *whether the app believed it had been*.
- **Trusting the test suite.** Every test passed. Each starts against a fresh `localStorage`, so the index write always succeeded and `fetchedAt` always answered honestly. The bug lives entirely in the branch the tests never entered.
- **Reading the review as clean.** The pre-ship review did surface the ingredient: it noted that a prefetch-mode write quietly does nothing when the store is near quota, and separately that a fresh index entry can outlive the copy it describes. Both were recorded as residual risks rather than defects — and the inverse case, a copy outliving its index entry, is precisely the bug that shipped. (Recorded from the review pass itself; it left no artifact in the repo to cite.)

## Solution

Record arrival where the payload lives, and take whichever record is newer:

```ts
const arrived = useRef<Record<PageNumber, number>>({})
// ...
Date.now() - Math.max(fetchedAt(pageNumber), arrived.current[pageNumber] ?? 0) <
  ARRIVAL_WINDOW_MS
```

`arrived` is written wherever a payload enters memory — the ordinary load and the prefetch, both in `src/useTextTv.ts` — beside the store write rather than depending on it (`src/useTextTv.ts:164-170`). The window it is compared against was a single `REVALIDATE_AFTER_MS` when this was written; it has since split in two, and arriving on a page is now governed by `ARRIVAL_WINDOW_MS` (`src/useTextTv.ts:30`).

`Math.max` is what makes it safe in both directions. The store's record still counts, so a copy restored from storage across a session is dated correctly. The memory record still counts, so a page the store refused is not treated as unfetched. A page genuinely older than the window revalidates either way.

## Why This Works

There were always two facts and only one of them was being read: *what the app is holding* and *what the store managed to persist*. They come apart whenever the store declines a write, which it is explicitly designed to do — refusing to evict a visited page for a speculative one is correct behaviour, not a failure.

The skip condition already guarded the opposite drift: it requires `painted !== undefined`, so a stale index entry whose copy was dropped cannot skip a fetch with nothing on screen. That asymmetry is the tell. One direction of the split was understood and handled; the other was not.

## Prevention

- **When you ask "how old is this?", ask the thing you are holding, not the thing you tried to save.** A best-effort write is not a source of truth about in-memory state.
- **Trace every `catch {}` and silent early return that a caller later reads through.** `writePage`'s prefetch bail is deliberate and correct in isolation; it became a bug only because a distant reader treated its absence as evidence of age.
- **Test the degraded storage branch, not only the happy one.** The suite already had a `useFullStore` harness whose page writes throw; the freshness path simply had no test through it. The regression test now swipes onto a prefetched neighbour with the store refusing every write, and fails without the fix.
- **Simulate elapsed time by moving the clock, not by editing one record of it.** The staleness test used to backdate the store index by hand. Once a second record existed, that stopped modelling anything — it described a world where time passed for storage alone. It advances `Date.now` instead, which ages every record at once and made the test stricter.
- **A review residual that names a silent failure next to the mechanism you are changing deserves promotion to a defect.** This store behaviour was described accurately during review and still shipped, because "pre-existing" was read as "not mine". The change did not create the silent write-drop; it made the app depend on it.

## Related Issues

- [A prefetch that paints from a longer-lived store must pass the arrival test, not just have something to paint](a-prefetch-must-pass-the-arrival-test-not-just-have-something-to-paint.md) — the other direction of the same split. This doc is about a copy the app cannot *tell* is fresh; that one is about a copy it can tell is old, handed on by the prefetch without being tested at all.
- `docs/solutions/best-practices/a-request-log-is-not-a-payload-log.md` — the same shape one layer up: a convenient signal standing in for the one that matters, in tests rather than in production.
- `docs/plans/2026-08-26-1041-fix-preload-two-pages-ahead-plan.md` — the prefetch-window widening this bug was hiding behind.
