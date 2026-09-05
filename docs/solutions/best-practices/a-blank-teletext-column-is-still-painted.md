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

SVT's full-width bars leave column 0 blank, and it is blank on most rows. That makes it the obvious place to put anything the app wants to add to a row without costing a character — a changed-row mark, a marker, an indicator — and the plan for the refresh feature says exactly that: the mark "costs no character and never sits on top of text" (`docs/plans/2026-08-26-1826-feat-refresh-a-page-plan.md`).

That last claim is too strong, and a later change learned it the hard way: column 0 is *not* blank on every row. Text rows use it for the `*` markers a page's own legend explains (`* = efter kl 15` on page 300, `* = efter kl 12` on page 104; see `fixtures/raw_104.json` rows 13 and 15 and `fixtures/raw_105.json` row 10). A change that treated column 0 as always-blank and hung it off the frame clipped those markers and was reverted — see `docs/plans/2026-09-05-1458-fix-frame-margins-plan.md`. The lesson below is unaffected: it is about the renderer, not about what the broadcast puts there.

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

That dependence on a later sibling is also the bleed's limit: it is a between-siblings technique only. The same crack opens *inside* a single element, between the background layers that paint one cell, and there the bleed has nowhere to go — see `a-half-pixel-bleed-only-works-between-siblings.md`.

**Being last is load-bearing, so say so where it is easy to undo.** The order of two JSX siblings is exactly the kind of thing a later reader tidies. The comment belongs at the element, not only in the stylesheet.

**The same trap is waiting for anything else added to a decoded row.** A focus ring, a selection highlight, a debug overlay — each one is a sibling of opaque boxes in a container that deliberately has no stacking order. Ask where it lands in paint order before asking what it looks like.

## Verification

The app-level test `ritar märket efter radens egna körningar` asserts the mark is its row's `lastElementChild`, not merely present. Moving the mark to the first child turns it red. This matters because the more obvious assertion — that marks exist at all — passes in either position: `happy-dom` has no paint, so nothing in the test environment can observe the covering directly. The structural assertion is the only thing that stands in for it, which is worth remembering the next time a rendering bug can only be checked by proxy.

## Related Issues

- `docs/plans/2026-08-26-1826-feat-refresh-a-page-plan.md` — KTD5 and U5; the plan's first draft carried the wrong reasoning ("column 0 is blank, so nothing is painted under it to be covered") and the "What Review Changed" table records the correction.
- `docs/solutions/best-practices/measure-generated-lookup-tables-by-holding-data-out.md` — the other place assumptions about the decoded grid had to be checked against what the resolver actually produces rather than against what teletext nominally contains.
- `docs/solutions/best-practices/a-half-pixel-bleed-only-works-between-siblings.md` — the boundary of the bleed this doc depends on, and what to do inside a single element instead.
