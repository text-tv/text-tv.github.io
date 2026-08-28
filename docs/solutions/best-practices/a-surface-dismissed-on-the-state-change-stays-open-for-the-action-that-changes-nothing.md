---
title: A surface dismissed on the state change stays open for the action that changes nothing
date: 2026-08-28
category: best-practices
module: src
problem_type: best_practice
component: frontend
applies_when:
  - A transient surface - keypad, sheet, menu, popover - has to be put away when the reader moves on
  - The obvious trigger is an effect keyed on the state that moving on usually changes
  - Some route to "moving on" is idempotent, or the setter refuses a no-op
severity: high
last_updated: 2026-08-28
tags: [react, useeffect, navigation, dismissal, idempotent, keypad, bottom-bar, focus]
related_components: [frontend]
---

# A surface dismissed on the state change stays open for the action that changes nothing

## Context

The bottom bar's page field gained a keypad that rises when the field is tapped (`docs/plans/2026-08-28-1854-feat-merged-page-field-and-keypad-plan.md`, R11). It has to come down again when the reader gives up on entering a number and does something else instead — taps a quick link, an arrow, home, or refresh.

Every one of those routes navigates, and navigating changes the page number, which `BottomBar` already receives as a prop. So the dismissal wrote itself:

```tsx
useEffect(() => {
  if (open.current) close()
}, [pageNumber])
```

One effect, one dependency, and it covers the rail, both arrows, home, and every hotspot on the page at once. It is the shape the requirement seems to ask for — R25 was itself written as "any navigation that does not come from the field ends editing".

It is wrong for the navigations that go nowhere.

## Guidance

**Dismiss on the action, not on the state change the action usually causes.** Before keying a teardown to a value, ask whether the thing you are reacting to can run to completion without moving that value — and remember that "already there" is the most common way it can.

Here the app's own navigate refuses a no-op, by design:

```ts
const navigate = useCallback((next: PageNumber) => {
  if (!isPageNumber(next)) return
  // Assigning the hash pushes a history entry; the listener applies it.
  if (hashPage() === next) return
  window.location.hash = next
}, [])
```

(`src/useTextTv.ts:479-483`.) That guard is right — it keeps a duplicate history entry off the stack — and it is exactly what makes the dismissal miss. Press home while already on 100, or tap `100 NYHETER` while reading 100, and the reader has unmistakably moved on, but `pageNumber` never moves, the effect never runs, and the keypad stays up over digits that can no longer be committed. Refresh is worse: it is a control that is *never* supposed to change the page, so it could never fire the effect at all.

The damage is not only a stale overlay. The field owns the `keydown` handler that `Escape` arrives on, so a keypad stranded this way also strands the only keyboard route out of it.

**The fix is to move the trigger up to the thing the reader actually did.** `App` owns `editing` (KTD4 in the plan above), so it can wrap the navigation once and let every caller inherit the dismissal:

```tsx
const go = (page: PageNumber) => {
  setEditing(false)
  navigate(page)
}
```

and the same line at the top of `startRefresh`. `go` then replaces `navigate` at every seam — `QuickLinks`, `PageSheet`, `useSwipeNavigation`, and the bar's own `onNavigate`/`onHome` — so the keypad closes whether or not the page number ends up different.

**Keep the state-keyed effect as well, for the routes the shell never sees.** The two are not alternatives. `go` covers everything that goes through a control; the browser back button changes the hash with no control involved, and only the `[pageNumber]` effect catches that. The effect narrows from "the mechanism" to "the last resort", which is also the honest description of what it was always good at.

**Why this is easy to miss in review and in tests.** Every natural test of the feature navigates somewhere *else* — that is what makes it a legible test — so the whole no-op class goes unexercised while the mechanism looks thoroughly covered. The keypad's rail-link test passes against the broken version. You have to deliberately write the boring case: the control that lands you where you already are.

## Verification

Mutation-checked per this repo's standing rule in `docs/solutions/best-practices/synthetic-events-produce-no-follow-on-events.md`, against `src/app.test.tsx` as it stands on 2026-08-28:

- Dropping `setEditing(false)` from both `go` and `startRefresh` turns exactly two tests red: `stänger knappsatsen även när kontrollen inte byter sida` (home while already on 100) and `stänger knappsatsen när sidan uppdateras`. Every other keypad test still passes — including `stänger knappsatsen när sidan byts någon annanstans ifrån`, which taps a rail link to a *different* page and so is satisfied by the old effect alone. That test is the one that made the broken mechanism look right.
- Removing the `[pageNumber]` effect turned **nothing** red when this learning was first drafted: with `go` in place, no test reached the effect. `stänger knappsatsen när bakåtknappen byter sida` was written in response and is now the single test that fails for that mutation. Without it the effect is live code no test defends, and the next reader would be entitled to delete it.

## Related Issues

- `docs/solutions/best-practices/an-effect-that-clears-a-flag-in-cleanup-clears-the-one-that-just-set-it.md` — the same family and partly the same file: an effect keyed on a value that does not move when the triggering action runs. That one is about the effect firing at the wrong *moment*; this one is about it not firing at all.
- `docs/solutions/best-practices/a-carve-out-flag-in-an-effect-must-be-compared-not-consumed.md` — a third entry in the same lineage of "when does this effect actually run" questions in `src/useTextTv.ts`'s orbit.
- `docs/plans/2026-08-28-1854-feat-merged-page-field-and-keypad-plan.md` — R25 and KTD4. R25's first wording ("any navigation … ends editing") is what invited the state-keyed reading; it now names the control rather than the page change.
