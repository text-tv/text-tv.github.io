---
title: Reading Column Gutters - Plan
type: fix
date: 2026-08-23
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: conversation
execution: code
---

# Reading Column Gutters - Plan

## Goal Capsule

- **Objective:** On a phone, the teletext frame no longer runs flush into the right screen edge.
- **Means:** Give the scroll container a horizontal gutter (KTD1). The vertical band is left as it is, by decision (KTD2).
- **Authority hierarchy:** This plan's R-IDs and KTDs win. `CLAUDE.md` wins on code style and test strategy.
- **Stop conditions:** None.
- **Execution profile:** Work happens on `main`, at the user's explicit direction. No branch, no PR.
- **Tail ownership:** The calling pipeline owns shipping.

## Product Contract

### Summary

A phone screenshot of page 300 shows two spacing faults.

**Right edge.** `.app` insets only by `env(safe-area-inset-left/right)`, which is `0` in portrait, and `.pages` sets `max-width` and `margin-inline: auto` but no padding. The 520px frame is therefore drawn edge to edge. SVT's own layout leaves the first column or two of a body row blank, so the left reads as if it were padded; the three-digit page links sit in columns 37-39 and touch the glass. The chrome around it *is* padded — `.freshness` at `6px 10px`, `.bar__inner` at `0 12px` — so the frame is the one element with no gutter, and the asymmetry is what the eye catches.

**Bottom.** Reported alongside the first, and diagnosed here for the record. `.content` is `flex: 1` and top-aligns its child. A 40x25 frame is width-constrained, so on a tall phone the frame plus the nine quick links fall well short of the available height, and every pixel of the slack collects in one band between the last link and the bottom bar. Nothing declares that band — it is unclaimed flex space — but it reads as deliberate, oversized bottom padding. KTD2 records why it is being left alone.

### Requirements

- **R1** — The reading column keeps a visible gutter on both sides at every viewport width, so no page content touches either screen edge.
- **R2** — A page taller than the viewport still scrolls to its full extent, with neither end clipped.
- **R3** — Frames on a wide screen are not made narrower than they are today.

### Out of scope

- The band of slack between the last quick link and the bottom bar. It was raised and looked at; see KTD2.
- The bottom bar's own height and its `env(safe-area-inset-bottom)` reservation. The band below the buttons in the screenshot is the device's gesture area, correctly reserved once.
- The 44px minimum row height on quick links. That is the touch-target floor and stays.

## Key Technical Decisions

- **KTD1 — The gutter goes on `.content`, not on `.pages`.** `.content` is the scroll container and wraps every state, so the loading, not-broadcast, and error messages get the same inset as a page. Putting it on `.pages` would leave those flush. Because `.pages` keeps its `max-width: var(--frame-max)` inside the padded box, a viewport wider than `560px + 2 * gutter` still draws the frame at the full 560px, satisfying R3. *Rejected:* padding on `.pages`, which is narrower in reach and would shave the cap on wide screens.
- **KTD2 — The vertical band stays. The page stays anchored to the top.** User-directed, after seeing the alternative. Distributing the slack with auto margins on `.pages` does remove half the band, but it buys that by opening an equal gap above the first frame, and a teletext page reads from its top-left corner: pushing it down to balance the whitespace costs more than the band does. The other candidate — pinning the quick links above the bar with `margin-top: auto` — only relocates the same gap between the frame and the links. Neither trade was worth taking, so the slack is left where it falls. *Rejected:* `margin: auto` on `.pages`; `margin-top: auto` on `.links`.
- **KTD3 — The gutter is `8px`.** Every pixel of gutter is taken off a width-constrained frame and shrinks the type with it, so the smallest inset that visibly separates content from the edge is the right one. It deliberately does not match `.bar__inner`'s `12px`: those 12px are padding to a 44px touch target whose glyph is centred well inside it, so the two would not line up anyway. *Rejected:* 12px, which buys no alignment and costs 8px of frame.

## Implementation Units

### U1 — Gutter and vertical distribution for the reading column

**Files:** `src/index.css`

`.content` gains `padding-inline: 8px`, with a comment on why the gutter sits on the scroll container and why it is as small as it is. `.pages` is untouched.

Satisfies R1, R2, R3.

### U2 — Not implemented: no automated cover for the change

**Files:** none

`index.css` is imported by `src/main.tsx` only, and the app tests render `App`
directly, so no stylesheet is ever attached in the test environment.
`getComputedStyle` there returns the initial value for every property this
change touches, and a test asserting on it would pass identically before and
after. happy-dom performs no layout either, so the geometry is equally out of
reach. Reproducing the stylesheet inside the test to assert against it would
verify the copy, not the app.

The change is therefore covered by the existing suite proving no regression,
and by looking at it. With KTD2 settled the way it was, a single `padding-inline`
carries no risk the suite could usefully guard anyway.

Satisfies nothing; recorded so the gap is visible rather than silent.

## Test Scenarios

- **T1** — The existing suite still passes: nothing in the visible-region, navigation, or decode tests regresses. (R2)
- **T2** — Manual, in a browser: page 331 stacks 14 sub-pages and overflows; it scrolls to the top of the first frame and the bottom of the last. (R2)

## Verification

- `npm test`
- `npm run build`
