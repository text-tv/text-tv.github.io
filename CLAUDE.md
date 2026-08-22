# text-tv

Progressive web app wrapping **SVT Text** (Swedish teletext) in a modern,
installable, mobile-friendly UI.

> Starter file — the repo is empty. Fill in / correct sections as the code lands.

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

_To be filled once package.json exists. Expected:_

- `npm install` — install deps
- `npm run dev` — Vite dev server
- `npm run build` — typecheck + production build
- `npm run preview` — serve the production build

## Conventions

- Keep the SVT API client isolated (e.g. `src/api.ts`) with typed responses.
- Use hash-based routing (`#100`) so page numbers are shareable and the browser
  back button works.
- Style teletext frames with `image-rendering: pixelated`; respect safe-area
  insets for installed/standalone display.
