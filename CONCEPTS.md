# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Teletext pages

**Page** — one numbered screen of teletext, addressed by three digits. The number is the whole address: there is no hierarchy and no path, and a page is reachable only by knowing or being linked to its number.

**Sub-page** — one screen belonging to a page. A page with more content than fits carries several, which broadcast teletext cycles through on a timer. Here they are all shown at once, stacked, because advancing a screen under a reader mid-sentence is the classic teletext frustration.

**Frame** — the picture of one sub-page as the upstream service publishes it: a fixed-size image, never text. Everything the reader sees on a page originates as a frame, so anything the app wants to know about a page's content it must recover from one.

**Not broadcast** — a page number that exists in the numbering but carries no content right now. It is a normal, expected answer rather than an error, and the upstream service reports it with a successful response, so success is decided by the payload rather than by the transport.

## Fetching and freshness

**Prefetch** — fetching the pages either side of the one being read before the reader asks for them, so a sideways drag reveals a drawn sheet rather than a loading one. It reaches two pages forward and one back: reading runs forward, so a second swipe that way is the one worth being ready for, while the page behind the reader is the one they just left and is already in hand. The second page forward is named by the first one's payload rather than by the page being read, because a page's neighbours are named by that page's own payload and nothing else knows them, so it is asked for as soon as that first neighbour lands. A prefetch is a convenience and never costs the reader a page they visited: it is dropped rather than allowed to evict a stored page, and one that fails is discarded rather than kept as an answer about the page. It may also satisfy itself from a page already stored, but only while that copy is fresh enough to still be servable when the reader arrives — with a margin, because the reader chooses when to swipe; an older one is drawn straight away and asked for again behind, so that landing on the page costs nothing.

**Freshness window** — how long a copy already in hand may be shown without asking the upstream service again. There are two, because the question is asked at two different moments. Arriving on a page mid-session gets a generous window: swiping between pages is reading rather than refreshing, and a page that reloads under the reader as they land on it is the cost the window exists to avoid. Returning to the app after being away gets a short one, because that is when the reader wants what is on air now. Two cases ignore both: the first load after the app opens, so a restored page is never left unfetched, and an explicit reload. Within a window a page is served with no request behind it, and its age is disclosed rather than concealed — the time shown against a page is when its contents were published, never when it was fetched, and a page the upstream service gives no publication time for shows none.

**Refresh** — asking the upstream service for a page again because the reader said so, rather than because the app decided the copy it holds has aged. The request is the same one a revalidation makes; the difference is what the reader is shown, since a refresh is the only wait they are deliberately standing over, and so the only one worth colouring, dimming a control for, or holding a gesture open through. A refresh ignores both freshness windows, because a reader who asks has already decided the copy in hand is not good enough.

A refresh is also shown for a minimum time, whether or not it needed one. A page already in hand can answer faster than the signs of asking take to appear, and a refresh nobody saw happen reads as a refresh that did not happen; the floor is on how long the asking is *displayed*, never on when the request leaves or the answer paints. It is abandoned rather than honoured when the reader moves on — they are no longer waiting, and a wait they walked away from must not be shown against the page they walked to. A reader who asks again while a refresh is still settling supersedes it: the newer asking owns the signals, and the one it replaced is neither shown nor waited on any longer.

**Change mark** — a mark against a row whose content came back different from the copy that was on screen. Marks are a real comparison of what the rows draw, never an inference that a fetch must have changed something, so a refresh that brings back the same page marks nothing at all. They answer a question the reader asked, which is why only a refresh produces them and a revalidation never does, and they fade rather than persisting: they describe one moment of change, not a property of the page.

## The character grid

**Cell** — one character position in a frame. A frame is a fixed grid of them, and every cell holds one background colour, one foreground colour, and a bitmap saying which pixels are which. Teletext's palette is eight colours and colour is set per cell, which is why a run of same-coloured cells is the natural unit to draw.

**Glyph** — what a cell's bitmap draws: either a character, or block graphics. The distinction matters because only one of the two is text.

