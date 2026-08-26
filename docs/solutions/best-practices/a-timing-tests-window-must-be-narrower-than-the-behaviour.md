---
title: A timing test's window must be narrower than the behaviour it measures, or it cannot fail
date: 2026-08-26
category: best-practices
module: src
problem_type: best_practice
component: testing_framework
applies_when:
  - A test distinguishes a fast path from a slower one that reaches the same end state
  - The behaviour under test is a delay, a hold, a debounce, a cooldown, or a minimum duration
  - The assertion is written with `waitFor` and no explicit timeout
severity: high
tags: [vitest, testing-library, waitfor, timeout, vacuous-test, async-timing, mutation-testing]
related_components: [frontend, testing_framework]
---

# A timing test's window must be narrower than the behaviour it measures, or it cannot fail

## Context

The refresh flag in `src/useTextTv.ts` gained a floor, `MIN_REFRESH_VISIBLE_MS`, so that a refresh answering from the store still reads as work rather than as nothing happening. The floor has one exemption: a reader who navigates away is no longer waiting on the refresh they left behind, so the load effect's cleanup drops the flag straight down instead of running it through the hold.

That exemption needed a test, and the first one was written the obvious way:

```ts
await waitFor(() => expect(status()).not.toHaveClass('freshness__status--refreshing'))
```

It passed. It also passed with the exemption deleted — because `waitFor`'s default patience is 1000ms and the hold is 500ms, so the flag came down inside the window either way. The test could not tell *cleared immediately* from *cleared after the hold*; both are "eventually" when you wait a full second. It was caught only by mutating the code and re-running, which is this repo's standing rule.

The default is worth stating precisely, because the whole trap turns on it. `node_modules/@testing-library/dom/dist/config.js` sets `asyncUtilTimeout: 1000`, `wait-for.js` reads it whenever the caller supplies no timeout, and nothing in this project calls `configure()` — neither `vite.config.ts` nor `src/test/setup.ts` touches it. So a bare `waitFor` here waits up to a second, twice the duration it was being asked to discriminate.

## Guidance

**When a test's job is to prove something happens *before* something else would also make it true, the window is the assertion.** Not the matcher — the timeout. A generous window proves only that the assertion becomes true eventually, and the slower path under suspicion does that just as well as the fast one.

The fix is a timeout chosen to sit strictly between the two durations:

```ts
// The timeout is the assertion. Effect cleanup runs after paint, so the
// flag cannot be down in the very render that shows 100 - but it must be
// down long before the hold would have expired, or the wait the reader
// walked away from colours the page they walked to. waitFor's default
// patience outlasts the hold and would pass either way.
await waitFor(() => expect(status()).not.toHaveClass('freshness__status--refreshing'), {
  timeout: 150,
})
```

150ms is not a round number picked for comfort. It is above the one or two frames an effect cleanup needs to flush after paint, and far below the 500ms hold, so a build that routed cleanup through the hold would still be waiting when `waitFor` gave up. **Say so at the call site.** A bare number in a timeout reads as flake-padding and is exactly the kind of thing a later reader "tidies up" to a round 2000 — which silently restores the vacuum.

**The mirror-image technique is a real sleep before the assertion**, and it is the right one when the claim is that something is *still* true partway through:

```ts
await new Promise((resolve) => setTimeout(resolve, 250))
expect(status()).toHaveTextContent('Hämtar…')
```

250 is under the 500ms hold, so a build without the floor has already cleared the flag and the assertion throws. Same discipline, opposite direction: a narrow `waitFor` bounds how *late* something may happen, a sleep-then-assert bounds how *early*.

**Two questions catch the whole class.** Before writing `waitFor` around anything time-shaped, ask: what is the longest this may legitimately take, and what is the shortest the *wrong* implementation would take? If the second number is inside your window, the test cannot fail. If you cannot name both numbers, the test is not yet about timing.

## Where else this bites

Anywhere a fast path is exempted from a slow one and both reach the same end state: debounces, cooldowns, retry backoffs, minimum-visible floors, optimistic-then-reconciled updates. The suite's other timed tests were checked and are sound — the mark-lifetime test sleeps a real 900ms before asserting the mark is still solid, which is under its 1700ms lifetime and therefore has teeth, and its generous 3000ms `waitFor` for the fade is fine because the preceding sleep is what pins the bound that matters.

## Verification

Deleting the immediate-clear branch so navigation runs through the hold turns the exemption test red. Restoring it turns it green. That check is the only reason the vacuum was found at all: the test was green on first write, green after the mutation, and looked entirely reasonable both times.

This is worth generalising past `waitFor`. Any assertion with slack in it — a retry, a poll, a generous timeout, a `toBeCloseTo` with a wide delta — can absorb the defect it was written to catch. The repo's delete-the-guard-and-re-run rule is what makes that visible, and it costs a minute.

## Related Issues

- `docs/solutions/best-practices/synthetic-events-produce-no-follow-on-events.md` — the sibling in the same family: a check that cannot fail, found the same way. Different mechanism, though, and the distinction is the useful part. There the environment never produces the input, so no timeout would help and the fix is to dispatch more events. Here the input arrives and the *window* swallows the difference, so the fix is arithmetic on a constant the test already owns.
- `docs/solutions/best-practices/a-request-log-is-not-a-payload-log.md` — the other timing entry for this suite. That one is a fixed sleep racing a real round-trip and shows up as flake; this one is a fixed timeout swallowing a duration and shows up as a permanent false pass. Flake announces itself; this does not.
- `docs/solutions/best-practices/an-effect-that-clears-a-flag-in-cleanup-clears-the-one-that-just-set-it.md` — the same flag in the same effect, and the reason the cleanup path is delicate enough to need testing at all.
