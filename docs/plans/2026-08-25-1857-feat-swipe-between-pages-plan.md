---
title: Swipe Between Pages - Plan
type: feat
date: 2026-08-25
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Swipe Between Pages - Plan

## Goal Capsule

- **Objective:** A reader on a phone can move to the previous or next teletext page by dragging sideways across the page, without the OS back gesture, vertical scrolling, the section rail, or the frame's own links being disturbed.
- **Means:** A pure decision function plus a pointer-event hook on `.content`, driving the `prev`/`next`/`navigate` values `App` already holds (KTD1, KTD2, KTD5).
- **Authority hierarchy:** `CLAUDE.md` wins on code style, API boundaries and test strategy. This plan's KTDs win on gesture mechanics. The requirements below win on behaviour.
- **Stop conditions:** Stop and report if the gesture cannot be made to leave vertical scrolling of a 14-sub-page page (fixture 331) untouched.
- **Execution profile:** Work happens on `main`, at the user's explicit direction. No branch, no PR. Commit as you go.
- **Tail ownership:** The calling pipeline owns shipping.

---

## Product Contract

### Summary

Add a sideways swipe as a second way to reach the neighbouring page. The bottom bar's `◀` and `▶` already do this; the swipe is an additional trigger on the same two values, so it inherits neighbour-skipping, history and disabled-state behaviour for free.

The gesture is recognised passively. The app listens to pointer events on `.content` and never calls `preventDefault`, so the browser keeps full ownership of scrolling, pinch-zoom, text selection and the OS edge gestures. A drag only navigates when it is clearly horizontal, long enough, made with a finger, and did not start in the screen-edge strip where the system back gesture lives.

The original PRD (`docs/plans/2026-08-22-text-tv-pwa.md`, Scope Boundaries) listed swipe gestures as explicitly not built. This plan supersedes that boundary at the user's direction; no reason was recorded there that this plan contradicts.

### Problem Frame

The prev/next arrows sit in the bottom bar, which is a deliberate thumb-reach compromise: reaching them means moving the thumb off the page being read. Paging through a section — 330, 331, 332 — is the most repeated action in teletext, and on a phone the natural motion for "next" is a sideways flick over the content itself. Nothing in the app answers that motion today.

### Requirements

**The gesture**

- R1. A predominantly horizontal drag across the page area navigates: right-to-left goes to the next page, left-to-right goes to the previous page.
- R2. The swipe uses the payload's own `prev`/`next` neighbours, so numbers that are not broadcast are skipped exactly as the bar arrows skip them.
- R3. When the neighbour in the swiped direction is absent, the swipe does nothing.
- R4. A swipe navigates by the same route as the arrows, so it pushes a history entry and the browser back gesture returns to the page previously viewed.
- R5. Only finger input triggers the gesture. Mouse and trackpad input never does.
- R6. A gesture with more than one active pointer, or one the browser cancels, never navigates.

**What the gesture must not disturb**

- R7. A swipe whose first contact lands within the edge gutter — 44px of the left or right edge of the visual viewport — is ignored, so the OS back/forward edge gesture is the only thing that responds there.
- R8. Vertical scrolling of a page with many sub-pages is unchanged. A predominantly vertical drag never navigates, and the app never calls `preventDefault` on pointer or touch input.
- R9. The section rail keeps its horizontal scrolling. A sideways drag on the rail scrolls the rail and never navigates.
- R10. A swipe that navigates does not also activate a link in the frame under the finger.
- R11. Selecting text in a frame is unaffected.

**Accessibility**

- R12. The bottom-bar arrows stay the single-pointer, non-dragging route to the same navigation (WCAG 2.5.1, 2.5.7). The swipe reaches nothing the arrows do not.

### Out of scope

- Any visual affordance, page-following animation, or rubber-band feedback during the drag (KTD8).
- Vertical swipe gestures.
- Sub-page cycling. `PageView` stacks sub-pages in one scroll and never cycles them; that is unchanged.
- Announcing the arrived-at page to a screen reader. Hash routing announces nothing today for the arrows either; this is a pre-existing gap, recorded as a residual rather than fixed here.