**Glyph table** — the mapping from a cell bitmap to the character it draws, built ahead of time from captured pages and shipped with the app. It is what makes it possible to render a page as text at all, since the upstream service publishes no characters. A bitmap the table has never seen is named from the page's own alt text instead; only where that cannot be aligned does the cell fall back to showing itself as a picture, so an unrecognised glyph costs a cell rather than a page.

**Mosaic** — a cell of block graphics rather than a letter: a small fixed arrangement of solid blocks, used for logos, rules and coloured banners. Mosaics carry no character, so they are drawn as shapes and are absent from any text the page yields.

**Double height** — a row drawn at twice its normal height, used for headlines. The stretch is vertical only: a double-height character still occupies one column, and it spans two grid rows, the lower of which is not a row of its own.

**Hotspot** — a clickable region over a frame that navigates to another page. The upstream service publishes their coordinates alongside the frame, which is the only part of a page's meaning it states outright rather than leaving to be read out of the picture.

## Reading gestures

**Edge gutter** — the strip along each side of the screen where the app declines to read a sideways drag as a page change, because the operating system arms its own back gesture there. The app cannot cancel that gesture, so the gutter is how the two are kept from competing: inside it the system wins by default, outside it the drag is the reader's.

**Snap** — the short animation that ends a sideways drag once the finger lifts: out to the neighbour when the gesture committed, back to centre when it did not. It is the only part of the gesture the app does not drive frame by frame.

A snap is interruptible. A finger landing while one is running takes it over — the sheet stays where it is and the page change the snap was carrying is abandoned — so nothing may treat a snap as certain to complete. The page change happens when the snap ends, not when the finger lifts.

**Sheet** — one page as a single movable surface. Reading gestures act on sheets rather than on pages: a sideways drag slides the current sheet aside and the neighbouring one in, separated by a black gutter so the two never read as one continuous surface. A page is what is being read; a sheet is the thing that moves while the reader changes which page that is.

**Pull** — a downward drag from the top of a page, which asks for that page again if it is released far enough. It is the other thing a reading gesture can be: the axis a drag locks to decides whether it changes the page or pulls, and once locked it cannot become the other. A pull is offered only where there is nothing to scroll back to, so it never competes with reading down a long page, and it is refused while a refresh is already running.

**Strip** — the band a pull reveals above the page, which says what the release will do and then what it is doing. It belongs to the gesture rather than to the fetch: asking for the page by any other means leaves it closed, because it is the thing the finger dragged into view.

## The bottom bar

**Page field** — the one control that both reports the page being read and takes the page being asked for. It reads as the current number until it is tapped, at which point it becomes the entry field and shows the digits typed so far instead. There were two controls for these two jobs and they said the same thing twice; merging them means the number you are reading is the thing you tap to change it. It goes quiet — dimmed rather than replaced — while a sideways drag is far enough along to change the page, because the number is about to be wrong but the drag can still be abandoned.

**Keypad** — the app's own three-digit pad, raised by the page field. It exists because a page number is three digits and nothing else: an operating-system keypad offers a keyboard's worth of answers to a question with only ten, and takes the screen on its own terms. There is no confirm key, because the third digit is the whole instruction.

**Dock** — the rail, the bar and the keypad as one band at the bottom of the shell. The keypad hangs below the screen's edge and the whole dock slides up to reveal it, so the two never have to agree about where they are; the page behind is neither resized nor scrolled while it is up.

## Flagged ambiguities

- "Refresh" and "revalidation" are both the app asking for a page it already holds. A **refresh** is the reader's request and a **revalidation** is the app's own; they are never used interchangeably, because almost everything the reader sees turns on which one is running.

- "Gutter" named two different things once sheets could move. The **edge gutter** is the dead strip at the screen's sides where the app declines the drag to the operating system; the gap between two sheets is just the gutter, and it is a matter of drawing rather than of gestures. Neither is the other, and the qualified name is the one to use when both are in play.
