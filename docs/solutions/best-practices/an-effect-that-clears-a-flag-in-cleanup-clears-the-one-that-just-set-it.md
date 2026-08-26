---
title: An effect that clears a flag in its cleanup clears the flag the caller just set
date: 2026-08-26
category: best-practices
module: src
problem_type: best_practice
component: frontend
applies_when:
  - A callback raises a flag and bumps a piece of state in the same breath
  - That state is a dependency of an effect, so raising the flag re-runs the effect
  - The effect's cleanup clears the flag, to cover the case where the work is cancelled
severity: high
tags: [react, useeffect, cleanup, dependency-array, state-flag, race-condition, refresh]
related_components: [frontend]
---

# An effect that clears a flag in its cleanup clears the flag the caller just set

## Context

`useTextTv` gained a reader-initiated refresh beside the background revalidation it already had. Both go through the same fetch; the only new thing is a flag saying *which*, because only a reader-initiated one turns the freshness status cyan, dims the refresh button, and holds the pull strip open (`docs/plans/2026-08-26-1826-feat-refresh-a-page-plan.md`, R2).

The flag has to come down again on all three endings: the fetch resolves, the fetch fails, or the reader leaves the page before it lands. The third is a cancellation, and cancellation in an effect is what cleanup is for. So the obvious shape is a cleanup that clears it:

```ts
return () => {
  cancelled = true
  setRefreshing(false)          // wrong
  if (inFlight.current === pageNumber) inFlight.current = undefined
}
```

That clears the flag roughly one frame after it is raised, every single time.

## Guidance

**Before writing anything into a cleanup, ask what re-runs the effect — and whether the thing you are reacting to is one of them.**

The load effect's dependencies are `[pageNumber, reloadCount]` (`src/useTextTv.ts`). `refresh()` raises the flag *and* bumps `reloadCount`, because bumping it is what forces the fetch past both freshness windows:

```ts
const refresh = useCallback(() => {
  setRefreshing(true)
  setReloadCount((count) => {
    refreshWanted.current = { count: count + 1, page: pageNumber }
    return count + 1
  })
}, [pageNumber])
```

React reacts to a changed dependency by running the **previous** run's cleanup and then the new run's body. So the sequence for a refresh is:

1. `setRefreshing(true)`
2. `reloadCount` changes
3. cleanup of the *pre-refresh* run — which clears `refreshing`
4. the new run's body starts the fetch nobody can now see is running

The symptom is that the whole feature silently does nothing visible: no cyan status, no dimmed button, and a pull strip that shuts the instant it finishes parking. The fetch itself works perfectly, which is what makes it confusing — the network tab is right and the screen is wrong.

**The fix is to make the cleanup ask whose run it is cleaning up.** The same comparison the response path uses already answers it:

```ts
const readerAsked =
  refreshWanted.current?.count === reloadCount && refreshWanted.current.page === pageNumber

return () => {
  cancelled = true
  // The run being cleaned up here is the one *before* the refresh, whose
  // readerAsked is false, so the flag the reader just raised survives. A page
  // change during the refresh run does reach this with it true, and clears it.
  if (readerAsked) setRefreshing(false)
  if (inFlight.current === pageNumber) inFlight.current = undefined
}
```

`readerAsked` is computed in the effect body, so each run's cleanup closes over its *own* answer. The pre-refresh run says no and leaves the flag alone. The refresh run says yes, so navigating away mid-refresh still clears it — which is the case the cleanup was there for.

**The general shape.** A flag raised alongside a dependency bump is *always* exposed to this, and the exposure is invisible at the call site: `refresh()` reads as two independent statements. Two questions catch it every time:

- Does raising this flag change anything in the effect's dependency array?
- If so, does the cleanup that is about to run belong to the work I am flagging, or to the work I am replacing?

The second question has to be answered *in the cleanup*, from data captured in its own run. A ref read at cleanup time holds whatever the newest run wrote, not what this run knew.

**This is a sibling of, not the same as, the compared-not-consumed rule.** `docs/solutions/best-practices/a-carve-out-flag-in-an-effect-must-be-compared-not-consumed.md` is about the same file and the same kind of ref, and it governs the *other* end: how long a flag lives. This one is about *when the effect runs at all*. A flag can be correctly compared-never-consumed, as `refreshWanted` is, and still be torn down a frame after it is set by a cleanup that never asked whose it was. Both were live in this change at once.

## Verification

Deleting the `readerAsked` guard from the cleanup turns six tests red in `src/app.test.tsx`'s `uppdatera sidan` block, including `säger Hämtar… i cyan medan läsaren väntar` and every test that waits for `aria-disabled` on the refresh button. Confirmed by mutation before the guard was counted as tested, per this repo's standing rule in `docs/solutions/best-practices/synthetic-events-produce-no-follow-on-events.md`.

## Related Issues

- `docs/solutions/best-practices/a-carve-out-flag-in-an-effect-must-be-compared-not-consumed.md` — the same file, the same ref pattern, the opposite end of the flag's life. Worth reading together; a future consolidation pass could merge them into one note about flags in this effect.
- `docs/plans/2026-08-26-1826-feat-refresh-a-page-plan.md` — U1 and KTD2, and the "What Review Changed" table, which lists this among six defects that would have shipped.
