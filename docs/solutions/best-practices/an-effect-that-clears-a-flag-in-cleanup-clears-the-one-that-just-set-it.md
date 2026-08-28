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
  - The caller can be invoked again before the previous invocation has settled
severity: high
last_updated: 2026-08-27
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

The load effect's dependencies are `[pageNumber, reloadCount, settleRefresh]` (`src/useTextTv.ts`), and `settleRefresh` is a `useCallback` with an empty dependency list, so `reloadCount` is the one that moves. `refresh()` raises the flag *and* bumps `reloadCount`, because bumping it is what forces the fetch past both freshness windows:

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
```

`readerAsked` is computed in the effect body, so each run's cleanup closes over its *own* answer. A pre-refresh run says no and leaves the flag alone. The refresh run says yes, so navigating away mid-refresh still clears it — which is the case the cleanup was there for.

**That guard alone is not enough, because the run being replaced can be a refresh too.** It answers "was this run a reader's", which is only the same question as "is a reader still waiting on it" while the previous run is an initial load or a background revalidation. Refresh twice in a row and the run being torn down is the *previous refresh*: its `readerAsked` is true, so its cleanup takes the flag straight back down, one frame after the second refresh raised it.

The note stays matching because `refreshWanted` is retired by leaving the page and never by the fetch resolving — it is compared, never consumed, so nothing about finishing the work retires it. The rule that keeps the note alive at one end is what makes it outlast its own run at the other.

So the cleanup asks twice — identity, then currency:

```ts
return () => {
  cancelled = true
  // Usually the run cleaned up here is the one *before* the refresh, whose
  // readerAsked is false. A second refresh in a row is the exception - the run
  // being replaced is itself a reader's - so the note is read again: refresh()
  // has already moved it on to the next count, and only a note still naming
  // this run means nobody is waiting any more.
  if (readerAsked && refreshWanted.current?.count === reloadCount) {
    window.clearTimeout(holding.current)
    setRefreshing(false)
  }
  if (inFlight.current === pageNumber) inFlight.current = undefined
}
```

The two reads of one ref do different jobs on purpose. `readerAsked` is captured in the body, so it describes *this* run; the second term reads the ref at cleanup time, because what it needs is what the newest run wrote. Leaving the page still drops the flag immediately: a page change does not bump `reloadCount`, so the note's count still matches and the guard passes. (The note itself is retired a moment later, by the new run's body.)

**The general shape.** A flag raised alongside a dependency bump is *always* exposed to this, and the exposure is invisible at the call site: `refresh()` reads as two independent statements. Three questions catch it:

- Does raising this flag change anything in the effect's dependency array?
- If so, does the cleanup that is about to run belong to the work I am flagging, or to the work I am replacing?
- Can the work I am replacing be another instance of the same thing?

The second question has to be answered *in the cleanup*, from data captured in its own run. A ref read at cleanup time holds whatever the newest run wrote, not what this run knew — which is exactly why the third question needs a *live* read of an identity, not a captured boolean. A boolean can only separate reader-work from background work; separating this run from the next one takes the count.

**This is a sibling of, not the same as, the compared-not-consumed rule.** `docs/solutions/best-practices/a-carve-out-flag-in-an-effect-must-be-compared-not-consumed.md` is about the same file and the same kind of ref, and it governs the *other* end: how long a flag lives. This one is about *when the effect runs at all*. A flag can be correctly compared-never-consumed, as `refreshWanted` is, and still be torn down a frame after it is set by a cleanup that never asked whose it was. Both were live in this change at once.

## Verification

Mutation-checked per this repo's standing rule in `docs/solutions/best-practices/synthetic-events-produce-no-follow-on-events.md`. Three mutations, measured against `src/app.test.tsx`'s `uppdatera sidan` block as it stands on 2026-08-27:

- Removing the guard entirely — clearing the flag unconditionally — turns ten tests red, including `säger Hämtar… i cyan medan läsaren väntar, och sedan den nya tiden` and every test that waits for `aria-disabled` on the refresh button.
- Removing only the `refreshWanted.current?.count === reloadCount` term turns exactly one red: `visar hämtningen lika tydligt andra gången i rad`, which refreshes, waits for the button to un-dim, refreshes again, and then asserts the cyan status and the dimmed button. A test that only clicks once cannot see this half at all.
- Removing only `readerAsked`, leaving the currency term, turns **nothing** red. The currency comparison alone covers every case the suite exercises; `readerAsked` adds the page check, and no test today distinguishes the two. Worth knowing before treating that term as tested.

## Related Issues

- `docs/solutions/best-practices/a-carve-out-flag-in-an-effect-must-be-compared-not-consumed.md` — the same file, the same ref pattern, the opposite end of the flag's life. Worth reading together; a future consolidation pass could merge them into one note about flags in this effect.
- `docs/solutions/best-practices/a-timing-tests-window-must-be-narrower-than-the-behaviour.md` — the flag also carries a minimum-visible hold, and that doc is how the tests for it are kept from passing vacuously.
- `docs/plans/2026-08-26-1826-feat-refresh-a-page-plan.md` — U1 and KTD2, and the "What Review Changed" table, which lists this among the defects that would have shipped.
