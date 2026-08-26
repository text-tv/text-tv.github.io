---
title: A request log is not a payload log, so waiting on a request count proves less than it looks
date: 2026-08-26
category: best-practices
module: src
problem_type: best_practice
component: testing_framework
applies_when:
  - A test asserts on the set or count of pages the app has asked the network for
  - The behaviour under test derives one fetch from another fetch's payload
  - A test asserts that some page is never requested, and that page is only named by a fixture the suite does not have
severity: high
tags: [msw, vitest, prefetch, vacuous-test, flaky-test, fixtures, request-log, derived-state]
related_components: [frontend]
---

# A request log is not a payload log, so waiting on a request count proves less than it looks

## Context

The suite fakes the network at the HTTP boundary with msw and asserts against `requestedPages()` — the list of page numbers the app has asked for (`src/test/server.ts:57-59`). That log is the natural way to test the prefetch, because a prefetch has no other user-visible trace until the reader swipes onto it.

Widening the prefetch window to two pages forward made the app derive one fetch from another fetch's *payload*: the page two forward is named only by the page one forward, so it can only be asked for once that first neighbour's response has been parsed. The tests written against that change asserted request sets, and two separate things went wrong — both of which the request log actively disguised.

## Guidance

**A request is logged before it is answered, so a request count is not a payload.** The handler records the page and only then awaits the response:

```ts
requested.push(page)
await held.get(page)
```

(`src/test/server.ts:85-86`, and the `await` is what `holdPage` suspends on.) So `waitFor(() => expect(requestedPages()).toHaveLength(4))` returns while the fourth response is still in flight. Any assertion about state derived from that response — here, the fifth request the payload names — is then racing a fixed `settled()` sleep of 50 ms (`src/app.test.tsx:1242`) against a whole round trip. It passes on an idle machine and fails under load, roughly once in ten runs.

Wait on the causal signal instead of the clock:

```ts
await waitFor(() => expect(requestedPages()).toContain('107'))
```

`107` is only reachable once `106`'s payload has been read, so waiting for it waits for the thing that actually has to have happened.

**A negative assertion about a page nothing names is vacuous.** Only `100`, `104`, `105`, `200`, `331` and `377` have captured fixtures; every other number answers `status: "fail"` with empty `prevPage`/`nextPage` (`src/test/server.ts:98-99`), which the client maps to a not-broadcast result naming no neighbours. So a test asserting the chain never reaches three pages forward — `expect(requestedPages()).not.toContain('107')` — passes against *any* implementation, bounded or not, because nothing ever names `107` in the first place.

`takeOffAir` (`src/test/server.ts:19`) is the lever: it makes a non-fixture page answer not-broadcast *with real neighbours*, without hand-writing a fixture, which `CLAUDE.md` forbids because `fixtures/raw_*.json` are captured real responses.

```ts
takeOffAir('106', { prev: '105', next: '107' })
```

With that in place, chaining a third hop turns the guard red — `expected [ '104', '102', '105', '106', '107' ] to not include '107'` — which is the whole point.

**Assert the user-visible payoff too, not only the request set.** A request set says a page was fetched; it does not say the reader sees it. The test that actually pins the feature drags the neighbour sheet out and asserts it is not showing the loading state (`src/app.test.tsx:1405`). That one fails if the prefetch is removed, and it fails for the reason a reader would notice.

## Why This Matters

Both failures point the same way: the request log is the most convenient signal in this suite and the weakest. It is written early, it is written for pages that answer nothing useful, and it says nothing about what the reader sees. A test built on it looks specific — exact sorted arrays, named page numbers — while pinning much less than it appears to.

The vacuous-assertion half is another instance of the family in `docs/solutions/best-practices/synthetic-events-produce-no-follow-on-events.md`: a check that cannot fail is not a check, and deleting the thing under test is what exposes it. The mechanism is new, though. There the environment fabricated no events; here the fixture set makes the interesting page unreachable, so the assertion has nothing to be wrong about.

The flake half is worth separating from a merely slow test. It was found by running the suite repeatedly under deliberate CPU contention, and the same technique showed that a *different* intermittent failure in the same suite reproduces on the untouched base commit — so the two were not confused. A flake that only appears under load is invisible to a single green run, which is exactly when it gets committed.

## When to Apply

Whenever a test asserts on `requestedPages()`. Two checks, both cheap:

- Does anything the assertion depends on come from a response body? If so, wait for a consequence of that body, never for a request count or a fixed delay.
- Could the page in a `not.toContain` assertion ever be named at all? If no fixture and no `takeOffAir` names it, the assertion is decoration.

It does not apply to assertions about the *current* page's own load, where the request and the paint are the same event, nor to `toContain` assertions that something *was* fetched — those are true as soon as the request is logged, which is what the log honestly reports.

## Related Issues

- `docs/solutions/best-practices/synthetic-events-produce-no-follow-on-events.md` — the same "delete it and re-run" check, applied to hand-dispatched DOM events.
- `docs/plans/2026-08-26-1041-fix-preload-two-pages-ahead-plan.md` — the change that surfaced both failures; its KTD6 records why `takeOffAir` is used instead of a new fixture.
