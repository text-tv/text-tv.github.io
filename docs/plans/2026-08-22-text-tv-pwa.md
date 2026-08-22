---
title: Text-TV PWA - Plan
type: feat
date: 2026-08-22
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: legacy-requirements
execution: code
origin: PRD.md
---

# Text-TV PWA - Plan

## Goal Capsule

**Objective:** A Swedish teletext reader is installed on a phone and an iPad home
screen, renders SVT Text's own frames, and lets the reader reach any page by
tapping the page numbers printed inside the frame.

**Means:** A React + TypeScript + Vite PWA that fetches the public SVT Text API
directly from the browser and overlays parsed `imageMap` rects on the frame GIF
as finger-sized tap targets (KTD1, KTD5).

**Authority hierarchy:** `PRD.md` > this plan > implementer judgment. The PRD's
"Implementation Decisions", "Testing Decisions" and "Out of Scope" sections are
settled; do not re-litigate them.

**Stop conditions:**
- Stop and report if the SVT API stops sending `access-control-allow-origin: *`
  (the no-proxy decision, KTD2, becomes infeasible).
- Stop and report if any requirement below conflicts with another.
- Do not add anything from the PRD's "Out of Scope" list.

**Execution profile:** Autonomous. Commit directly to `main`; no branch, no PR
(KTD11). The repo has no git remote, so shipping is local commits only.

**Tail ownership:** The caller (`lfg`) owns review, commit and close-out.

## Product Contract

### Summary

Build "Text-TV", an installable progressive web app that wraps the public SVT
Text API. It renders the exact teletext frames SVT publishes, adds working
touch link targets over the page references printed in those frames, and puts
prev/next/home/page-entry controls in a fixed bottom bar. It is a reader with
no configuration: no accounts, no settings, no favourites. Page 100 is the home
screen.

### Problem Frame

The user reads SVT Text daily on a phone and tablet. The third-party app they
used started serving phishing interstitials and is unsafe. SVT's own web page is
the obvious replacement but is not app-shaped: it needs a browser, and its page
links stop working in the mobile layout, so the only way to navigate is typing
three-digit numbers. Tapping page references is how teletext is meant to be
read, so that loss is the decisive one.

### Key Decisions

- **Page 100 is the home screen; there is no tile grid, favourites list or
  settings screen.** Page 100 is already a hand-maintained index with working
  links. Governs R16, R41.
- **The app is a reader, not a live feed.** No polling, no notifications, no
  page-change diffing. Governs R25, R28.
- **Ship directly on `main` with local commits only**
  (session-settled: user-directed — chosen over a feature branch and PR: the
  user asked for it and the repo has no remote). Governs R44.
- **Dev and test run against a local `json-server` mock seeded from captured
  live responses**
  (session-settled: user-directed — chosen over hitting the live SVT API during
  development: the sandbox is throttled against it). The shipped default base
  URL stays the real SVT endpoint. Governs R45, R46.

### Requirements

#### Installation and shell

- R1. The app installs to a phone and iPad home screen with its own name,
  icon and splash, via a web app manifest.
- R2. Launched from the home screen it displays standalone, with no browser
  chrome.
- R3. The app shows no cookie banner, ad or interstitial of any kind.
- R4. A 180x180 `apple-touch-icon` is declared in the document head.
- R5. The icon is teletext-styled: page digits in teletext colours on black,
  and does not use SVT's marks.
- R6. Every surface is black — document background, manifest
  `background_color` and `theme_color`, and
  `apple-mobile-web-app-status-bar-style: black-translucent` — so there is no
  white flash on launch and no seam around the frame.
- R7. The app never follows the system light/dark theme.
- R8. `env(safe-area-inset-*)` is respected so no control is cut off by the
  home indicator or rounded corners.
- R9. All user-visible strings are Swedish, inline in the source. No i18n
  framework.
- R10. A short attribution line, "Innehåll från SVT Text", appears in the
  chrome, making clear the app is not SVT's own.

#### Frame rendering

- R11. A page's frame is rendered from `gifAsBase64` as a
  `data:image/gif;base64,…` URL at its native 520x400 geometry.
- R12. The frame is rendered with `image-rendering: pixelated`.
- R13. The frame is fitted to the viewport width, so the whole frame is visible
  without scrolling in phone portrait and scales up on a tablet in landscape.
