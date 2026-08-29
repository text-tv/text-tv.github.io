---
title: A carve-out flag in an effect must be compared, not consumed
date: 2026-08-26
category: best-practices
module: src
problem_type: best_practice
component: frontend
applies_when:
  - "An effect holds a ref as a carve-out: a flag that forces work the ordinary guard would otherwise skip"
  - "The app is wrapped in StrictMode, so every effect runs, is torn down, and runs again"
  - "The flag is cleared as a side effect of the work it forces, rather than read and left alone"
severity: high
tags: [react, strictmode, useref, useeffect, cancellation, one-shot-flag]
related_components: [frontend]
---

# A carve-out flag in an effect must be compared, not consumed

## Context

The load effect in `src/useTextTv.ts` skips the network when the store says the page was fetched inside the last minute. Two cases must never take that fast path: the session's first load, so a restored page is never left unfetched, and an explicit `reload()`. Each is held open by a ref — `firstLoad` and `fetchedForReload`.

The obvious shape for both is a flag the effect spends: set it once, clear it when the work it forces has run. That shape is wrong here, and the file already carried the scar. `live` (where `live` is declared in `src/useTextTv.ts`) guards a prefetch result against landing after the app is gone, and it is re-armed on mount rather than only cleared on unmount, with a comment saying why: a ref left false after the first teardown would silence every prefetch for the rest of the session.

`StrictMode` — which `src/main.tsx` wraps the app in — mounts, tears down, and mounts again. The teardown sets the effect's own `cancelled` flag, so the first invocation's fetch resolves into a `.then` that returns without touching state. A flag the first invocation clears is therefore spent by a pass whose result was thrown away, and the second pass — the one that matters — finds the carve-out already fired. A restored page would paint from a stale stored copy with nothing behind it.

That version never shipped: plan review caught it before implementation, on the strength of `live`'s comment. What did ship was the same ref failing at the other end. `firstLoad` was cleared inside the fetch's `.then`, below `if (cancelled) return`:

```ts
void fetchPage(pageNumber).then((fresh) => {
  if (inFlight.current === pageNumber) inFlight.current = undefined
  if (cancelled) return
  if (firstLoad.current === pageNumber) firstLoad.current = undefined
```

A first load the reader swiped away from never resolves uncancelled, so the clear never ran. The flag named that page for the rest of the session and it refetched on every visit — the opposite failure, from the same habit of tying a flag's life to the success of the work it forces. Two reviewers found it independently, in the review pass that followed the change that introduced it.

## Guidance

**Read the flag in the guard; never let the work clear it.** Retire it on a trigger unrelated to whether that work succeeded.

```ts
// Retired when the effect next runs for a different page - not when the
// fetch it forced happens to resolve.
if (firstLoad.current !== undefined && firstLoad.current !== pageNumber) {
  firstLoad.current = undefined
}
```

The two working refs in this file show the shape. `firstLoad` holds a page number and is compared against the current one; `fetchedForReload` holds the last `reloadCount` the effect fetched for and is compared against the current count. Neither is a boolean, and that is the point: a value both invocations compute the same answer from is replay-safe, where a flag one invocation spends is not.

```ts
const keep =
  firstLoad.current !== pageNumber &&
  reloadCount <= fetchedForReload.current &&
  painted !== undefined &&
  Date.now() - Math.max(fetchedAt(pageNumber), arrived.current[pageNumber] ?? 0) <
    ARRIVAL_WINDOW_MS
```

The last term has since grown a second age record and a renamed window; the two
comparisons above are the part this doc is about, and they are unchanged. See
`docs/solutions/best-practices/freshness-must-not-rest-on-a-write-the-store-may-refuse.md`
for why the freshness half is now a `Math.max`.

**A flag cleared only on the success path leaks when that path can be abandoned.** Anything below an `if (cancelled) return`, inside a `.then` or a `finally`, runs only when the work was not abandoned. If the flag must be retired regardless, retire it somewhere that runs regardless.

The `.then` clear quoted above as the bug is still in the file. It stopped being
the bug when the page-change retire was added beside it — that one runs
regardless, so the `.then` line is now belt-and-braces rather than the only
retire. Read it as surviving history, not as an unfixed defect.

## Why This Matters

StrictMode's double invoke exists to surface effects that assume they run once, in order, to completion. A consumed flag survives being read once; it does not survive being read by a pass whose output is discarded and then never read again by the pass that lands. The failure is invisible in production, where there is no double invoke, and invisible to the type checker.

It is also invisible to the obvious test. Counting requests does not discriminate: StrictMode's discarded first pass issues the request either way, so the assertion is green with the bug and green without it. Only an outcome assertion catches it — here, a republished page's new timestamp actually reaching the freshness bar under `render(<App />, { wrapper: StrictMode })`. That makes this a specific instance of the rule `docs/solutions/best-practices/synthetic-events-produce-no-follow-on-events.md` already states for this repo: delete the guard, re-run, and if the suite is still green the test was never testing it.

The three instances in one file are the argument for writing it down. `live` was solved and commented; the same shape came back twice more in a single change, in a different guard, and was caught the second time only because someone had written the first one down.

## When to Apply

- Any `useRef` acting as a one-shot or "force this once" gate inside an effect.
- Any ref cleared inside the `.then`, `.catch` or `finally` of async work the effect started, especially with a cancellation check above the clear.
- Anything expressing "the first time" or "until this next happens" — exactly the semantics a replayed effect corrupts.

It does not apply to a ref that merely describes current state and is rewritten on every relevant path. `inFlight` in the same file is cleared in the completion handler, in the effect cleanup, and on the freshness-skip early return; it gates nothing one-shot, so replay costs it nothing.

## Examples

The shape to avoid, and why it reads as correct:

```ts
// Spent by whichever invocation happens to run first - under StrictMode
// that is the one whose result is discarded.
firstLoad.current = undefined
```

The shape that survives replay — a value compared, and retired by a different event than the one it forces:

```ts
if (firstLoad.current !== undefined && firstLoad.current !== pageNumber) {
  firstLoad.current = undefined
}
```

And the test that can actually fail, from `src/app.test.tsx`: mount under `StrictMode` over a stored copy younger than the freshness window, republish the page upstream, and assert the new timestamp reaches the bar. Written as a request count instead, it passes either way.

## Related

- `docs/solutions/best-practices/synthetic-events-produce-no-follow-on-events.md` — the repo's delete-the-guard-and-re-run rule, and the catalogue of checks that cannot fail. A request-count assertion under StrictMode belongs on that list.
- `docs/solutions/best-practices/a-hand-driven-css-transition-must-check-who-owns-the-element-before-finishing.md` — a different mechanism in a neighbouring file, reached by the same question: enumerate every path in, and ask what else may have run before this one.
