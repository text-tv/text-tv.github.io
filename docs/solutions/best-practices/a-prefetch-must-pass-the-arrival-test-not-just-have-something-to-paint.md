---
title: A prefetch that paints from a longer-lived store must pass the arrival test, not just have something to paint
date: 2026-08-27
category: best-practices
module: src
problem_type: best_practice
component: caching_layer
applies_when:
  - A prefetch can satisfy itself from a store that outlives the session, such as localStorage
  - Arrival applies its own freshness test before deciding whether to fetch behind the painted copy
  - The reader may dwell on the current page for minutes between the prefetch and the navigation it prepares for
  - A background refetch is visible, as a freshness status or a stale badge
severity: high
tags: [prefetch, cache, freshness, localstorage, arrival-window, threshold-margin, swipe, react]
related_components: [frontend]
---

# A prefetch that paints from a longer-lived store must pass the arrival test, not just have something to paint

## Context

Freshness in `src/useTextTv.ts` is two-tier. `ARRIVAL_WINDOW_MS` (an hour,
`src/useTextTv.ts:30`) is how old a copy already in hand may be and still be shown
on arrival without a fetch behind it; the load effect's `keep` test applies it to
`Math.max(fetchedAt(pageNumber), arrived.current[pageNumber] ?? 0)`
(the `keep` test in `src/useTextTv.ts`). `arrived` records when *this session's* payloads
landed. `fetchedAt` is the `localStorage` index, and `localStorage` outlives the
session.

The prefetch resolved a neighbour from that store and handed the stored copy over
as final, with no age check of any kind — so a copy an earlier session left behind
was passed forward having been tested for nothing but existence. It was usually
hours old, the arrival test then ran for the first time as the reader landed, and
the page refetched under them.

This was the fourth pass at "pages refresh after I swipe onto them" (session
history). The three before it each fixed a real and different cause — the prefetch
reaching only one page forward, freshness resting on a store write that may be
refused, and one freshness window doing two jobs — and the symptom survived each
time. The last of those sessions named this branch as an open residual and noted
that widening the arrival window to an hour makes it worse, not better: the wider
the window the arrival test allows, the more stored copies the prefetch waves
through untested. (session history)

## Symptoms

- The page swiped to lands with content already drawn, and the freshness bar then
  flashes grey **"Cachad · uppdaterar…"**: the page just landed on is being
  refetched under the reader.
- On a quick network the flash is almost too fast to see, and easy to report as
  "it still refreshes" without more detail.
- It never reproduces in the suite — only on a real device, and only in a session
  that is not the one that stored the page.

## What Didn't Work

**Blaming an in-flight prefetch.** The first hypothesis was that committing a
swipe onto a page whose prefetch is still running fetches it twice, because the
`keep` test consults `firstLoad`, `reloadCount`, `painted`, `fetchedAt` and
`arrived` but never `prefetching`. A scratch test reproduced exactly that: hold
105, open 104, swipe, 105 requested twice. The reader ruled it out — they are on a
quick network, where that race barely opens. That double fetch is real and still
open; it is not this bug.

**Counting requests over a swipe chain.** A scratch app-level test drove five
forward swipes over a synthetic 205→210 chain under StrictMode and counted every
request: one per landing, always for the page *two* ahead (the designed reach),
never for the page landed on. A `MutationObserver` on the freshness status saw a
single clean `Uppdaterad HH:MM` → `Uppdaterad HH:MM` transition.

**Why all of it came back clean.** Every test — the whole suite and the scratch
chain alike — prefetched its neighbours *in the same session, seconds earlier*.
`writePage` stamps the index then, and `arrived.current[target]` is stamped in the
same handler (the same handler in `src/useTextTv.ts`), so the copies were minutes-fresh by both
records. The store branch of `prefetch` — the one that reads what an *earlier*
session left behind — was never entered. The bug needs a session boundary plus
real elapsed time, and no test had either.

**The discriminator was the exact string, not more code reading.**
`FreshnessBar` maps three states to three strings
(`src/components/FreshnessBar.tsx:24-32`):

- grey **"Cachad · uppdaterar…"** → `stale`: the landed-on page is being refetched over a painted copy
- grey **"Hämtar…"** → nothing to paint on arrival
- cyan **"Hämtar…"** → `refreshing`: the reader asked for it themselves

