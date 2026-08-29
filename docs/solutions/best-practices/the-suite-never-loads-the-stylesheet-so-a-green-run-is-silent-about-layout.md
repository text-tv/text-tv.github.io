---
title: The suite never loads the stylesheet, so a green run is silent about layout
date: 2026-08-29
category: best-practices
module: src
problem_type: best_practice
component: testing_framework
applies_when:
  - A requirement is expressed in pixels, alignment, colour, or anything else you would check by looking
  - The change swaps one element type for another and leaves the CSS rule pointed at it
  - A plan or design hands over final numbers and the implementation claims to have matched them
  - Someone is about to report a passing suite as evidence the design was met
severity: high
tags: [happy-dom, vitest, vacuous-test, layout, css, playwright, browser-test, verification]
related_components: [frontend]
---

# The suite never loads the stylesheet, so a green run is silent about layout

## Context

`src/index.css` is imported by exactly one module, `src/main.tsx`, and the tests never render it — `src/app.test.tsx` mounts `<App />` directly. Every one of the 256 tests therefore passes without a single byte of the stylesheet being parsed, on top of happy-dom computing no layout in the first place.

This is not a gap you can feel while writing tests, because the suite is otherwise unusually thorough: it drives real gestures, fakes the network at the HTTP boundary, and catches genuine state bugs daily. It is easy to read a green run as a statement about the feature. For anything you would check by looking, it is not a statement at all.

Three defects in one day, all in the same bottom bar, none of them findable by any test in this suite:

1. `.bar__page-field` was written for a `<button>`, centring its text with `display: flex; justify-content: center` and sizing it with `min-width: 78px`. The element then became an `<input>`. Neither declaration does anything to an input: its value is drawn by the browser's own editor box, which only `text-align` moves, and its intrinsic width comes from the default `size` attribute, which `min-width` cannot cap. The field would have shipped left-aligned and roughly three times too wide.
2. An in-app keypad — since withdrawn, so do not look for it in the tree — set its height without `env(safe-area-inset-bottom)` while the band above it translated by the height *plus* that inset, so on a notched phone the bottom key row would have sat over a strip of page.
3. The focused input drew Chromium's default `outline: auto` — a box on all four sides of a control the design gives only a 2px underline.

The first two were caught by a reviewer reading the CSS. The third survived that review as a mere residual risk and was caught only by opening a real browser.

## Guidance

**Split requirements by what could falsify them, and say which is which.** This suite can falsify behaviour: what navigates, what is announced, what state survives a gesture. It cannot falsify appearance. A requirement written as "78px wide, centred, 2px bottom border, no radius" has no proof anywhere in the repo unless something renders it.

So when a plan hands over final numbers, one of two things has to be true, and the plan should say which: either a browser pass verified them, or they are asserted and unverified. Reporting "`npm test` passes" under a requirement of the second kind is not evidence — it reads as measurement while being inference.

**The failure mode to watch for is a CSS rule outliving the element it was written for.** Incident 1 is the general shape: styling is attached to a class, the class survives a change of element type, and the declarations quietly stop applying. Nothing errors. The rule still parses, the class still matches, the test still passes. When a change swaps `<button>` for `<input>`, `<div>` for `<button>`, or similar, re-read every declaration on its class and ask whether it still does anything to *this* element — `justify-content`, `line-height`, `padding` on a replaced element, and intrinsic sizing are the usual casualties.

**Run the browser when the requirement is visual, and do it before review rather than after.** A reviewer reading CSS caught two of the three; the one that got past them is exactly the kind a reviewer cannot hold in their head — a user-agent default interacting with the app's own rules. This checkout has Playwright available for that, which is documented in the gitignored `CLAUDE.local.md`; ask that file rather than probing for the binary, since it is not on `PATH` and not a project dependency.

A useful browser pass asserts the numbers the design actually named — `getBoundingClientRect().width`, `getComputedStyle(el).textAlign`, `outlineStyle` — not just that a page rendered. Screenshots are worth capturing beside those assertions: the focus-ring box was obvious in an image and invisible in every assertion written before it.

## Verification

Rendering `BottomBar` in the test environment and asking it what it knows:

```
BOUNDING RECT : {"w":0,"h":0,"x":0}
COMPUTED width: "" textAlign: ""
UA outline    : "" outlineStyle: ""
```

Zero rects are the documented happy-dom limitation. The empty strings are the sharper half: computed style returns nothing at all, because no stylesheet was ever loaded. This is not a case where an assertion would pass vacuously — an assertion of the real value would *fail*, which is why nobody writes one, and why the absence is silent rather than noisy.

The same three values read from Chromium against the running app: `78`, `center`, and `auto` — the third being the defect, caught nowhere else.

## Related Issues

- `docs/solutions/best-practices/synthetic-events-produce-no-follow-on-events.md` — the sibling gap in the same environment, and the doc that already named this one: it lists the no-layout gap among the family, and closes by saying geometry "needs a real headless browser, which is how the geometry claims in this repo have been checked before." That sentence predates the three incidents above by four days. It was already in the corpus while the layout defects were shipping, and the browser pass it prescribes was skipped anyway on the mistaken belief that no browser was available here. The corpus knew; the answer was in the directory `CLAUDE.md` points at.
- `docs/solutions/runtime-errors/canvas-getimagedata-is-colour-managed.md` — its Related Issues carries a fourth, previously unwritten incident of this same class: double-height rows sized by `font-size` clipped their headlines, and no test could see it. Same higher-order lesson — some classes of bug need a real render, and no test configuration fixes that.
- `docs/solutions/best-practices/measure-generated-lookup-tables-by-holding-data-out.md` — where "a check that cannot fail is not a check" was first named in this repo. This is that pattern applied to a whole dimension of the product rather than to one assertion.
- `docs/plans/2026-08-28-1954-fix-use-the-os-numeric-keyboard-plan.md` — R4 is the requirement in question, and KTD5 records why the button's centring rule could not survive the change to an input.
