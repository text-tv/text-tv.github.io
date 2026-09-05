---
title: A handoff document's claim about the data is a hypothesis to test against the fixtures, not a spec to implement
date: 2026-09-05
category: best-practices
module: src/teletext
problem_type: best_practice
component: frontend
applies_when:
  - A plan, design handoff or ticket states a factual premise about the shape of external data
  - A geometry, layout or parsing decision is derived from what the upstream feed "always" does
  - An option is rejected on the strength of such a premise because a rival option looks free
  - A verification step is being written for a change that has a plausible wrong implementation
severity: high
tags: [teletext, design-handoff, fixtures, verification, column-0, decoded-frame, css, premise]
related_components: [frontend]
---

# A handoff document's claim about the data is a hypothesis to test against the fixtures, not a spec to implement

## Context

SVT draws its full-width colour bars across page columns 1-39 and leaves column 0 blank on those rows. Rendered full-bleed — the drawn frame exactly 40 cells, the width of the broadcast page — that leaves a whole cell of black to the left of every bar and none to its right. A reader noticed the asymmetry on a phone and reported it.

A design handoff lived at `misc/design/README.md`. It is worth knowing up front that `misc/` is gitignored, so that file is untracked and invisible to anyone reading the history: it was a handoff, not a record. It asserted, flatly, that **SVT leaves column 0 blank on every page**, and it specified geometry that followed from that premise and evened the bars for free — size the grid on 39.84 columns (39 plus two 0.42-cell margins) and hang column 0 off the frame's left edge, clipping all but a sliver of it. No type-size cost, both margins equal. On the strength of that same premise the document explicitly *rejected* the obvious alternative, a 41-cell frame, on the grounds that it "costs every page 2.4% of its type size for a margin nobody asked to be that big".

The free option was implemented and deployed to production. It was wrong. Column 0 is blank on bar rows, but text rows use it for `*` markers that each page's own legend tells readers to look for: `* = efter kl 15` on page 300, `* = efter kl 12` on page 104. Clipping the hang cut those glyphs to their right 42%, silently destroying content the page explicitly points at. The evidence was sitting in the repository the whole time — `fixtures/raw_104.json` rows 13 and 15, and `fixtures/raw_105.json` row 10. The change was reverted in commit `36413e0`.

The fix that shipped is PR #4. The drawn frame is now 41 cells wide with the 40-column page flush left, so an app-owned spare cell on the right balances the broadcast's blank column 0 on the left. A bar runs from frame edge 1 to frame edge 40 with exactly one cell of black either side, and column 0 stays fully visible. That is precisely the option the handoff had rejected — rejected only because hanging column 0 appeared to cost nothing. Once that turned out to cost content, the rejected option became the right one. Its price is real and was paid knowingly: a cell is 1/41 rather than 1/40 of the available width, so type is 2.44% smaller on every page.

## Guidance

**Treat every factual claim a handoff makes about upstream data as a hypothesis, and test it before any code derives from it.** A design document is authoritative about what the design wants. It is not authoritative about what the broadcast contains, what the API returns, or what the fixtures hold — those are facts of the world, and the document's author was inferring them from a handful of pages the same way you would. The claim "column 0 is blank on every page" is not a requirement anyone can satisfy or violate; it is either true of the feed or it is not.

**Test it against the fixtures, because that is minutes of work.** `fixtures/raw_*.json` are captured real responses and, per `CLAUDE.md`, the single source of truth for what the API sends. Every sub-page carries an `altText` — the page as plain text, one line per row — so a claim about a column is one scan away:

```bash
node -e 'const fs=require("fs");for(const f of fs.readdirSync("fixtures").filter(n=>n.startsWith("raw_"))){const j=JSON.parse(fs.readFileSync("fixtures/"+f,"utf8"));for(const sp of j.data.subPages||[]){const bad=(sp.altText||"").split("\n").map((l,i)=>[i,l]).filter(([i,l])=>l.length&&l[0]!==" "&&l[0]!=="\r");if(bad.length)console.log(f,sp.subPageNumber,bad.map(([i,l])=>i+":"+JSON.stringify(l[0])).join(" "))}}'
```

