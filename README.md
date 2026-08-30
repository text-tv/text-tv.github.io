# Text-TV

A progressive web app that wraps [SVT Text](https://www.svt.se/text-tv/100)
(Swedish teletext) in an installable, touch-friendly reader.

SVT publishes each page as a picture. This app decodes that picture back into
a character grid and **re-draws the page as real text**, in a face chosen for
reading on a phone and on rows set further apart than broadcast. It is the same
page, laid out on the same 40-column grid and in the same colours, but it is a
rendering rather than a copy — readability was preferred over the exact
teletext look. Where a character cannot be identified, that cell falls back to
its own slice of SVT's picture, so a page always reads correctly.

Drawn as text, the page can be selected and copied, and it adds the thing the
mobile web page loses: **the page references printed inside the frame are real,
finger-sized tap targets**. Page 100 is the home screen. There are no accounts,
no settings and no favourites.

## Install as an app

The app lives at **<https://text-tv.github.io/>** and works in any browser
right away. Installing it just puts it on your home screen, where it opens
full-screen with no browser bars and keeps the last pages you read available
offline. Nothing is downloaded from an app store, and nothing asks for an
account.

**iPhone / iPad (Safari)** — Safari is required; Chrome on iOS cannot install
apps.

1. Open <https://text-tv.github.io/> in Safari.
2. Tap the **Share** button (the square with an arrow pointing up), at the
   bottom of the screen on iPhone, top right on iPad.
3. Scroll down the list and tap **Lägg till på hemskärmen** / **Add to Home
   Screen**.
4. Tap **Lägg till** / **Add**. The icon appears on your home screen.

**Android (Chrome)**

1. Open <https://text-tv.github.io/> in Chrome.
2. A banner offering to install may appear — tap it and you are done.
3. Otherwise tap the **⋮** menu, top right, and choose **Installera app** /
   **Install app** (older versions say **Lägg till på startskärmen**).
4. Confirm with **Installera** / **Install**.

**Desktop (Chrome or Edge)** — click the install icon at the right-hand end of
the address bar, or use the **⋮** / **…** menu and choose **Install**.

To remove it, delete the icon the same way you would any other app.

## Requirements

Node 20 or later.

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies. |
| `npm run mock` | Regenerate `mock/db.json` from `fixtures/` and serve it on port 3001. |
| `npm run dev` | Vite dev server. Points at the mock, so run `npm run mock` alongside it. |
| `npm test` | Run the test suite once. |
| `npm run build` | Typecheck and produce a production build in `dist/`. |
| `npm run preview` | Serve the production build. |
| `npm run icons` | Regenerate the app icons in `public/`. |
| `npm run glyphs` | Rebuild the cell-to-character table from the fixtures. |
| `npm run glyphs:check` | Fail if the committed table no longer matches its inputs. |

## Development against the mock

The SVT API is public and sends `access-control-allow-origin: *`, so the
browser fetches it directly and there is no backend. Development still runs
against a local mock, so a dev loop does not hammer SVT:

```bash
npm run mock     # terminal 1 — json-server on :3001
npm run dev      # terminal 2 — Vite, pointed at :3001
```

`.env.development` sets `VITE_SVT_API_BASE=http://localhost:3001`. Production
has no override, so the app falls back to `https://www.svt.se/text-tv`, the
constant in `src/api.ts`.

`fixtures/raw_*.json` are responses captured live from the real API. They are
the single source of truth: `mock/db.json` is generated from them, and the
tests read them directly. To add a page:

```bash
curl -s https://www.svt.se/text-tv/api/377 > fixtures/raw_377.json
node scripts/build-mock-db.mjs
```

The mock only holds the captured pages, so navigating to any other number in
dev gives a transport error rather than SVT's "not broadcast" answer.

## Architecture

- `src/api.ts` — the only module that knows SVT's wire format. It normalises
  every response into one of three outcomes: a page, a not-broadcast result
  carrying its neighbours, or a transport error. The API answers **HTTP 200 for
  pages that do not exist**, so success is decided by the payload's `status`
  field and never by the HTTP status code.
- `src/teletext/` — decodes a frame GIF into a grid of cells (character,
  colours, block graphics) and hands it to `TextFrame`, which draws the page as
  positioned runs of text. `glyphs.generated.ts` is the lookup table from cell
  bitmap to character, built from the fixtures by `npm run glyphs`. A cell the
  table does not know is named from the sub-page's own alt text, lined up with
  the grid by `align.js`; only a cell no alignment reaches, or a frame that
  does not decode at all, falls back to the GIF.
- `src/imageMap.ts` — parses SVT's `<map>` string into rects, and resolves a
  touch to the rect whose centre is nearest. Pure, and directly unit-tested.
- `src/useTextTv.ts` — current page, freshness and caching. Navigation goes
  through the URL hash (`#100`), so pages are shareable and the system back
  gesture works.
- `src/pageStore.ts` — `localStorage` copies of seen pages, so a visited page
  paints instantly and still renders with no network.

Frames are 520x400 with a 40x25 character grid, so a broadcast cell is 13x16 px
and a page reference is 39x16 px. Every measurement in the CSS derives from
that cell, including the extra row spacing: `--leading` in `src/index.css`
stretches the cell vertically and the frame grows with it, so the grid stays
whole. Even so, a reference is only about 29x15 CSS px at phone width — so tap
targets are expanded vertically to 44 px, centred on the printed rect, and
overlaps resolve to the nearest centre.

## Tests

`npm test` covers two seams:

- **The whole app, with the network faked at the HTTP boundary** by `msw`
  serving the captured fixtures. This is where nearly everything is tested:
  rendering, tapping a link, arrow stepping, typing a number, the
  not-broadcast message, the transport error and its retry, the
  restore-or-reset-to-100 rule, and the freshness indicator.
- **The pure modules directly** — `parseImageMap` and `resolveHotspot` for the
  combinatorial cases (attribute casing, separators, malformed coordinates)
  that would be slow and indirect to drive through the DOM, and the teletext
  decoder for the cell grid it recovers from a captured frame.

The API client and the individual components have no unit tests by design;
they are covered through the app-level seam.

## Diagnosing on a phone

Add `?diag` to the URL — `https://text-tv.github.io/?diag#300` — and a small
green readout appears above the section rail. It shows which commit the running
build came from, the viewport the browser has given the page, and where the
shell sits inside it. `MER` expands that to everything measurable: the visual
viewport, the safe-area insets, the scroll range, the viewport meta.

`LOGG` opens the log. Every console line is kept from before the first render,
along with uncaught errors and unhandled rejections, and `KOPIERA` puts the lot
on the clipboard — which is how you get a phone session into a bug report.
While the readout is open it also writes a line at intervals after boot and on
every event that could move the page, so what arrives is a sequence rather than
a snapshot.

It exists because the browser bugs worth chasing here only happen on a phone,
where there is no console to open. `src/viewportReset.ts` documents one such:
Chrome for iOS leaves the web view at the full height of the screen after
reloading a page reached by an in-app link, and nothing the page can measure
says so.

`?nofix` stands that workaround down for one load. The correction hides the bug
rather than ending it, so this is how you look at the browser's own behaviour
again — to see whether a Chrome flag or a Chrome release changes it, or whether
the workaround is still earning its place. `?nofix&diag` gives you both.

## Deployment

GitHub Pages, from `.github/workflows/deploy.yml`. Every push to `main` runs
the tests, builds, and publishes `dist/`. There is no deploy command to run by
hand — enable it once under **Settings -> Pages -> Source: GitHub Actions**.

The build uses a relative `base`, so the same output works at a project path
(`https://<user>.github.io/text-tv/`) or at a domain root, with no rebuild. Add
a custom domain by setting it in the Pages settings and committing the `CNAME`
file it creates to `public/`.

Two things Pages needs and already has: `public/.nojekyll`, so it serves the
build verbatim instead of running Jekyll over it, and hash routing (`#100`), so
no path but `/` is ever requested and the missing SPA rewrite never matters.

Pages serves static files only. There is no server-side code, and none is
needed — the browser talks to SVT directly. If SVT ever stops sending the CORS
header, the app breaks until a small proxy is deployed somewhere. This is a
known single point of failure, accepted for the simplicity of having nothing
between the reader and SVT.

## Attribution

Content comes from SVT Text. This is not SVT's own app and does not use SVT's
marks.
