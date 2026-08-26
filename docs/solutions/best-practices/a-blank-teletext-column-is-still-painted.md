---
title: A blank teletext column is still painted, so column 0 is free space to a designer and occupied space to the renderer
date: 2026-08-26
category: best-practices
module: src/teletext
problem_type: best_practice
component: frontend
applies_when:
  - Something is drawn into a teletext cell the page itself leaves empty
  - The new element is a sibling of the resolved runs inside a row
  - The design reasons about the grid as characters rather than as painted boxes
severity: high
tags: [teletext, rendering, paint-order, stacking-context, css, decoded-frame]
related_components: [frontend]
---

# A blank teletext column is still painted, so column 0 is free space to a designer and occupied space to the renderer

## Context

SVT leaves column 0 blank on every page. That makes it the obvious place to put anything the app wants to add to a row without costing a character — a changed-row mark, a marker, an indicator — and the design for the refresh feature says exactly that: the mark "costs no character cell and never sits on top of text" (`misc/design/README.md`).

The reasoning is right about the page and wrong about the renderer. A blank column is blank *in the broadcast*; it is not absent from the DOM. `RowBuilder.space()` in `src/teletext/resolve.ts` emits a leading run of spaces, and that run carries the cell's background as a real, opaque colour, which `TextFrame` renders as a `backgroundColor` on an absolutely-positioned box. Column 0 arrives at the browser as a painted rectangle like any other.

A mark added as the row's **first** child was therefore drawn and then immediately covered by the run that followed it. Every mark invisible, on every page, with no error anywhere — the diff was correct, the CSS was correct, and the feature simply did nothing.

## Guidance

**Treat "the page leaves this cell empty" and "nothing is painted there" as different claims, and check the second one.** The first is about what SVT broadcasts. The second is about what the resolver emits, and the resolver emits something for every column of every row.

**Order the new element after the runs, and rely on paint order rather than a stacking order.**

```tsx
{row.runs.map((run) => (
  <RunElement key={run.col} run={run} gifDataUrl={gifDataUrl} />
))}
{marked.has(row.row) && <span className="text-frame__mark" aria-hidden="true" />}
```

The instinct is to reach for `z-index` instead. Do not. The rows and runs overlap their neighbours by half a pixel on purpose, to cover the cracks that open when a fractional cell width rounds two adjacent boxes apart — and that bleed only works because later siblings paint over earlier ones. The stylesheet says so where the bleed is defined: *"Beware of giving runs a stacking order: that is what makes this invisible."* Giving the mark a `z-index` would create a stacking context in the middle of that arrangement and trade an invisible mark for visible seams across the whole frame.

**Being last is load-bearing, so say so where it is easy to undo.** The order of two JSX siblings is exactly the kind of thing a later reader tidies. The comment belongs at the element, not only in the stylesheet.

**The same trap is waiting for anything else added to a decoded row.** A focus ring, a selection highlight, a debug overlay — each one is a sibling of opaque boxes in a container that deliberately has no stacking order. Ask where it lands in paint order before asking what it looks like.

## Verification

The app-level test `ritar märket efter radens egna körningar` asserts the mark is its row's `lastElementChild`, not merely present. Moving the mark to the first child turns it red. This matters because the more obvious assertion — that marks exist at all — passes in either position: `happy-dom` has no paint, so nothing in the test environment can observe the covering directly. The structural assertion is the only thing that stands in for it, which is worth remembering the next time a rendering bug can only be checked by proxy.

## Related Issues

- `docs/plans/2026-08-26-1826-feat-refresh-a-page-plan.md` — KTD5 and U5; the plan's first draft carried the wrong reasoning ("column 0 is blank, so nothing is painted under it to be covered") and the "What Review Changed" table records the correction.
- `docs/solutions/best-practices/measure-generated-lookup-tables-by-holding-data-out.md` — the other place assumptions about the decoded grid had to be checked against what the resolver actually produces rather than against what teletext nominally contains.