- R14. A page's sub-pages are rendered stacked vertically in one scroll
  container.
- R15. Sub-pages are never auto-cycled.

#### Link hotspots

- R16. Every `<AREA>` entry in a sub-page's `imageMap` becomes a tap target
  that navigates to its `HREF` page number.
- R17. Hotspots are positioned as percentages of the frame's native pixel size,
  so they track the frame at any viewport size.
- R18. Each hotspot's touch target is expanded vertically to at least 44 CSS px,
  centred on the original rect.
- R19. When expanded targets overlap, a touch resolves to the rect whose centre
  is nearest the touch point, not to paint order.
- R20. Every link is marked persistently with a 1px underline in the frame's
  own foreground colour — not a box — so it is visible which numbers are
  tappable.
- R21. Tapping a link produces an immediate visual highlight, before the next
  page appears.

#### Navigation

- R22. The current page number is in the URL hash (`#100`), so a page is
  shareable and directly openable.
- R23. Every navigation pushes a history entry, so the system back gesture
  returns to the previously viewed page.
- R24. A fixed bottom bar holds, at minimum: a page-number input, a previous
  arrow, a next arrow, and a home button.
- R25. The previous and next arrows follow the payload's `prevPage` /
  `nextPage`, so page numbers that are not broadcast are skipped.
- R26. The previous or next arrow is disabled when the payload has no
  neighbour in that direction.
- R27. The home button navigates to page 100.
- R28. The page-number input uses `inputmode="numeric"` and `maxlength=3`, so
  the device shows a numeric keypad.
- R29. Entering the third digit navigates immediately and blurs the input, with
  no confirm button.
- R30. The current page number is visible at all times.
- R31. The bottom bar is opaque, and the scroll container carries bottom
  padding equal to the bar's height, so the last sub-page is never permanently
  hidden behind it.

#### Freshness and caching

- R32. A page that has been seen before paints immediately from cache while a
  fresh copy is fetched, and the fresh copy replaces it when it lands.
- R33. The rendered content always carries a visible indication of when it was
  last updated, so a cached frame is never mistaken for a live one.
- R34. With no network, the last-seen version of a visited page still renders.
- R35. Returning the app to the foreground revalidates the current page when its
  data is older than about 60 seconds.
- R36. The app does not poll and does not prefetch linked pages.
- R37. The last-visited page is persisted with a timestamp; on launch it is
  restored if under an hour old, and otherwise the app opens on page 100.
- R38. A restored page is always refetched, never rendered from storage alone.

#### Errors

- R39. A response whose `status` field is not `"success"` renders the SVT
  wording "Sidan ej i sändning" — decided by the `status` field, never by the
  HTTP status code.
- R40. A not-broadcast page offers its `prevPage` and `nextPage` neighbours as
  one-tap buttons.
- R41. A transport failure renders visibly differently from a not-broadcast
  page, and offers a retry button.

#### Non-functional

- R42. The app requires no configuration and exposes no settings screen.
- R43. The app has no server-side code; the browser fetches the SVT API
  directly.
- R44. The whole build lands as commits on `main`. No branch, no PR, no push.
- R45. `npm run mock` serves the captured fixtures on a local port, and
  `npm run dev` points the app at it, without changing the production default
  base URL.
- R46. The production build's default API base URL is
  `https://www.svt.se/text-tv`.

### Scope Boundaries

Explicitly not built, per the PRD: swipe gestures, an `altText` text-mode
renderer, an edge proxy, favourites / tile grid / settings, notifications or
background polling, an offline archive with its own eviction policy, search,
accounts or analytics, an in-app install prompt flow, any language other than
Swedish, and auto-cycling sub-pages.

Cloudflare Workers deployment config is written (`wrangler.jsonc` plus a
documented deploy command) but not executed: there is no remote and no
credentials in this environment.

### Acceptance Examples

- AE1. Given page 100 is displayed, when the reader taps the "106" printed in
  the frame, the app displays page 106 and the URL hash reads `#106`.
  Covers R16, R22.
- AE2. Given page 106 is displayed after tapping from 100, when the reader
  triggers the system back gesture, page 100 is displayed again. Covers R23.
- AE3. Given page 139 is displayed, when the reader taps the next arrow, page
  250 is displayed — the numbers between are not broadcast and are skipped.
  Covers R25.