Three strings, three code paths. The reader was on a phone with no devtools, so
they were asked to screen-record one swipe and scrub it frame by frame. "Cachad ·
uppdaterar…" named the branch in one word.

## Solution

A margin constant beside the arrival window (`src/useTextTv.ts:41`):

```ts
const PREFETCH_MARGIN_MS = 5 * 60 * 1000
```

Before, `prefetch` stopped at the store unconditionally:

```ts
const cached = readPage(target)
if (cached) {
  setKnown((known) => ({ ...known, [target]: cached.result }))
  return
}
```

After (`src/useTextTv.ts`):

```ts
const cached = readPage(target)
if (cached) {
  setKnown((known) => ({ ...known, [target]: cached.result }))
  // Painted either way; kept as the final word only while it is new enough
  // to survive the arrival test as well.
  if (Date.now() - cached.fetchedAt < ARRIVAL_WINDOW_MS - PREFETCH_MARGIN_MS) return
}
prefetching.current.add(target)
void fetchPage(target).then(/* unchanged: stamps arrived, writes the store */)
```

The stored copy is still painted immediately, so the neighbouring sheet has
content during the drag. It is only *kept as final* while enough of the arrival
window is left for it to survive the swipe too.

## Why This Works

The store branch deliberately does not stamp `arrived` — the copy did not arrive
in this session, and claiming otherwise would make a day-old page look minutes old
to the arrival test. That part was correct. What was missing is that the prefetch
returned as though the question were settled, when it had asked no question at
all. Painting a stored copy is cheap and right; treating it as the final answer is
a promise about age that only the arrival test is entitled to make.

The margin exists because the two tests run at different moments. A neighbour is
resolved when the reader lands beside it, and swiped to whenever they are ready —
a page later, or several minutes of reading later. Without a margin, a copy
fifty-nine minutes old passes the prefetch and fails the arrival test two minutes
afterwards: the same flash, just rarer.

One known asymmetry, left as-is: the prefetch judges by the stored entry's own
`fetchedAt`, while the arrival judges by `Math.max(index, arrived)`. Those agree
unless the index write was refused while the entry write succeeded, in which case
the prefetch can still wave through a copy the arrival will reject. Mirroring the
arrival's expression here would close it.

## Prevention

- **Anything read from a store that outlives the session arrives with an unknown
  age.** A prefetch that hands such a copy on must apply the consumer's freshness
  test, not the "we have something to paint" test.
- **Where a prefetch and its consumer share a threshold, the prefetch checks it
  with a margin.** Time passes between the two, and the reader controls how much.
- **Test with a cache copy that predates the session.** Every existing test wrote
  its cache in-session, seconds before reading it, so none could reach this
  branch. The shape that does: mount, let the page settle, **unmount** (the
  session ends), advance the clock past the window, remount, wait for the prefetch
  to request the neighbour, then swipe. That is
  "friskar upp grannen från en tidigare session innan man
  sveper dit", which asserts both no request for the page after the swipe and no
  "Cachad · uppdaterar…" on arrival. Without the fix it fails at the prefetch
  itself — `expected [ '104', '102', '106' ] to include '105'`.
- **Advance the clock; do not backdate one record.** With two age records plus a
  session boundary, editing a single stored timestamp models a world where time
  passed for storage alone. `letTimePass` ages every record at once, which is what
  makes the unmount meaningful.
- **When a UI-timing bug will not reproduce, ask which string the reporter saw.**
  Enumerate the states that produce each user-visible string and get the exact
  one; screen-record and frame-scrub works on a phone with no devtools. Here it
  collapsed the search from the whole load path to one branch.

## Related Issues

- [Freshness must not rest on a write the store is allowed to refuse](freshness-must-not-rest-on-a-write-the-store-may-refuse.md) — the other half of the same split: that one is about a copy the app cannot *tell* is fresh, this one about a copy it can tell is old.
- [A request log is not a payload log](a-request-log-is-not-a-payload-log.md) — why the regression test asserts the user-visible string as well as the request set.
- Still open: committing a swipe onto a page whose prefetch is in flight fetches it a second time, because the load effect consults `known`, the store and `arrived`, but never `prefetching`.