---

## Key Technical Decisions

**KTD1 — Pointer events, finger only, passive.**
*Decision:* Recognise the gesture from `pointerdown` / `pointermove` / `pointerup` / `pointercancel` on `.content`, with listeners registered `{ passive: true }`, ignoring any pointer whose `pointerType` is not `touch`, aborting a live gesture whenever a second pointer goes down, and starting a new gesture only from an `isPrimary` `pointerdown`. The order of those three tests is load-bearing — see U2 step 4.
*Rejected:* touch events; tracking mouse drags as well.
*Reason:* `pointercancel` is the only signal the browser gives when it takes the gesture over — a scroll takeover, a pinch, the OS edge gesture, the notification shade — and treating it as an authoritative abort is what keeps R6 and R8 true. Mouse drags are excluded because `.text-frame__run` is deliberately selectable (R11) and a drag-to-navigate would fight selection; desktop is served by the arrows.

**KTD2 — The handler lives on `.content`, not on `.app` or the document.**
*Decision:* Attach in a hook called from `App`, targeting the `<main className="content">` element by ref.
*Rejected:* attaching to `.app` or `document`.
*Reason:* `.rail` and `.bar` are siblings of `.content`, not children, so scoping to `.content` satisfies R9 by structure rather than by a target test that would have to be kept in step with the markup. `.content` is also the only scroll container in the app, so it is the element whose gestures are in question.

**KTD3 — Horizontal, not vertical.**
*Decision:* The gesture axis is horizontal. (session-settled: user-directed — chosen over an up/down swipe: `PageView` stacks sub-pages in one vertical scroll, so a vertical swipe is always contested by real scrolling, while the horizontal axis is unclaimed inside `.content`.)

**KTD4 — Edge gutter of 44px, and no attempt to suppress the OS gesture.**
*Decision:* Ignore a gesture whose `pointerdown` `clientX` is within 44px of either side of the visual viewport. Do nothing else about the system back gesture. (session-settled: user-approved — chosen over trying to suppress or `preventDefault` the OS back gesture: both platforms arm their edge gesture from the screen edge and neither can be cancelled from JavaScript in an installed PWA, so refusing edge-started swipes is the only way the two never compete.)
*Conflict call-out:* the settled decision named "~28px". Research raised it to 44px: iOS arms roughly the outer 20–30pt, but Android's default back inset is 24dp and is **user-adjustable up to 40dp**, with the CDD capping OEM triggers at 40dp. 28px sits inside the armed region for anyone who raised back sensitivity. 44px clears both and is also the minimum comfortable touch target already used in `src/components/HotspotLayer.tsx`. The decision itself — exclude an edge gutter — is unchanged; only its width moved.
*Note:* pass `window.innerWidth` as the viewport width, **not** `window.visualViewport?.width`. `clientX` is reported in layout-viewport CSS pixels while `visualViewport.width` shrinks with the pinch-zoom scale, so mixing them makes the right-hand gutter swallow most of the screen while the reader is zoomed in. `innerWidth` keeps both operands in one coordinate space; the gutter is conservative enough to absorb the residual error at zoom.