- AE4. Given the page input is empty, when the reader types `3`, `3`, `1`, the
  app displays page 331 without any further interaction. Covers R29.
- AE5. Given page 331 is displayed, all 14 of its sub-pages are present in one
  vertical scroll, and none of them replaces another over time. Covers R14, R15.
- AE6. Given the reader navigates to page 200, the text "Sidan ej i sändning"
  is displayed with buttons for 139 and 250, even though the HTTP status was
  200. Covers R39, R40.
- AE7. Given the network fails, the error shown is distinct from
  "Sidan ej i sändning" and a retry button is present. Covers R41.
- AE8. Given page 100 was last visited two hours ago, when the app launches it
  displays page 100; given it was last visited ten minutes ago on page 377, the
  app displays page 377. Covers R37.
- AE9. Given a cached copy of page 100 exists, when the reader navigates to
  100 the cached frame paints before the network responds, and the freshness
  indicator says the content is cached. Covers R32, R33.

### Sources

- `PRD.md` — the specification.
- `CLAUDE.md` — stack and repo conventions.
- `fixtures/raw_{100,104,105,200,331,377}.json` — responses captured live from
  `https://www.svt.se/text-tv/api/{page}` on 2026-08-22.

## Planning Contract

### Key Technical Decisions

- KTD1. **React 19 + TypeScript, built with Vite 7, with `vite-plugin-pwa` for
  the manifest and service worker.** Set by `CLAUDE.md` and the PRD.
  Governs R1, R2.
- KTD2. **No backend and no proxy: the browser fetches
  `https://www.svt.se/text-tv/api/{page}` directly**
  (session-settled: user-approved — chosen over an edge proxy Worker: a proxy
  adds a second service to the critical path and a second staleness layer).
  The API sends `access-control-allow-origin: *`. Accepted risk: if that header
  is removed the app breaks until a proxy is deployed. Governs R43.
- KTD3. **The API client is the only module that knows SVT's wire format.** It
  normalises every response into a three-case discriminated union:
  `{ kind: 'page' }`, `{ kind: 'not-broadcast', prev, next }`,
  `{ kind: 'error' }`. `""` for `prevPage` / `nextPage` normalises to
  `undefined`. The UI switches on `kind` exhaustively. Governs R39, R40, R41.
- KTD4. **The base URL comes from `import.meta.env.VITE_SVT_API_BASE`, with
  `https://www.svt.se/text-tv` as the fallback baked into the source**
  (session-settled: user-directed — chosen over pointing the client at the live
  API in every environment: the sandbox is throttled). `.env.development`
  points at the json-server mock; production has no override so the fallback
  applies. Governs R45, R46.
- KTD5. **Hotspots are absolutely-positioned transparent elements over the
  frame, sized in percentages of 520x400.** Hit resolution is not left to the
  DOM: a single click handler on the frame wrapper converts the touch point to
  frame coordinates and picks the rect with the nearest centre, which is what
  makes overlap deterministic under 44px expansion. Governs R17, R18, R19.
- KTD6. **The `imageMap` parser is a pure function**, `parseImageMap(s): Rect[]`.
  It is regex-based over the whole string, case-insensitive on tag and attribute
  names, tolerant of tab or space separation, and drops entries whose `COORDS`
  do not yield four finite numbers or whose `HREF` is not three digits. The live
  payload uses uppercase `<AREA>` tags and tab separators. Governs R16.
- KTD7. **Link marking is a 1px `border-bottom` on the hotspot element, drawn
  at the original rect's bottom edge, not on the expanded target**, so the
  underline sits under the printed digits. Its colour is sampled from the
  frame's own palette by using a fixed teletext foreground (`#fff`) at reduced
  opacity rather than reading pixels: reading pixels from the GIF would need a
  canvas round-trip per rect for a purely cosmetic gain. Governs R20.
- KTD8. **Caching is a two-layer stale-while-revalidate.** Layer one is an
  in-app `localStorage`-backed page store keyed by page number, holding the
  normalised page and a fetch timestamp; it is what paints instantly and what
  survives with no network. Layer two is the `vite-plugin-pwa` service worker,
  which precaches the app shell only. The API is deliberately not given a
  Workbox runtime cache: the app store already owns page freshness, and two
  caches would produce two staleness answers. Governs R32, R33, R34.