It prints two lines:

```
raw_104.json 104-01 13:"*" 15:"*"
raw_105.json 105-01 10:"*"
```

That is the entire difference between the reverted change and the shipped one. "Blank on every page" and "blank on bar rows" look like the same sentence in a design document and are not the same sentence at all: the first licenses throwing column 0 away, the second forbids it.

**Re-open every option the premise closed.** This is the part that is easy to skip once the premise falls. The handoff did not merely propose the wrong geometry; it *rejected the right geometry* using the same false claim, and the rejection reads as a settled trade-off — 2.4% of type size for nothing anybody asked for. That reasoning was sound given a free alternative and worthless without one. When a premise is falsified, the decisions it justified are not merely suspect; the decisions it justified *rejecting* are back on the table, and one of them is likely now correct.

**Write checks that would come out differently if the change were wrong.** The replacement plan first specified checking the GIF fallback for "no vertical gap between the image and its frame box". `.frame__gif` is sized `height: 100%` (`src/index.css:427-433`), so a wrong aspect ratio *stretches* the image rather than leaving a gap: the assertion would have passed under both the correct `533 / 400` ratio and the old `520 / 400` one, and proved nothing. Asserting the rendered width-over-height ratio against the native 520/400 distinguishes them, and that is what the shipped verification did. Before writing a check, ask what value it would report if the change were wrong. If the answer is "the same value", it is not a check.

**Nothing in this area is guarded by the test suite, so say so rather than implying otherwise.** `npm test` never loads the stylesheet and its DOM computes no layout — the full argument is in `docs/solutions/best-practices/the-suite-never-loads-the-stylesheet-so-a-green-run-is-silent-about-layout.md`. Verification here was a manual Chromium pass, and no CI guard exists for the geometry. A fixture-level test asserting that every full-width coloured run spans columns 1-39 would guard the load-bearing premise without needing layout at all; it was proposed and not implemented, and it remains the cheapest way to stop this premise drifting back in.

## Why This Matters

The cost of skipping the fixture scan was not a build failure or a red test. It was a production deploy that destroyed content the page itself told readers to look for, discovered by a reader on a device, followed by a revert, a re-decision and a second implementation. The check that would have prevented it is one shell command over files already in the repository.

The deeper cost is the rejected option. Had the premise been tested first, the 41-cell frame would have been chosen on its merits at the outset and its 2.44% type cost accepted as the price of keeping column 0 — which is exactly the conclusion the project reached anyway, two implementations later. A false premise does not only produce a wrong change; it produces a *confident* wrong change, because the geometry it implies is genuinely elegant and genuinely free. Elegance is what makes an untested premise dangerous: the free option is the one that gets built.

And a premise about external data does not fail loudly. Nothing throws when a `*` is clipped to 42% of its width. There is no error, no console warning, no failing assertion; the page simply renders slightly wrong on the small subset of rows where the premise does not hold, which is why it survived a deploy and reached a reader.

## When to Apply

- A plan, ticket or design handoff states something as fact about SVT's output, an API's response shape, or any data the project does not itself produce — especially with a universal quantifier: *every* page, *always*, *never*.
- A layout, parsing or geometry decision is derived from that claim, so that the claim is load-bearing rather than incidental.
- One option looks free relative to another *because* of that claim. The free-looking option is the one to distrust; check the premise before building it, and re-check the rejected option after.
- A handoff document lives outside version control (here, under gitignored `misc/`). It cannot be reviewed with the diff, will not appear in `git log`, and nobody after you can tell what it claimed — so its claims deserve more scrutiny than a checked-in plan's, not less.
- Any time a verification step is being written for a change with a plausible wrong implementation: ask what the check reports under the wrong one.

