# text-tv

Progressive web app wrapping **SVT Text** (Swedish teletext) in a modern,
installable, mobile-friendly UI.

## Stack

- **React** + **TypeScript**
- **Vite** (dev server + build)
- **vite-plugin-pwa** for the service worker + manifest (installable, offline-capable)

## SVT Text API

- Endpoint: `https://www.svt.se/text-tv/api/{page}` (e.g. `/api/100`)
- Public, no auth. Sends `access-control-allow-origin: *`, so it can be fetched
  **directly from the browser** — no proxy/backend needed.
- Response: `{ status: "success", data: { pageNumber, prevPage, nextPage, subPages: [...] } }`
  - `prevPage` / `nextPage` are `""` when absent.
  - Each sub-page has `subPageNumber`, `gifAsBase64` (a full teletext frame as a
    base64 GIF), `altText`, and `imageMap` — an **HTML `<map>` string** with
    `<AREA SHAPE="RECT" COORDS="x1,y1,x2,y2" HREF="NNN">` clickable page links.
- Render `gifAsBase64` via a `data:image/gif;base64,...` URL. Parse the imageMap
  string to overlay transparent link hotspots on the GIF (position them as
  percentages of the GIF's native pixel size so they scale responsively).

## Commands

- `npm install` — install deps
- `npm run mock` — regenerate `mock/db.json` from `fixtures/` and serve it on :3001
- `npm run dev` — Vite dev server, pointed at the mock by `.env.development`
- `npm test` — Vitest, once
- `npm run build` — typecheck + production build
- `npm run preview` — serve the production build
- `npm run icons` — regenerate `public/*.png`

Deployment is GitHub Pages via `.github/workflows/deploy.yml` on push to `main`;
there is no deploy command. The build sets a relative `base`, so it works at a
project path or a domain root unchanged.

Development runs against a local `json-server` mock rather than the live API.
`fixtures/raw_*.json` are captured real responses and are the single source of
truth — `mock/db.json` is generated from them and the tests read them directly.
Production has no `VITE_SVT_API_BASE` override, so it uses the real endpoint.

## Conventions

- Keep the SVT API client isolated in `src/api.ts` with typed responses. It is
  the only module that knows SVT's wire format; everything above it consumes
  the three normalised outcomes in `src/api.types.ts`.
- Success is decided by the payload's `status` field, never by the HTTP status
  code — the API answers 200 for pages that are not broadcast.
- Test at the app level with the network faked at the HTTP boundary (`msw` +
  the captured fixtures). Do not unit-test the API client or individual
  components; pure modules with no DOM of their own may be unit-tested.
- All user-visible strings are Swedish, inline. No i18n framework.
- Use hash-based routing (`#100`) so page numbers are shareable and the browser
  back button works.
- Style teletext frames with `image-rendering: pixelated`; respect safe-area
  insets for installed/standalone display.
- Most bugs worth chasing only appear on a phone, where there is no console.
  `?diag` (as in `/?diag#300`) paints a readout over the page: the build's
  commit, the viewport, and where the shell sits, with the full set behind
  `MER`. `LOGG` shows everything the app has written to the console since boot
  - `src/log.ts` mirrors it into a ring buffer from before the first render,
  along with uncaught errors - and copies it to the clipboard, which is how a
  phone session gets reported. Reach for it before guessing; a snapshot of the
  numbers has settled arguments that days of theory did not. `?nofix` stands
  down the Chrome for iOS workaround in `src/viewportReset.ts` for one load, so
  the browser's own behaviour can be looked at rather than hidden.

## Project knowledge

- `docs/solutions/` — documented solutions to past problems (bugs, best
  practices, workflow patterns), organised by category with YAML frontmatter
  (`module`, `tags`, `problem_type`). Relevant when implementing or debugging
  in a documented area.
- `CONCEPTS.md` — shared domain vocabulary, relevant when orienting to the
  codebase or discussing domain concepts.
- `CLAUDE.local.md` — user- or machine-specific instructions, if the file
  exists. Gitignored, and whoever works in a checkout decides what goes in
  theirs; read it when it is there.

@CLAUDE.local.md