- KTD9. **Routing is `hashchange` on `window.location.hash`, not a router
  library.** One hash segment, always three digits; every navigation is
  `location.hash = page`, which pushes an entry natively. An invalid or absent
  hash resolves through the restore rule to 100. Governs R22, R23, R37.
- KTD10. **State lives in one `useTextTv` hook** owning current page, load
  outcome, and freshness; components are presentational. This keeps the primary
  test seam — render the app, fake HTTP, assert the DOM — able to cover
  everything without reaching into internals. Governs R42.
- KTD11. **Commit directly to `main`; no branch, no PR, no push**
  (session-settled: user-directed — chosen over a feature branch and PR: the
  user asked for it and the repo has no remote). Governs R44.
- KTD12. **Tests are Vitest + `@testing-library/react` on `happy-dom`, with the
  network faked at the HTTP boundary by `msw`**
  (session-settled: user-approved — chosen over stubbing the API client module:
  the PRD requires the client itself to stay inside the test). Fixtures are the
  captured files, loaded from disk by the msw handlers. Governs R45.
- KTD13. **The mock is `json-server` over a generated `mock/db.json` whose
  `api` collection is keyed by page number**, so `GET /api/100` resolves
  naturally without a rewrite rules file. `mock/db.json` is generated from
  `fixtures/raw_*.json` by a small script, so the fixtures stay the single
  source of truth. Governs R45.

### High-Level Technical Design

```
   window.location.hash  ──►  useTextTv (state, freshness, restore rule)
                                   │
                    ┌──────────────┼───────────────┐
                    ▼              ▼               ▼
              pageStore        api.ts          visibilitychange
           (localStorage)   (fetch + normalise)   (>60s → refetch)
                                   │
                                   ▼
                        fetch(`${BASE}/api/{page}`)
                    dev → http://localhost:3001   prod → www.svt.se/text-tv

   App
    ├── FreshnessBar    "Uppdaterad 12:04" | "Cachad · uppdaterar…"
    ├── PageView (scroll container, bottom-padded)
    │     └── SubPageFrame  × n     (stacked, never cycled)
    │           ├── <img src="data:image/gif;base64,…">   pixelated, 520×400
    │           └── HotspotLayer     % rects, ≥44px tall, nearest-centre hit
    ├── NotBroadcast / TransportError    (mutually exclusive with PageView)
    └── BottomBar       [123] [◀] [▲100] [▶]     safe-area inset
```

Three render states, switched on the client's `kind`, are mutually exclusive.
Only `page` renders `PageView`.

Frame geometry, confirmed against the captured fixtures: 520x400 px, a 40x25
character grid, so cells are 13x16 px. Hotspot rects are 39x16 px — three
characters by one row. At phone-portrait width the frame renders at roughly
0.75x, making a rect about 29x12 CSS px; the height is the binding constraint
against the 44px minimum, which is why expansion is vertical only.

### Assumptions

- The captured fixtures represent the live wire format faithfully. Confirmed
  against them: page 200 returns HTTP 200 with `status:"fail"`,
  `prevPage:"139"`, `nextPage:"250"` and no frame; page 331 has 14 sub-pages;
  `imageMap` is tab-separated with uppercase `<AREA>`; a `meta.updated` ISO
  timestamp is present on successful responses.
- `meta.updated` is SVT's own publication time and is used for the freshness
  indicator where present, with the local fetch time as the fallback.
- The PRD's stated `prevPage` of `138` for page 200 is stale; the live capture
  says `139`. Fixtures win.

### Sequencing

U1 → U2 → U3 → U4 → U5 → U6 → U7 → U8 → U9. U1 through U3 are the spine
(scaffold, fixtures/mock, client). U4 through U7 are the reader. U8 and U9 are
the PWA shell and deploy config, which need the app to exist first.

### Risks & Dependencies

- **CORS removal at SVT** breaks the app with no server-side fallback. Named
  and accepted in KTD2; the mitigation is a proxy Worker, held in reserve.
- **Nearest-centre hit resolution on a dense page** may not pick what the
  reader meant. It cannot be settled by automated tests; it is on the manual
  device checklist.
- **json-server 1.x is a beta line.** The keyed-collection route shape (KTD13)
  is the only feature relied on; if it changes, a twenty-line Node static
  server replaces it without touching app code.

## Implementation Units

