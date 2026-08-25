# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Teletext pages

**Page** — one numbered screen of teletext, addressed by three digits. The number is the whole address: there is no hierarchy and no path, and a page is reachable only by knowing or being linked to its number.

**Sub-page** — one screen belonging to a page. A page with more content than fits carries several, which broadcast teletext cycles through on a timer. Here they are all shown at once, stacked, because advancing a screen under a reader mid-sentence is the classic teletext frustration.

**Frame** — the picture of one sub-page as the upstream service publishes it: a fixed-size image, never text. Everything the reader sees on a page originates as a frame, so anything the app wants to know about a page's content it must recover from one.

**Not broadcast** — a page number that exists in the numbering but carries no content right now. It is a normal, expected answer rather than an error, and the upstream service reports it with a successful response, so success is decided by the payload rather than by the transport.

## The character grid

**Cell** — one character position in a frame. A frame is a fixed grid of them, and every cell holds one background colour, one foreground colour, and a bitmap saying which pixels are which. Teletext's palette is eight colours and colour is set per cell, which is why a run of same-coloured cells is the natural unit to draw.

**Glyph** — what a cell's bitmap draws: either a character, or block graphics. The distinction matters because only one of the two is text.

**Glyph table** — the mapping from a cell bitmap to the character it draws, built ahead of time from captured pages and shipped with the app. It is what makes it possible to render a page as text at all, since the upstream service publishes no characters. A bitmap the table has never seen is named from the page's own alt text instead; only where that cannot be aligned does the cell fall back to showing itself as a picture, so an unrecognised glyph costs a cell rather than a page.

**Mosaic** — a cell of block graphics rather than a letter: a small fixed arrangement of solid blocks, used for logos, rules and coloured banners. Mosaics carry no character, so they are drawn as shapes and are absent from any text the page yields.

**Double height** — a row drawn at twice its normal height, used for headlines. The stretch is vertical only: a double-height character still occupies one column, and it spans two grid rows, the lower of which is not a row of its own.

**Hotspot** — a clickable region over a frame that navigates to another page. The upstream service publishes their coordinates alongside the frame, which is the only part of a page's meaning it states outright rather than leaving to be read out of the picture.

## Reading gestures

**Edge gutter** — the strip along each side of the screen where the app declines to read a sideways drag as a page change, because the operating system arms its own back gesture there. The app cannot cancel that gesture, so the gutter is how the two are kept from competing: inside it the system wins by default, outside it the drag is the reader's.

**Sheet** — one page as a single movable surface. Reading gestures act on sheets rather than on pages: a sideways drag slides the current sheet aside and the neighbouring one in, separated by a black gutter so the two never read as one continuous surface. A page is what is being read; a sheet is the thing that moves while the reader changes which page that is.
