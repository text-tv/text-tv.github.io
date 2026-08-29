---
title: A dispatched event produces no follow-on events, so a test must fire the whole chain itself
date: 2026-08-25
category: best-practices
module: src
problem_type: best_practice
component: testing_framework
applies_when:
  - A test drives behaviour by hand-dispatching DOM events rather than through a library that composes the chain
  - The behaviour under test responds to an event the test does not itself fire
  - The code under test guards against something the browser does on its own — a compatibility click, a focus change, a cancelled gesture
severity: high
tags: [happy-dom, synthetic-events, pointer-events, touch-compatibility, vitest, vacuous-test, event-chain]
related_components: [frontend]
---

# A dispatched event produces no follow-on events, so a test must fire the whole chain itself

## Context

Tests here run at the app level under Vitest with `happy-dom` (`vite.config.ts:50`) and the network faked with msw. The swipe gesture listens for raw pointer events on the frame container, and a committed swipe arms a capture-phase `click` listener on `document` to swallow the compatibility click the browser would otherwise deliver on whatever the finger lifted over (`armSwallow` in `src/useSwipeNavigation.ts`). Without that swallow, a swipe ending over a printed teletext link also follows the link.

The test for it dispatched `pointerdown`, `pointermove`, `pointerup` and asserted the destination page. It passed. It also passed with the swallow deleted, because no `click` was ever in flight: happy-dom synthesises nothing from a pointer sequence, and a real browser derives its compatibility click from *touch* events, not from script-dispatched pointer events. The guard was never reached, in either direction.

Two reviewers in the same review pass flagged it independently of each other. Deleting `armSwallow()` and re-running settled it: still green.

## Guidance

**Dispatch every event in the chain the behaviour spans.** The fix was one line — reuse the file's existing `tapAt` helper (`tapAt` in `src/app.test.tsx`) to fire the click the browser would have fired:

```ts
swipeFrom(container(), 340, 152, 240, 152)
tapAt(layer, 240, 152)
```

That test is now load-bearing: moving the swallow's listener from `document` to the container makes it fail, which is the case the `document` placement exists to handle — React's hotspot capture handler sits at the root, above the container.

**Delete the guard and re-run.** That is the whole check, it costs a minute, and it catches this entire class. If the suite is still green without the code under test, the test was never testing it. This is already the established technique in this repo: it is what caught two earlier vacuous tests, and it proved both the bug and the fix here (session history).

**Assume no derivation.** Nothing arrives that you did not send. Sibling cases with the same shape:

- compatibility `mousedown` / `mouseup` / `click` after `touchend`
- `focus` and `blur` around a click on a focusable element
- `change` after `input` on a form control
- `pointercancel` when the browser or OS claims a gesture

`@testing-library/user-event` composes these chains for the interactions it covers, which is why the neighbouring test that drives a real button (the `userEvent.click` counterweight test in `src/app.test.tsx`) needs no such care. Hand-dispatched events get nothing.

## Why This Matters

The test looked like a test of the swallow. It named the swallow, sat beside it, carried the requirement id, and was green — so it stood in for the coverage rather than admitting there was none. A missing test is visible; a test that cannot fail is worse, because it stops anyone from writing the real one.

This is not an isolated happy-dom gap but a family of them, and the repo has hit it repeatedly (session history):

- **No layout**, and no stylesheet either. Every element returns a zero-size rect and computed style comes back empty, so anything gated on geometry — hit-testing, sizing, positions — silently no-ops. A hotspot hit-resolution test was vacuous for exactly this reason, and a separate double-height CSS bug could not be caught by any test at all. Written up in full in `docs/solutions/best-practices/the-suite-never-loads-the-stylesheet-so-a-green-run-is-silent-about-layout.md`.
- **Proxy-backed `localStorage`.** Spying on the instance and on `Storage.prototype` both fail, because the proxy intercepts first. A quota-eviction test passed against a deliberately broken unbounded-eviction mutation until the whole storage object was replaced on `window`.
- **No event synthesis**, which is this doc.

The pattern underneath is the one `docs/solutions/best-practices/measure-generated-lookup-tables-by-holding-data-out.md` first named here — a check that cannot fail is not a check. `docs/solutions/runtime-errors/canvas-getimagedata-is-colour-managed.md` is the environment version: headless Chromium is always plain sRGB, so the suite structurally could not observe the bug. Here the environment fabricates no follow-on events, so the suite structurally could not observe the guard.

## When to Apply

Whenever a test drives behaviour by hand-dispatching DOM events and the behaviour under test responds to an event the test does not itself fire. That covers anything guarding against the browser's own follow-up: click swallows, double-fire suppression, focus restoration, gesture cancellation.

It does not apply where a library composes the chain for you — `userEvent.click` fires the pointer, mouse, focus and click events a real click carries.

Where the missing capability is layout or geometry rather than events, dispatching more events will not help: that needs a real headless browser, which is how the geometry claims in this repo have been checked before. `docs/solutions/best-practices/the-suite-never-loads-the-stylesheet-so-a-green-run-is-silent-about-layout.md` covers that case and how to run one here.

## Examples

The test as it stood, which passed with or without the guard:

```ts
swipeFrom(container(), 340, 152, 240, 152)
await currentPage('101')
```

`swipeFrom` (`swipeFrom` in `src/app.test.tsx`) dispatches exactly three `PointerEvent`s and stops. Its own comment now says so: *happy-dom synthesises nothing from a pointer sequence, so every event the gesture needs is spelled out here.*

The negative case in the same block is the counterweight and needed no repair — it asserts the swallow lets go of a click *outside* the frame, and drives that click through `userEvent.click`, which supplies the whole chain (the `userEvent.click` counterweight test in `src/app.test.tsx`).
