---
title: A hand-driven CSS transition is a state machine, and its completion handler must ask who owns the element now
date: 2026-08-25
category: best-practices
module: src
problem_type: best_practice
component: frontend
applies_when:
  - A gesture writes a transform straight to an element, then hands the rest of the motion to a CSS transition
  - The transition's completion event commits application state, and that commit lands a frame or more later
  - The code that takes over an in-flight transition also owns the handler that completes it
  - A reader can start a new gesture before the previous one's completion has run
severity: high
tags: [css-transitions, transitionend, transitioncancel, gesture, race-condition, swipe, state-machine]
related_components: [frontend]
---

# A hand-driven CSS transition is a state machine, and its completion handler must ask who owns the element now

## Context

The swipe gesture writes `transform` straight to the track element while the finger is down, and on release hands the rest to CSS: it sets a transition, sets the target, and lets `transitionend` finish the job (`src/useSwipeNavigation.ts:308-312`). `settle` is that finisher — it performs the queued page change, or springs a cancelled snap back to centre (`src/useSwipeNavigation.ts:250-269`).

That handler is not reached only from the happy path. Two other states can hold the track when it runs, and review found the hook mishandling both. They are the same mistake twice: a completion path assuming it is still the animation's owner.

The first is self-inflicted. A reader is allowed to press again mid-snap and take the animation over — the sheet stays put and the page change it was going to make is abandoned (`src/useSwipeNavigation.ts:194-199`). The takeover clears the transition, and clearing a running transition makes the browser fire `transitioncancel`, which is bound to `settle` (`src/useSwipeNavigation.ts:340`). The takeover provoked the very handler that would undo it.

The second is a gap. Navigation goes through the URL hash, so `navigate` only assigns `window.location.hash` and a listener applies it a frame or more later; the transform is deliberately held at its committed offset until the render carrying the new page lands, because resetting sooner paints the outgoing page snapped back to centre (KTD5, `docs/plans/2026-08-25-2005-feat-swipe-follows-the-finger-plan.md:144`). That window is enterable. A quick reader starts a new gesture inside it, and the delayed reset then wipes the new gesture's transform and unmounts the sheets it is dragging toward.

## Guidance

**Before a completion path resets the element, ask whether something else has taken it over.** Here the question is one ref:

```ts
const settle = () => {
  if (gesture.current) return
  ...
}
```

**Split "always" from "only if still mine".** The delayed half of the swap does two things, and only one of them is conditional (`src/useSwipeNavigation.ts:119-137`). The rotation that makes the neighbour's decoded sheet the current one must happen on every page change, so it runs first; the transform reset and the dragging flag are what a live gesture owns, so the effect returns before them:

```ts
latest.current.onSwap(direction)
if (gesture.current) return
```

Returning early from the whole effect would leave the sheets in the wrong slots. Returning too late would snatch the sheet from under the finger.

**Enumerate the paths into the handler, not the ways the animation ends.** `transitionend` is one. `transitioncancel` is another, and it fires for anything that stops a transition mid-flight — a cleared `transition` property, a changed target, a removed element — including your own cleanup code two functions away.

## Why This Matters

Both bugs are invisible to a reader who swipes once and waits, and both are cheap for a reader who does not. The takeover bug undoes a deliberate interaction: the finger lands, the sheet is grabbed, and a frame later the abandoned page change happens anyway. The delayed-reset bug is worse — the transform is wiped mid-drag and the neighbour sheets unmount with nothing left to mount them again, so the gesture continues against a track that no longer has anywhere to go.

Neither is reachable by reasoning about the animation in isolation. They only appear when the animation is treated as a state machine with in-flight windows and the question is asked at each transition: who else could be here? The two windows differ in origin — one opened by the app's own cleanup, one by the asynchrony of hash routing — and that is the point. Both were in-flight states nobody had in mind while writing the completion handler.

## When to Apply

Whenever code drives a CSS transition by hand rather than letting a library own it: you set the transition property, you set the target, and a `transitionend` or `transitioncancel` handler finishes the work. That handler needs an ownership check if any of these is true:

- something can interrupt the animation mid-flight — a new gesture, a route change, a resize
- your own code clears or replaces the transition anywhere, since that is a `transitioncancel` and therefore a re-entry
- the completion is split across an async boundary — a navigation, a fetch, a state update applied a frame later

It does not apply to a transition purely declared in CSS with no JS handler, and it does not apply where the element cannot be re-grabbed before the animation ends.

## Examples

Before, the takeover branch cleared the transition and left the rest to chance:

```ts
if (motion && moving?.style.transition) {
  origin = offsetOf(moving)
  moving.style.transition = ''
  ...
  queued.current = undefined
}
```

`queued.current = undefined` was the intended defence — abandon the page change — but the `transitioncancel` it provoked reached `settle`, which fell through to the cancelled-snap branch and reset the transform and the dragging flag anyway. The guard at `src/useSwipeNavigation.ts:254` is what makes the abandonment stick.

`src/app.test.tsx:942` is the regression guard: it grabs the track mid-snap, dispatches `transitioncancel` by hand, and asserts the grab still owns the transform, the neighbour sheets are still mounted, and the page never changed. `src/app.test.tsx:969` is the other one — it commits a swipe, starts a second gesture before the hash lands, and asserts the new gesture's offset survives the page change. Both were verified to go red with their guard deleted, which is the check this repo already uses for anything claiming to test a guard.

## Related

- [A dispatched event produces no follow-on events](synthetic-events-produce-no-follow-on-events.md) — the same file's event wiring seen from the test side: happy-dom fabricates nothing, so a test must fire the whole chain itself. Distinct problem, adjacent territory; the two are worth reading together when debugging this gesture.
- `docs/plans/2026-08-25-2005-feat-swipe-follows-the-finger-plan.md` — KTD5 records why the swap is split across `transitionend` and a render-gated reset, which is the design the second bug hid inside.