### U1. Project scaffold

**Goal:** `npm run dev`, `npm run build` and `npm test` all work on an empty
React + TypeScript + Vite app.

**Requirements:** R44, R46.

**Files:** `package.json`, `tsconfig.json`, `tsconfig.node.json`,
`vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`,
`src/index.css`, `.gitignore`.

**Approach:** Vite React-TS scaffold, hand-written rather than via
`npm create` so no interactive prompt is needed. Add Vitest with `happy-dom`,
`@testing-library/react`, `@testing-library/user-event` and `msw`. `npm run
build` runs `tsc -b && vite build`. Update `CLAUDE.md`'s Commands section,
which is currently a placeholder.

**Test scenarios:** A smoke test renders `App` and asserts it mounts.

**Verification:** `npm run build` and `npm test` both pass.

### U2. Fixtures and the json-server mock

**Goal:** The captured SVT responses are checked in, and `npm run mock` serves
them at `http://localhost:3001/api/{page}`.

**Requirements:** R45.

**Files:** `fixtures/raw_100.json`, `fixtures/raw_104.json`,
`fixtures/raw_105.json`, `fixtures/raw_200.json`, `fixtures/raw_331.json`,
`fixtures/raw_377.json`, `scripts/build-mock-db.mjs`, `mock/db.json`,
`.env.development`, `package.json`.

**Approach:** `scripts/build-mock-db.mjs` reads every `fixtures/raw_*.json` and
writes `mock/db.json` as `{ "api": [ { "id": "100", …response }, … ] }` (KTD13).
`npm run mock` runs the generator then `json-server mock/db.json --port 3001`.
`.env.development` sets `VITE_SVT_API_BASE=http://localhost:3001`. `mock/db.json`
is generated but checked in, so `npm run mock` works without a build step.

**Test scenarios:** None automated — this unit is dev infrastructure. Its
correctness is observed by U3's tests, which read the same fixture files.

**Verification:** `npm run mock` then
`curl -s localhost:3001/api/200` returns the `status:"fail"` body, and
`curl -s localhost:3001/api/331 | node -e '…'` reports 14 sub-pages.

### U3. Typed API client

**Goal:** One module converts an SVT response into exactly one of three
normalised outcomes.

**Requirements:** R39, R40, R41, R43, R46.

**Files:** `src/api.ts`, `src/api.types.ts`.

**Approach:** Per KTD3 and KTD4. `fetchPage(pageNumber): Promise<PageResult>`
where `PageResult` is
`{ kind: 'page'; pageNumber; prev?; next?; subPages: SubPage[]; updatedAt }`
| `{ kind: 'not-broadcast'; pageNumber; prev?; next? }`
| `{ kind: 'error'; message }`. Success is decided by `body.status ===
'success'`, never by `response.ok`. `""` neighbours normalise to `undefined`.
A thrown fetch, a non-2xx status, and unparseable JSON all become `kind:
'error'`. `subPages` carries `subPageNumber`, `gifDataUrl` (the
`data:image/gif;base64,` prefix applied here so no component builds URLs), and
the raw `imageMap` string for U4 to parse.

**Test scenarios:** Covered through the primary seam in U6/U7, per the PRD.

**Verification:** `npm run build` typechecks; no direct unit test by design.

### U4. imageMap parser

**Goal:** A pure function turns an `imageMap` string into structured rects with
percentage geometry.

**Requirements:** R16, R17.

**Files:** `src/imageMap.ts`, `src/imageMap.test.ts`.

**Approach:** Per KTD6. `parseImageMap(map: string, frame = {w:520,h:400}):
Hotspot[]`, each hotspot carrying `href`, pixel `x1,y1,x2,y2`, and derived
`leftPct, topPct, widthPct, heightPct` plus `centreX, centreY` in pixels for
U5's hit resolution. Malformed entries are skipped, not thrown on.

**Test scenarios:** This is the PRD's secondary seam and gets direct unit
tests: the real page-100 map string parses to the expected rect count and the
first rect's exact percentages; lowercase `<area>` and lowercase attributes
parse identically; space-separated and newline-separated maps parse identically
to the live tab-separated one; a `COORDS` with three numbers is skipped; a
non-numeric `COORDS` is skipped; a non-three-digit `HREF` is skipped; an empty
string yields `[]`. Percentage arithmetic is asserted exactly
(`39/520 = 7.5%`, `16/400 = 4%`).