**KTD5 — The gesture drives the existing `prev`/`next` and `navigate`.**
*Decision:* Swipe left calls `navigate(next)`, swipe right calls `navigate(prev)`, using the same `neighbours?.prev` / `neighbours?.next` values `App` already passes to `BottomBar`, and doing nothing when the value is `undefined`. (session-settled: user-approved — chosen over a separate navigation path or carousel-style cycling: those two values plus `navigate` are already in `App`'s scope, and reusing them makes R2, R3 and R4 true by construction rather than by re-implementation.)

**KTD6 — The decision is a pure function in its own module.**
*Decision:* `src/swipe.ts` exports a pure function that takes the gesture's start point, end point and the viewport width and returns `'prev' | 'next' | undefined`. `src/useSwipeNavigation.ts` owns only the listeners and refs.
*Rejected:* thresholds inline in the hook.
*Reason:* `CLAUDE.md` forbids unit-testing components but allows unit tests for pure modules with no DOM of their own, and `src/imageMap.ts` + `src/imageMap.test.ts` is the established shape for exactly this — geometry decided in a tested pure module, wiring left thin.

**KTD7 — Thresholds: 60px of travel, 1.5× axis dominance, no time bound.**
*Decision:* Commit when `|dx| >= 60` and `|dx| >= 1.5 * |dy|`. No velocity term and no maximum duration.
*Rejected:* a velocity-or-distance rule (`@use-gesture` uses 50px or 0.5px/ms over 250ms); a percentage-of-viewport distance.
*Reason:* absolute pixels are what the real libraries use, because finger travel does not scale with screen size. Dropping velocity removes the only time dependency from the pure function, which matters because happy-dom reports ~0ms between synchronously dispatched events and a zero divisor would have to be special-cased. With mouse input excluded and `pointercancel` aborting, a slow deliberate horizontal drag is still intent, so a duration cap would only reject gestures the reader meant.

**KTD8 — No `touch-action` declaration, and no visual affordance.**
*Decision:* Leave `.content` at `touch-action: auto`. Add no CSS at all. Add no drag-following animation, edge glow or arrow hint.
*Rejected:* `touch-action: pan-y pinch-zoom` on `.content`.
*Reason:* `pan-y` without `pan-x` makes Chrome register a system-gesture-exclusion rect for the element, which suppresses the Android back gesture over the content area — the direct opposite of KTD4's settled intent that the OS gesture always wins. `.content` has no horizontal overflow, so `auto` costs nothing: the browser will not pan it sideways, and since the app never calls `preventDefault`, vertical scrolling stays entirely the browser's. The absent affordance follows the rail's precedent (`docs/plans/2026-08-24-1600-feat-reading-height-and-section-rail-plan.md`, KTD4) of not adding motion the design did not ask for.

**KTD9 — A committed swipe swallows the next click, at the document capture phase.**
*Decision:* When a gesture commits, register a one-shot capture-phase `click` listener on `document` that calls `stopPropagation()` and `preventDefault()`, cleared on the next click or after 400ms, whichever comes first. 400ms clears the ~300ms synthetic-click delay a browser can still apply after touchend, and stays below a deliberate follow-up tap.
*Rejected:* relying on the browser's own post-drag click suppression; drilling a "consumed" ref down through `PageView` and `SubPageFrame` into `HotspotLayer`.
*Reason:* `HotspotLayer` resolves a click by *nearest printed rect centre*, not by hit target, so any stray click on the frame navigates somewhere — a wrong page on top of the right one. Browsers do normally suppress the synthetic click after a moved touch, but the consequence of the exception is a visibly wrong navigation, and the guard is a few lines. `document` capture is required rather than a listener on `.content`: React 19 attaches `onClickCapture` at the root container, which is an ancestor of `.content`, so a capture listener on `.content` would run *after* `HotspotLayer`'s.

---

## High-Level Technical Design

Three layers, in dependency order. Nothing above `App` changes, and no CSS changes at all.

**`src/swipe.ts` — the decision.** A pure function over numbers: start `x`/`y`, end `x`/`y`, viewport width. It applies the gutter test (KTD4) and then the distance and axis-dominance tests (KTD7), and returns `'prev'`, `'next'`, or `undefined`. It knows nothing about pages, events or the DOM, which is what makes it unit-testable and what keeps the numbers in one readable place.

**`src/useSwipeNavigation.ts` — the wiring.** Takes a ref to the scroll container plus `prev`, `next` and `navigate`. Holds the in-flight gesture in a `useRef` — pointer id, start point, and a flag for "aborted" — because none of it should re-render. Registers four passive listeners in a `useEffect` and removes all four in its cleanup, following the shape of `src/useVisualViewport.ts`. On `pointerdown` it rejects non-touch, non-primary, and second-pointer cases; on `pointerup` it asks `src/swipe.ts` for a direction and, if there is one and the corresponding neighbour exists, arms the click-swallow (KTD9) and calls `navigate`. `pointercancel` clears the gesture and returns.

```
pointerdown ──┬─ pointerType !== 'touch' ──────────────► ignore
              ├─ a gesture is already live ─────────────► abort it, return
              │                                           (runs before the isPrimary
              │                                            test: a second finger is
              │                                            always isPrimary: false)
              ├─ !isPrimary ────────────────────────────► ignore
              ├─ clientX within 44px of either edge ────► ignore (OS owns it)
              └─ else ─► record { pointerId, x, y }

pointercancel / pointerup with a foreign pointerId ────► clear, do nothing

pointerup ──► decideSwipe(start, end, viewportWidth)
              ├─ undefined ─────────────────────────────► clear, do nothing
              ├─ 'next' and next === undefined ─────────► clear, do nothing
              └─ direction ─► swallow next click ─► navigate(neighbour)
```

**`src/App.tsx` — the seam.** Adds a ref on the existing `<main className="content">` and one hook call. `neighbours` is already computed there for `BottomBar`; the hook takes the same two values.

---

## Implementation Units

### U1. The pure swipe decision

**Goal:** A tested pure function that turns two points and a viewport width into a direction or nothing.
**Requirements:** R1, R7, R8 (the axis half), R12 indirectly.
**Dependencies:** none.
**Files:** `src/swipe.ts` (new), `src/swipe.test.ts` (new).
**Approach:**
1. Export the two thresholds and the gutter width as named constants with the reasoning from KTD4 and KTD7 in a block comment above them, so the numbers are not bare literals.
2. Export one function taking the start point, the end point and the viewport width, returning `'prev' | 'next' | undefined`.
3. Apply the gutter test against the start `x` first, then distance, then axis dominance. Return `'next'` for a right-to-left drag and `'prev'` for left-to-right.
**Patterns to follow:** `src/imageMap.ts` — pure geometry, exported constants, prose block comments explaining *why* and naming the rejected alternative; `resolveHotspot`'s signature shape (values in, decision out).
**Test scenarios:**
- A 100px right-to-left drag from mid-screen returns `'next'`.
- A 100px left-to-right drag from mid-screen returns `'prev'`.
- A 59px drag returns `undefined`; a 60px drag returns a direction (the boundary is pinned in both directions).
- A 100px horizontal drag with 80px of vertical travel returns `undefined` — dominance, not distance, is what rejects it.
- A 100px horizontal drag with 40px of vertical travel returns a direction.
- A drag starting at `x = 20` returns `undefined`; the same drag starting at `x = 44` returns a direction.
- A drag starting 20px from the right edge returns `undefined`, computed against the passed viewport width rather than a global.
- A zero-length gesture returns `undefined`.
**Verification:** `npm test` green; the boundary cases above fail if either constant is changed.

### U2. The gesture hook

**Goal:** Pointer listeners on the scroll container that call `navigate` for a committed swipe and stay out of the way otherwise.
**Requirements:** R1–R6, R8, R10 (via U4's suppression), R11.
**Dependencies:** U1.
**Files:** `src/useSwipeNavigation.ts` (new).
**Approach:**
1. Signature takes the container ref, `prev`, `next` and `navigate`; returns `void`, like `useVisualViewport`.
2. Keep the in-flight gesture in a single `useRef` object; keep the latest `prev`/`next`/`navigate` in a ref too, so the effect can register its listeners once rather than re-attaching on every page change.
3. Register `pointerdown`, `pointermove`, `pointerup` and `pointercancel` with `{ passive: true }` in one `useEffect`, and remove all four in the cleanup.
4. `pointerdown`, in this order, and the order is the whole point: return early if `pointerType !== 'touch'`; then, if a gesture is already live, clear it and return, **regardless of `isPrimary`** — this is the multi-touch reject (R6), and it has to run first because a second finger's `pointerdown` always carries `isPrimary: false`, so testing `isPrimary` ahead of it would return early and leave the first finger's gesture armed to commit on its own `pointerup`; then return early if `!isPrimary`; otherwise record the pointer id and start point.
5. `pointerup`: ignore a foreign `pointerId`; ask `src/swipe.ts`; look up the neighbour for the returned direction and return if it is `undefined`; otherwise navigate. Clear the gesture on every path.
6. `pointercancel`: clear and return, with a comment naming what it stands for — the browser or OS taking the gesture, which is the app's only notice of it.
7. `pointermove` is needed only to carry the last point, because some browsers report a `pointerup` whose coordinates are stale; keep it minimal.
**Patterns to follow:** `src/useVisualViewport.ts` for the feature-detect-attach-cleanup shape and the explicit `: void`; `src/useTextTv.ts` for `useRef` holding state that must not re-render and for prose comments naming the rejected alternative.
**Test scenarios:** proven at app level in U5, not here — `CLAUDE.md` forbids unit tests for hooks. The scenarios that cover this unit are U5's `// R1` pair, `// R2`, `// R3`, `// R4`, `// R5`, both `// R6` cases, `// R7`, `// R8` and `// R9`.
**Verification:** `npm run build` typechecks clean, and every U5 scenario listed above passes.

### U3. Wire the hook into the shell

**Goal:** The gesture is live on the real page area.
**Requirements:** R9 (by attaching below the rail), R1–R5.
**Dependencies:** U2.
**Files:** `src/App.tsx`.
**Approach:**
1. Add a ref to the existing `<main className="content">`.
2. Call the hook with that ref and the already-computed `neighbours?.prev`, `neighbours?.next` and `navigate`.
3. Change nothing else — no new element, no wrapper, no CSS class.
**Patterns to follow:** the existing `useVisualViewport()` call in `App` — a hook called for its effect, no return value used.
**Test scenarios:** proven at app level in U5 — the `// R9` rail scenario is the one that specifically pins this unit's choice of attach point, since it fails if the ref moves up to `.app`.
**Verification:** `npm run build` clean; the app still renders every result kind; the existing suite is unchanged.

### U4. Swallow the click a committed swipe would otherwise produce

**Goal:** A swipe that lands on a link in the frame navigates once, to the neighbour, not twice.
**Requirements:** R10.
**Dependencies:** U2.
**Files:** `src/useSwipeNavigation.ts`.
**Approach:**
1. On commit, before calling `navigate`, add a `click` listener on `document` with `capture: true` that calls `stopPropagation()` and `preventDefault()` and removes itself.
2. Remove it after 400ms as well, so a swipe the browser *did* suppress does not leave a listener armed to eat the reader's next real tap. Export that window as a named constant beside the thresholds in `src/swipe.ts`, so every tunable number in the feature sits in one file.
3. Remove it in the effect cleanup too.
**Approach note:** the listener must be on `document`, not on the container — see KTD9 for why `.content` is too low.
**Patterns to follow:** `src/components/HotspotLayer.tsx`'s `flashTimer` ref plus its unmount `clearTimeout` cleanup.
**Test scenarios:** proven at app level in U5 by the `// R10` scenario — a swipe on 100 ending over the printed `106` link, followed by an explicitly dispatched click at the same point, must land on `101`, not `106`.
**Verification:** that scenario passes with the listener on `document` and fails with it on the container. Its failure mode depends entirely on the dispatched click (U5 step 6); without it the scenario proves nothing.

### U5. App-level tests

**Goal:** The gesture's behaviour is pinned through the real app with the real fixtures.
**Requirements:** all.
**Dependencies:** U3, U4.
**Files:** `src/app.test.tsx`.
**Approach:**
1. Add one Swedish `describe('svep mellan sidor', …)` block, placed after `describe('knapparna längst ned')` since it covers the same navigation.
2. Add a `swipeFrom(element, fromX, fromY, toX, toY)` helper that dispatches `pointerdown`, `pointermove` and `pointerup` with explicit `clientX`/`clientY`, `pointerType: 'touch'`, `isPrimary: true` and a shared `pointerId`, following the raw-`dispatchEvent` idiom `tapAt` established in `describe('överlappande länkar')` rather than `userEvent.pointer`. Separate start and end points on both axes — a single shared `y` cannot express the vertical-drag scenario.
3. Hoist `giveTheFrameALayout` and `tapAt` out of `describe('överlappande länkar')` to module scope, alongside `openOn`, `currentPage` and `drawnFrames`. Both are needed by the R10 scenario and neither is reachable from a new `describe` where they are. This is a move, not an edit: no assertion changes, and the tests that use them today are untouched.
4. Reach the container with `screen.getByRole('main')`.
5. happy-dom's viewport is 1024×768, so a gesture starting at `x = 500` is well clear of the 44px gutter; use `Object.defineProperty(window, 'innerWidth', …)` with an `afterEach` restore only for the gutter tests, mirroring the `visualViewport` stub in `describe('det synliga området')`.
6. Nothing synthesises a `click` from a pointer sequence — not happy-dom, and not a real browser from *synthetic* pointer events. Any scenario about the click-swallow must dispatch the `click` itself, with `tapAt`, immediately after the `pointerup`.
**Patterns to follow:** `openOn`, `currentPage`, `drawnFrames`, `giveTheFrameALayout` and `tapAt` are all already in the file; requirement IDs go in `// R7`-style comments above the tests they cover.
**Test scenarios:**
- Swiping right-to-left on 104 lands on 105 (`// R1`). 104's captured `nextPage` is `105`, which has its own fixture.
- Swiping left-to-right on 104 lands on 102 (`// R1, R2`) — 102 has no fixture, so the mock answers not-broadcast, and the assertion is on the page number in the bar, which proves the navigation happened.
- Swiping right-to-left on 200, which is not broadcast, lands on 250 (`// R2`) — the same neighbour-skipping the arrow test already covers, now through the gesture.
- Swiping left-to-right on 100 leaves the reader on 100 (`// R3`) — 100 has no previous page, matching the disabled `◀`.
- After swiping on 104, the browser back button returns to 104 (`// R4`), asserted the way `describe('genvägarna ovanför knappraden')` asserts it.
- A drag with `pointerType: 'mouse'` does not navigate (`// R5`).
- A gesture interrupted by `pointercancel` before `pointerup` does not navigate (`// R6`).
- A second `pointerdown` mid-gesture cancels it: the following `pointerup` does not navigate (`// R6`). Dispatch that second down with a different `pointerId` and `isPrimary: false`, which is the shape a real second finger has — with `isPrimary: true` the scenario passes against the wrong guard order U2 step 4 exists to prevent.
- With `innerWidth` stubbed, a swipe starting at `x = 20` does not navigate (`// R7`).
- A predominantly vertical drag on 331 does not navigate (`// R8`).
- A sideways drag dispatched on the rail (`getByLabelText('Genvägar')`) does not navigate (`// R9`) — the structural guarantee of KTD2, asserted so a later move of the handler up to `.app` fails here.
- Covers R10: on 100 with the frame given a layout, a swipe ending over the printed `106` link, **followed by an explicit `tapAt` click at the same end coordinates**, lands on `101` — 100's next page — and not on 106. Without that dispatched click the scenario passes whether U4 exists or not, so the click is what makes it a test.
**Verification:** `npm test` green, including the whole existing suite unchanged; no existing test is edited.

---

## System-Wide Impact

One thing in this plan reaches outside the feature: KTD9's click-swallow listener is registered on `document` at the capture phase, which is above every handler in the app. While armed it can consume any click anywhere in the shell — the bar arrows, the number input, the rail, a hotspot. That is the point (the whole shell is what a stray post-swipe click could land on) and it is why the arming window has three independent ends: the next click, a short timeout, and the effect cleanup. Any change to that listener's lifetime is a change to the whole app's click path, not to the gesture.

Everything else is contained:

- The pointer listeners live on `.content` for the lifetime of `App`, are passive, and never call `preventDefault`, so no other element's behaviour changes.
- No CSS is touched, so no layout, scroll or `touch-action` posture changes anywhere.
- Navigation goes through `navigate` from `src/useTextTv.ts`, so caching, freshness, history and the not-broadcast path are reached by the route they already use. The gesture adds no new state.
- `PageView`, `SubPageFrame`, `TextFrame`, `HotspotLayer`, `QuickLinks` and `BottomBar` are unmodified.

---

## Verification Contract

- `npm test` — the full Vitest suite once, including the new `src/swipe.test.ts` and the new `describe` block in `src/app.test.tsx`. No existing test may need editing; this feature only adds.
- `npm run build` — typecheck plus production build, clean.
- `npm run dev` against the mock, then a real-device check on a phone. This is the part the automated suite cannot reach: happy-dom performs no layout and resolves no real geometry, so it can prove the arithmetic against coordinates the test supplies and nothing more. The device check must cover: paging forward and back through 330→331→332; scrolling 331's fourteen sub-pages without an accidental navigation; the OS back gesture still working from both screen edges; the rail still scrolling sideways; pinch-zoom still working, **and the swipe still working while zoomed in**; and selecting text in a frame.

Two things the check must measure rather than merely confirm:

- **The real axis tolerance.** With `touch-action: auto`, the browser starts scrolling `.content` as soon as a drag passes touch slop vertically, and a started scroll fires `pointercancel` — which KTD1 treats as an authoritative abort. So on a long page the effective dominance bound may be far stricter than KTD7's 1.5×. On 331, try a diagonal of roughly 100px horizontal and 40px vertical — a case U1 asserts should navigate — and record what actually happens.
- **Android at 40dp.** Confirm the 44px gutter still clears the back gesture on a high-density screen with back sensitivity raised, where CSS pixels and dp diverge.

## Definition of Done

**Global**

- Every requirement R1–R12 is either asserted in the suite or listed below as device-verified.
- `npm test` and `npm run build` are both green.
- No CSS changed, no dependency added, no existing assertion edited. The one permitted touch to existing test content is U5 step 3's hoist of `giveTheFrameALayout` and `tapAt` to module scope.
- Nothing from an abandoned approach is left in the diff.

**Device-verified rather than asserted** — R7 (the real gutter width against a real screen edge), R8 (real scrolling, as opposed to the axis arithmetic U1 pins), R9 (real rail scrolling), R11 (selection). happy-dom can prove the decision function and the wiring; it cannot prove that the browser still owns the gestures the app declined to take. The precedent for splitting verification this way is `docs/solutions/runtime-errors/canvas-getimagedata-is-colour-managed.md`, where a green suite and scripted checks both missed what one minute with the real app found.

**Per unit** — U1: the boundary tests pin both thresholds and the gutter. U2/U3: the app-level tests in U5 pass. U4: the hotspot test in U5 passes with the listener on `document` and fails with it on the container. U5: the block is in Swedish, uses the file's existing helpers, and carries `// R<N>` comments.

---

## Risks

- **The click-swallow eats a real tap.** If the browser already suppressed the post-swipe click, the armed listener would consume the reader's next tap instead. Mitigated by the timeout in U4; the device check should include tapping a link immediately after a swipe.
- **`pointerup` without coordinates.** Some browsers report a `pointerup` whose coordinates are stale. Mitigated by tracking the last point in `pointermove` (U2 step 7) rather than trusting `pointerup` alone.
- **60px on a small phone.** A 60px commit distance is about 16% of a 375px-wide viewport. If it reads as too stiff or too loose on the device check, the constant is one edit in `src/swipe.ts` and its boundary test.
- **Left-to-right conflicts with the reading direction of a back gesture.** Swipe right means "previous page", which is also what the OS back gesture means at the edge — but they land on different pages: previous *page number* versus previously *viewed* page. This is intended and matches the bar arrows, but it is the most likely thing for a reader to find surprising. Worth a look during the device check.

## Residuals

1. No screen-reader announcement of the arrived-at page. Pre-existing for the arrows too; out of scope here.
2. No visual affordance for the gesture (KTD8). A reader has no way to discover it except by trying.
3. The edge gutter is a fixed 44px rather than read from the platform. No API exposes the user's Android back-sensitivity setting, so 44px is the conservative constant.
