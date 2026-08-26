---
title: A transitionend listener on a container answers for its whole subtree, so it must check the event's target
date: 2026-08-26
category: best-practices
module: src
problem_type: best_practice
component: frontend
applies_when:
  - A hand-driven animation completes through a transitionend or transitioncancel listener
  - That listener is attached to a container rather than to a leaf
  - Anything inside that container is given a CSS transition, now or later
severity: high
tags: [css-transitions, transitionend, event-bubbling, gesture, state-machine, swipe]
related_components: [frontend]
---

# A transitionend listener on a container answers for its whole subtree, so it must check the event's target

## Context

The swipe gesture hands the end of its motion to CSS and finishes the job in a `transitionend` handler on the track: that handler performs the queued page change, or springs a cancelled snap back to centre. The pull gesture added a second one on its own wrapper, which retires the strip's label once the strip has finished sliding away.

Both were written as bare listeners:

```ts
moving?.addEventListener('transitionend', settle)      // wrong
strip?.addEventListener('transitionend', pullSettled)  // wrong
```

That was safe for as long as the only transitioning elements were the two the hook animates itself. It stopped being safe the moment the changed-row marks arrived, because `.text-frame__mark` carries `transition: opacity 500ms linear` and lives inside a decoded frame — inside a sheet, inside the swipe track. It is the first transitioning descendant that container has ever had.

`transitionend` and `transitioncancel` bubble. So every mark fading out, and every mark unmounted mid-fade, now called `settle()`. A mark fades roughly one and a half seconds after a refresh's decode lands; if a page swipe is in flight at that moment, `settle()` runs early, takes the queued page change, and navigates mid-animation.

## Guidance

**A listener on a container is answering for everything under it, forever — including elements nobody has written yet.** The bug here was not introduced by the code that broke; it was introduced by a feature two files away that added a transition to a leaf. Nothing in `useSwipeNavigation` changed, and nothing in it looked wrong.

**Check the target, and make it hard to forget:**

```ts
/**
 * Transitions bubble, and the changed-row marks put one inside both of these
 * subtrees for the first time: a mark fading out would otherwise finish a snap
 * that is still running, or retire the strip's label while it is still saying
 * what is being fetched. Only the element the hook itself animates may answer.
 */
const ownTransition = (element: HTMLElement | null, run: () => void) => (event: Event) => {
  if (event.target !== element) return
  run()
}

const onTrackTransition = ownTransition(moving, settle)
moving?.addEventListener('transitionend', onTrackTransition)
moving?.addEventListener('transitioncancel', onTrackTransition)
```

A shared wrapper is worth more than an inline `if` in each handler, because it makes the *next* listener inherit the rule rather than repeat the mistake. Keep the wrapped reference in a variable — a fresh closure passed to `removeEventListener` removes nothing.

**Prefer identity to `currentTarget` or `stopPropagation`.** `event.currentTarget` is the container in both cases and cannot tell them apart. Calling `stopPropagation` from the leaf pushes the fix into whichever component owns the transitioning element, which is exactly the component that has no idea a gesture handler is listening upstream.

**This is the third form of the same underlying question in this hook.** A completion handler must ask whether it is still the owner: `settle` already asks whether a new gesture has taken the element over, and the pull's close asks whether a gesture owns the strip. Asking *which element finished* is the same discipline pointed at the event rather than at the state. When adding any completion handler here, ask both: is this still mine, and is this even about me?

## Verification

The app-level test `avslutar inte ett svep när ett märke tonar bort` puts a committed swipe's snap in flight, then dispatches a bubbling `transitionend` from a mark and asserts the page did not change. Removing the target check turns it red.

Worth noting how this was found: the whole suite was green with the bug present, and it surfaced only from an adversarial review that asked what new transitions the change introduced into existing subtrees. No amount of testing the refresh feature in isolation would have reached it, because the interaction is with a gesture the refresh feature does not touch.

## Related Issues

- `docs/solutions/best-practices/a-hand-driven-css-transition-must-check-who-owns-the-element-before-finishing.md` — the same handler, the same file, the ownership half of the question. Read together: that one asks *whose* element it is, this one asks *which* element finished.
- `docs/plans/2026-08-26-1826-feat-refresh-a-page-plan.md` — the "What Review Changed" table; this was one of six defects that would otherwise have shipped.