**Verification:** `npm test src/imageMap.test.ts` passes.

### U5. Frame and hotspot rendering

**Goal:** A page's sub-pages render stacked, pixelated, with visible tappable
links.

**Requirements:** R11, R12, R13, R14, R15, R16, R18, R19, R20, R21.

**Files:** `src/components/PageView.tsx`, `src/components/SubPageFrame.tsx`,
`src/components/HotspotLayer.tsx`, `src/components/frame.css`.

**Approach:** `PageView` maps sub-pages to `SubPageFrame` in document order, in
a scroll container with bottom padding equal to the bar height (R31).
`SubPageFrame` renders the `<img>` at `width:100%`, `aspect-ratio:520/400`,
`image-rendering:pixelated`, with `HotspotLayer` absolutely positioned over it.
Per KTD5, `HotspotLayer` renders one transparent element per rect for the
underline and the tap flash, but the click handler sits on the layer and
resolves by nearest centre in frame coordinates, so overlap is deterministic.
Each element's height is `max(rect height %, 44px)` via
`calc()`/`min-height`, centred with a negative margin. The underline (KTD7) is
drawn on an inner element pinned to the original rect's bottom edge, so
expansion does not move it. The tap flash is a class toggled for ~120ms on the
resolved rect.

**Test scenarios:** Through the primary seam in U7.

**Verification:** Visual check via `npm run dev` against the mock; automated
coverage lands in U7.

### U6. State, routing, freshness and caching

**Goal:** The app knows which page it is on, paints cached content instantly,
revalidates, and restores the last page under the hour rule.

**Requirements:** R22, R23, R25, R26, R27, R30, R32, R33, R34, R35, R36, R37,
R38.

**Files:** `src/useTextTv.ts`, `src/pageStore.ts`, `src/App.tsx`.

**Approach:** Per KTD8, KTD9, KTD10. `pageStore` wraps `localStorage` with
`read(page)`, `write(page, result)`, `readLastVisited()`,
`writeLastVisited(page)`, all guarded so a `localStorage` failure degrades to
in-memory. On mount, `useTextTv` resolves the initial page: a valid three-digit
hash wins; otherwise the last-visited entry if its timestamp is under an hour
old; otherwise 100 — and it always refetches (R38). On page change it paints the
stored copy immediately if present, marks the render stale, then fetches and
swaps. A `visibilitychange` listener refetches when the document becomes
visible and the current page's data is older than 60s. Only successful pages are
stored; a `not-broadcast` or `error` result never overwrites a good cached copy.

**Test scenarios:** Through the primary seam in U7.

**Verification:** Automated coverage lands in U7.

### U7. Chrome, controls, error states, and the primary test seam

**Goal:** The bottom bar, freshness indicator, attribution and the two error
states are in place, and the app's behaviour is covered end to end with the
network faked at the HTTP boundary.

**Requirements:** R3, R8, R9, R10, R24, R28, R29, R30, R31, R39, R40, R41, R42.

**Files:** `src/components/BottomBar.tsx`,
`src/components/FreshnessBar.tsx`, `src/components/NotBroadcast.tsx`,
`src/components/TransportError.tsx`, `src/components/chrome.css`,
`src/test/fixtures.ts`, `src/test/server.ts`, `src/test/setup.ts`,
`src/app.test.tsx`.

**Approach:** `BottomBar` is `position:fixed; bottom:0` with
`padding-bottom: env(safe-area-inset-bottom)`, opaque black, holding the
numeric input, prev arrow, home, next arrow and the current page number.
Arrows read `prev`/`next` off the current result and are disabled when absent
(R26). The input navigates and blurs on the third digit (R29).
`FreshnessBar` renders "Uppdaterad HH:MM" for fresh content and
"Cachad · uppdaterar…" while revalidating (R33), plus the
"Innehåll från SVT Text" attribution (R10). `NotBroadcast` renders
"Sidan ej i sändning" with neighbour buttons; `TransportError` renders a
distinct message and "Försök igen". All strings are Swedish inline.

The test seam is msw handlers over `*/api/:page` serving the captured fixtures
from disk, with the app rendered whole. No test imports `api.ts` or a component
directly.