## Examples

**The premise, before and after.** From the handoff: *"SVT leaves column 0 blank on every page."* After the scan: blank on bar rows; used on text rows for legend-referenced `*` markers, on three rows across two sub-pages of the fixture set alone. One universal quantifier, one command, forty seconds.

**Before — the reverted geometry.** The grid was sized on 39.84 columns (39 content columns plus two 0.42-cell margins) and column 0 was hung off the frame's left edge, all but a 0.42-cell sliver clipped away. Bars evened, type size untouched, `*` markers cut to their right 42%. Reverted in `36413e0`.

**After — the shipped geometry (PR #4).** A drawn frame of 41 cells with the 40-column page flush left. The constants are named once and derived three ways, in `src/index.css`:

```css
--frame-native-w: 533;                 /* :50 — 41 cells of 13 broadcast pixels */

.frame {                               /* :407 */
  aspect-ratio: var(--frame-native-w) / calc(400 * var(--leading));  /* :410 */
  container-type: inline-size;         /* :411 — this is the query container */
  --cell-w: calc(100cqw / 41);         /* :412 */
  --page-w: calc(var(--cell-w) * 40);  /* :413 */
}
```

`--frame-native-w` also drives `--frame-max` (`src/index.css:82-86`), the reading column's cap. The three page layers below — `.frame__gif` (`:427`), `.text-frame` (`:449`) and `.hotspots` (`:617`) — are each `--page-w` wide and pinned to `left: 0`, so the frame's spare cell always lands on the right. The two that were previously `inset: 0` say `right: auto` explicitly to undo it; `.frame__gif` never set `right`, so it inherits the same behaviour from the default. The stylesheet carries the reasoning at `.frame` itself, including why hiding column 0 is not free and what the 2.4% buys.

**The verification, and what makes it a verification.** In Chromium at a 390px width: bar margins of 9.45px and 9.47px against a 9.463px cell — one cell either side; the column-0 `*` starting exactly at the frame's left edge rather than 5.64px outside it; and the GIF fallback rendering at a 1.30003 width-over-height ratio against the 1.3 native. That last number is the one the first draft of the plan would have missed, because it asserted the absence of a gap that `height: 100%` guarantees either way.

Review then decoded all 18 decodable fixture sub-pages independently at the 13x16 cell level, and reports doing the same for 61 pages fetched live from `https://www.svt.se/text-tv/api`. Across every one of them, a 39-cell coloured run started at column 1 and ended at column 39, with no coloured background anywhere in column 0. That is the premise the shipped geometry actually rests on, stated narrowly enough to be true and measured over enough pages to be believed. Note the difference in kind from the handoff's version: same subject, a quantifier that survives contact with the data, and a number attached to how much data it survived.

## Related Issues

- `docs/solutions/best-practices/a-blank-teletext-column-is-still-painted.md` — the other half of the column-0 story, and already carrying the correction: a column blank in the broadcast is still an opaque painted box in the DOM. Between them: column 0 is neither reliably empty in the feed nor absent from the render.
- `docs/solutions/best-practices/the-suite-never-loads-the-stylesheet-so-a-green-run-is-silent-about-layout.md` — why `npm test` says nothing about any of this, and what a browser pass has to assert to be worth running.
- `docs/solutions/best-practices/measure-generated-lookup-tables-by-holding-data-out.md` — where "a check that cannot fail is not a check" was first named in this repo; the gap-versus-ratio assertion above is that principle applied to a single line of a verification plan.
- `docs/plans/2026-09-05-1458-fix-frame-margins-plan.md` — the plan built on the false premise, kept as the record of what was believed.
- `docs/plans/2026-09-05-1610-fix-even-bar-margins-41-cell-frame-plan.md` — the replacement. KTD1 works through why flush left is the only placement that balances a bar, and KTD3 is the gap-versus-ratio argument in its original form.
