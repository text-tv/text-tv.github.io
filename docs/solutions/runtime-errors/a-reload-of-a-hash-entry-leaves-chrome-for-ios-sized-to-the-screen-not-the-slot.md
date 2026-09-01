---
title: A reload of a hash entry leaves Chrome for iOS sized to the screen, not the slot
date: 2026-08-30
category: runtime-errors
module: src
problem_type: runtime_error
component: frontend
symptoms:
  - The shell is laid out from behind the address bar and ends a toolbar's height above the bottom of the visible area
  - Only after reloading a history entry reached by an in-app link; a typed URL reloaded is fine
  - Only Chrome for iOS; Safari and Brave on the same phone are unaffected
  - "Nothing the page can measure disagrees: safe-area insets, visualViewport offsets, scrollY and every rect are self-consistent and correct"
  - Rotating the phone, or locking and unlocking it, clears it instantly
  - Unfixed. Only the fragment reload is affected; a reload of a pushState entry at a real path is not
root_cause: browser_bug
resolution_type: unresolved
severity: high
tags: [chrome-ios, viewport, slot, svh, hash-routing, same-document-navigation, visualviewport, device-only-bug]
---

# A reload of a hash entry leaves Chrome for iOS sized to the screen, not the slot

## Problem

On Chrome for iOS, reloading a page the reader had reached by an in-app
navigation drew the app half behind the address bar: the top band sat under
Chrome's toolbar and the bottom bar ended a toolbar's height below the bottom
of the screen. Routing here is hash-based (`#100`), so every in-app page change
is a same-document navigation, which made this the ordinary case rather than an
exotic one — open the app, tap a page, pull to reload, and the shell is
displaced.

Chrome for iOS does not draw its toolbars *over* the web view the way Safari
does. It draws them beside it and sizes the view to the slot between them. That
sizing is bookkeeping Chrome re-seeds per navigation, and
`FullscreenWebStateObserver::DidFinishNavigation` calls `ResetForNavigation()`
only when the navigation changes document. Reloading a same-document history
entry skips the reset, so the view is left at the full height of the screen
while the toolbars are still drawn. The page is laid out into a box taller than
what is visible, and nothing in the page can see it.

## Symptoms

- Only Chrome for iOS. Safari and Brave on the same phone are unaffected — both
  are WKWebView, so this is not WebKit.
- Only after a reload of a history entry reached by an in-app tap. Typing the
  URL and reloading never reproduces it.
- Rotating the phone, or locking and unlocking it, clears the state instantly.
- A comparable page with no service worker and ordinary path URLs (txtv.nu)
  does not reproduce it.
- **A reload of a `pushState` entry at a real path is not displaced.** Both a
  hash link and a `pushState` make a same-document entry, so the trigger is not
  the entry being same-document — it is specifically the reload of a *fragment*
  entry. Path-routed apps are unaffected.
- Two faces. Either `innerHeight` grows to the full `screen.height` while a
  `100svh` probe still reports the slot, or every number reports the slot
  correctly and the page is displaced anyway. Only the first is measurable.
- Every number the page can read agrees with every other. On the reporter's
  phone (402x874 CSS px) safe-area insets were `0px`, `scrollY` 0,
  `scrollingElement.scrollTop` 0, and `visualViewport` reported 402x874 with
  `offsetTop` 0, `pageTop` 0, `scale` 1 — perfectly self-consistent, and wrong.

## What Didn't Work

Roughly ten fixes shipped before the cause was known. Every one of them aimed
at a number the page could read, and every one was plausible because a snapshot
of the already-broken page is internally consistent.

- **Correcting by `visualViewport.offsetTop`**, clamped so a negative offset
  could not push the shell further off. It reports zero here; there is nothing
  to correct by.
- **Re-reading the viewport once the load had settled** — in a `requestAnimationFrame`,
  behind a 400ms timer, on `pageshow`. The settled reading is the broken one.
- **Zeroing scroll**: `history.scrollRestoration = 'manual'` plus `scrollTo(0, 0)`
  and clearing every scroll container. The document was never scrolled.
- **`viewport-fit=cover`**, then restricting cover to an installed copy — which
  is what `index.html:22-25` still does, for its own reasons. In a tab the
  insets come back `0px`, so cover only means drawing under chrome the page
  cannot measure.
- **Restructuring the shell**: from `position: fixed` with a JS-written height
  into a flow box `100svh` tall with no document scroll range (`.app` at
  `src/index.css:138`). It made the shell simpler and did not touch this.
- **Giving the document a scroll range** — transiently, permanently, and from
  first paint — and then a real finger-driven scroll over that range. The
  toolbars never collapsed, because they were never in the way of the *view*.