**Test scenarios:** AE1 through AE9, each as one test. Plus: the next arrow is
disabled on a page with no `nextPage`; typing two digits does not navigate;
"Innehåll från SVT Text" is present; the retry button refetches and recovers to
a rendered page.

**Verification:** `npm test` passes with every AE covered.

### U8. PWA shell, icons and manifest

**Goal:** The app is installable, launches standalone and black, and precaches
its shell.

**Requirements:** R1, R2, R4, R5, R6, R7, R8, R34.

**Files:** `vite.config.ts`, `index.html`, `public/icon-192.png`,
`public/icon-512.png`, `public/icon-maskable-512.png`,
`public/apple-touch-icon.png`, `scripts/make-icons.mjs`.

**Approach:** `vite-plugin-pwa` with `registerType:'autoUpdate'`, a manifest
naming the app "Text-TV", `display:'standalone'`, `background_color` and
`theme_color` both `#000000`, and `start_url: '/'`. Workbox precaches the built
shell; the API is not given a runtime cache (KTD8). `index.html` declares the
180x180 `apple-touch-icon`, `apple-mobile-web-app-capable`,
`apple-mobile-web-app-status-bar-style: black-translucent`, a black
`theme-color` meta and a black `html`/`body` background so there is no launch
flash. `scripts/make-icons.mjs` generates the icons deterministically as raw
PNGs — teletext digits in teletext colours on black, drawn from a small
hand-coded bitmap font so there is no image-library dependency.

**Test scenarios:** None automated; manifest and icon behaviour is on the
manual device checklist.

**Verification:** `npm run build` emits `dist/manifest.webmanifest`, a service
worker, and all four icons; `npm run preview` serves an installable app.

### U9. Deploy config and documentation

**Goal:** Deploying is one command, and the repo documents how to run, test and
mock.

**Requirements:** R42, R44.

**Files:** `wrangler.jsonc`, `CLAUDE.md`, `README.md`.

**Approach:** `wrangler.jsonc` configures Cloudflare Workers static assets
(`assets.directory: "./dist"`, SPA-style `not_found_handling`), with
`npm run deploy` as `npm run build && wrangler deploy`. It is written and
committed but not run — there are no credentials here, and the custom domain is
attached in the Cloudflare dashboard. `README.md` covers install, dev against
the mock, test, build and deploy, plus the manual device checklist the PRD says
automated tests cannot cover. `CLAUDE.md`'s placeholder Commands section is
filled in.

**Test scenarios:** None.

**Verification:** `npx wrangler deploy --dry-run` succeeds offline, or the
config is validated by inspection if wrangler cannot run without auth.

## Verification Contract

Commands, all from the repo root:

- `npm run build` — `tsc -b && vite build`. Must pass with no type errors.
- `npm test` — `vitest run`. Must pass.
- `npm run mock` — regenerates `mock/db.json` and serves it on port 3001.
- `npm run dev` — Vite dev server, pointed at the mock by `.env.development`.

Quality gates:

- Every acceptance example AE1–AE9 has a passing test in `src/app.test.tsx`.
- `src/imageMap.test.ts` covers every malformed-input case listed in U4.
- No test imports `src/api.ts` or a component module directly; the app-level
  seam and the parser are the only two seams.
- No production source file contains a hardcoded `localhost` or a hardcoded
  `https://www.svt.se` outside the single fallback constant in `src/api.ts`.
- `git status` is clean and every change is committed on `main`.

Not covered by automated tests, and stated as such in `README.md`: whether
0.75x text is readable for the intended reader, whether 44px hotspots are
hittable in practice and whether nearest-centre picks what was meant, service
worker behaviour on a real iOS home-screen install, and install/icon/splash
appearance in standalone mode.

## Definition of Done

Global:

- Every requirement R1–R46 is implemented or explicitly reported as not done
  with a reason.
- `npm run build` and `npm test` both pass from a clean `npm install`.
- The app runs against `npm run mock` with no network access to svt.se.
- The production default base URL is the real SVT endpoint (R46), and no dev
  override leaks into the built output.
- All user-visible strings are Swedish.
- No code from the PRD's "Out of Scope" list is present.
- Abandoned or experimental code from approaches that did not pan out is
  removed, not left in the tree.
- Work is committed on `main`. No branch, no push, no PR.

Per unit: the unit's Verification line passes, and the requirements it names
are demonstrably satisfied.
