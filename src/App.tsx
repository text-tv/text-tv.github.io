import { useRef, useState } from 'react'
import type { PageNumber } from './api.types'
import { BottomBar } from './components/BottomBar'
import { FreshnessBar } from './components/FreshnessBar'
import { PageSheet } from './components/PageSheet'
import { QuickLinks } from './components/QuickLinks'
import { SWIPE_GUTTER_PX } from './swipe'
import { HOME_PAGE, useTextTv } from './useTextTv'
import { useSwipeNavigation } from './useSwipeNavigation'
import { useVisualViewport } from './useVisualViewport'

/**
 * Three identities the sheets rotate through. A commit hands the current slot
 * to the neighbour's own already-decoded subtree rather than re-rendering one
 * centre slot with a new page's props, which would leave the reader looking at
 * the page they just swiped away - `SubPageFrame` holds its rows until the next
 * decode settles. Rotating rather than keying by the page number keeps an
 * ordinary navigation - a hotspot tap, a bar arrow - on the sheet it is already
 * on, which is what that same holding depends on.
 */
const SHEETS = ['a', 'b', 'c']

/**
 * Read once: no requirement asks for a mid-session flip to take effect, and
 * subscribing would re-render the whole tree to learn nothing.
 */
const motionAllowed = () => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function App() {
  const { pageNumber, result, stale, updatedAt, navigate, reload } = useTextTv()
  useVisualViewport()
  const content = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const [motion] = useState(motionAllowed)
  /** True from the axis lock until the gesture and its snap are over. */
  const [dragging, setDragging] = useState(false)
  /** Which of SHEETS is the current page; a commit rotates it. */
  const [slot, setSlot] = useState(0)
  // Both a page and a not-broadcast result carry the neighbours the arrows use.
  const neighbours = result?.kind === 'error' ? undefined : result

  useSwipeNavigation({
    container: content,
    track,
    pageNumber,
    prev: neighbours?.prev,
    next: neighbours?.next,
    motion,
    navigate,
    onDragging: setDragging,
    onSwap: (direction) =>
      setSlot((slot) => (slot + (direction === 'next' ? 1 : SHEETS.length - 1)) % SHEETS.length),
  })

  const sheetAt = (offset: number) => SHEETS[(slot + offset + SHEETS.length) % SHEETS.length]
  // The current sheet comes first: source order is free to CSS, which places
  // the sheets by `left`, but not to the reader, whose page has to be the first
  // one the document offers.
  const sheets: { id: string; pageNumber: PageNumber; place: 'current' | 'prev' | 'next' }[] = [
    { id: sheetAt(0), pageNumber, place: 'current' },
  ]
  if (dragging) {
    const { prev, next } = neighbours ?? {}
    if (prev) sheets.push({ id: sheetAt(-1), pageNumber: prev, place: 'prev' })
    if (next) sheets.push({ id: sheetAt(1), pageNumber: next, place: 'next' })
  }

  return (
    <div className="app">
      <FreshnessBar updatedAt={updatedAt} stale={stale} pending={result === undefined} />
      <main className="content" ref={content}>
        <div
          className="swipe-track"
          ref={track}
          style={{ '--swipe-gutter': `${SWIPE_GUTTER_PX}px` } as React.CSSProperties}
        >
          {sheets.map((sheet) => (
            <PageSheet
              key={sheet.id}
              pageNumber={sheet.pageNumber}
              result={sheet.place === 'current' ? result : undefined}
              place={sheet.place}
              onNavigate={navigate}
              onRetry={reload}
            />
          ))}
        </div>
      </main>
      <QuickLinks current={pageNumber} onNavigate={navigate} />
      <BottomBar
        pageNumber={pageNumber}
        prev={neighbours?.prev}
        next={neighbours?.next}
        onNavigate={navigate}
        onHome={() => navigate(HOME_PAGE)}
      />
    </div>
  )
}