- **Forcing a cross-document navigation from inside the page.** This was
  shipped as `src/viewportReset.ts`: detect the disagreement, then
  `location.replace` the same URL with a marker query parameter so Chrome had
  to fetch a document and run its reset, capped at two attempts in
  `sessionStorage`. It was reverted. It could only ever fire on the first of
  the two faces, the bug recurred through it, and when it did fire it threw
  away a load for no confirmed benefit.

One tell went unread for a long time: while broken, a `100svh` probe still
measured 676 — the slot — against an `innerHeight` of 874. Chrome had gone
full-screen-plus-insets rather than merely mis-sizing something. It turned out
to be a signature of only one of the two faces.

## Status

**Unresolved.** No workaround is in the app. What is established:

- The mechanism above, from Chrome's own source.
- The bug has two faces, and only one leaves a signature a page can read.
- Only a *fragment* reload triggers it. A `pushState` entry at a real path
  reloads clean, which is what the mechanism predicts: that reload fetches a
  document, so the reset runs.
- The only cures are a cross-document navigation, a rotation, or a lock and
  unlock. Of the three only the first is available to a page, and driving it
  from inside the page was tried and reverted (see above).
- `chrome://flags/#fullscreen-viewport-adjustment-experiment` changes nothing
  in any of its three states.

A standalone repro, independent of this app, is at
<https://github.com/plilja/chrome-ios-bug> (served from
<https://plilja.se/chrome-ios-bug/>). It is the artefact to attach to an
upstream report, and it is where the `pushState` result was established.

**The real fix available here is to stop using fragment URLs.** Routing is
hash-based by convention (`CLAUDE.md`), chosen because GitHub Pages resolves no
paths. Moving to path routing costs a post-build copy of `index.html` to
`dist/404.html`, a `base` of `/` instead of `./`, and the `navigateFallback`
already configured in `vite.config.ts`. Not done, and a deliberate open choice
rather than an oversight.

## Prevention

**When every measurement agrees and the picture is still wrong, the wrongness
is outside the page.** Exact self-consistency is the tell, not reassurance — a
real layout bug leaves at least one number disagreeing with another.

**Sample the numbers over time, not once they have settled.** Ten fixes were
aimed at settled snapshots that all said the same correct thing. The
breakthrough came from writing a line at +0/100/300/1000/3000ms
(`SAMPLES`, `src/components/Diagnostics.tsx:82`) and on every event that could
move the page — scroll, resize, pageshow, visibilitychange, touchend,
orientationchange (line 99). That log showed a `resize` at roughly 40ms with no
user interaction, `innerHeight` going 676 → 874 and staying, where a good load
sat at 676 for the whole session and fired no resize at all.

**Compare numbers that are not the browser's own report of itself.**
`innerHeight` against `screen.height` against a measured `100svh` probe: any one
alone is unfalsifiable, and it is the disagreement that carries the
information.

**A device-only bug needs a readout on the device.** `?diag`
(`src/components/Diagnostics.tsx:22`) and the in-memory log (`src/log.ts`, 300
lines from boot) are kept in the app for this, with the log copyable to the
clipboard (`KOPIERA`, line 135) — that is how a phone session becomes a report
someone else can read.

**When the cause is a browser bug, read the browser's source.** That is what
turned "rotation fixes it" from a curiosity into a fix.

**One clean pass is not proof.** The renavigating workaround was declared
working on a single good reload and shipped; the bug came back. A fix for an
intermittent, device-only bug needs repeated passes across fresh loads before
it is believed.

**A workaround aimed at half a bug is worse than none.** `viewportReset.ts` was
careful — capped at two attempts, self-clearing, storage failures degrading to
one attempt rather than a blank page — and still had to go, because it could
not detect the face of the bug that has no signature, while costing a discarded
load whenever it did fire.

## Related Issues

- `docs/solutions/runtime-errors/canvas-getimagedata-is-colour-managed.md` — the repo's other bug whose cause was the environment rather than the code, and which also appeared only on real hardware. Its rule that a silent fallback must announce itself is what the on-device readout here is the next iteration of.
- `docs/solutions/best-practices/the-suite-never-loads-the-stylesheet-so-a-green-run-is-silent-about-layout.md` — a green suite says nothing about layout, and prescribes a real browser instead. This bug extends that ladder a rung: a headless Chromium pass would have been just as silent, because the defect is in Chrome for iOS's own view sizing. A browser pass covers stylesheet and layout defects, not shell geometry.
- A stale bundle can masquerade as this bug on a phone. The service worker precaches the shell and swaps itself on the next foreground (`src/serviceWorker.ts`), so a device can be running code from before a fix while appearing to test it — which is why the readout names the commit it was built from. Background the app, reopen, and repeat once before trusting a negative result. (session history)
