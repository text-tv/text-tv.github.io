# Text-TV

A progressive web app that wraps [SVT Text](https://www.svt.se/text-tv/100)
(Swedish teletext) in an installable, touch-friendly reader.

It renders the exact teletext frames SVT publishes, and adds the thing the
mobile web page loses: **the page references printed inside the frame are real,
finger-sized tap targets**. Page 100 is the home screen. There are no accounts,
no settings and no favourites.

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
| `npm run deploy` | Build and deploy to Cloudflare Workers. |

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
- `src/imageMap.ts` — parses SVT's `<map>` string into rects, and resolves a
  touch to the rect whose centre is nearest. Pure, and directly unit-tested.
- `src/useTextTv.ts` — current page, freshness and caching. Navigation goes
  through the URL hash (`#100`), so pages are shareable and the system back
  gesture works.
- `src/pageStore.ts` — `localStorage` copies of seen pages, so a visited page
  paints instantly and still renders with no network.

Frames are 520x400 with a 40x25 character grid, so a cell is 13x16 px and a
page reference is 39x16 px. At phone width the frame renders at about 0.75x,
making a reference roughly 29x12 CSS px — so tap targets are expanded
vertically to 44 px, centred on the printed rect, and overlaps resolve to the
nearest centre.

## Tests

`npm test` covers two seams:

- **The whole app, with the network faked at the HTTP boundary** by `msw`
  serving the captured fixtures. This is where nearly everything is tested:
  rendering, tapping a link, arrow stepping, typing a number, the
  not-broadcast message, the transport error and its retry, the
  restore-or-reset-to-100 rule, and the freshness indicator.
- **`parseImageMap` and `resolveHotspot` as pure functions**, for the
  combinatorial cases — attribute casing, separators, malformed coordinates —
  that would be slow and indirect to drive through the DOM.

The API client and the individual components have no unit tests by design;
they are covered through the app-level seam.

### Not covered by tests — check on the real devices

- Whether 0.75x text is readable for the intended reader.
- Whether 44 px hotspots are hittable in practice, and whether nearest-centre
  resolution picks what was meant on a dense page.
- Service worker behaviour on a real iOS home-screen install.
- Install, icon and splash appearance in standalone mode.

## Deployment

Cloudflare Workers static assets, configured in `wrangler.jsonc`:

```bash
npm run deploy
```

The custom domain is attached in the Cloudflare dashboard. There is no
server-side code — the Worker only serves `dist/`.

If SVT ever stops sending the CORS header, the app breaks until a small proxy
Worker is deployed. This is a known single point of failure, accepted for the
simplicity of having no service between the reader and SVT.

## Attribution

Content comes from SVT Text. This is not SVT's own app and does not use SVT's
marks.
