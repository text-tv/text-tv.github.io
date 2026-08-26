import { useRef, useState } from 'react'
import type { PageNumber } from './api.types'
import { BottomBar } from './components/BottomBar'
import { FreshnessBar } from './components/FreshnessBar'
import { PageSheet } from './components/PageSheet'
import { QuickLinks } from './components/QuickLinks'
import { SWIPE_GUTTER_PX } from './swipe'
import { HOME_PAGE, useTextTv } from './useTextTv'
import { useSwipeNavigation, type PullState } from './useSwipeNavigation'
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

/** What the pull strip reads, in each of the states the gesture puts it in. */
const PULL_LABEL: Record<PullState, (page: PageNumber) => string> = {
  idle: () => '',
  below: () => 'DRA NER FÖR ATT UPPDATERA',
  armed: () => 'SLÄPP FÖR ATT UPPDATERA',
  fetching: (page) => `HÄMTAR ${page}…`,
}

export function App() {
  const {
    pageNumber,
    result,
    prev,
    next,
    contentFor,
    stale,
    refreshing,
    markId,
    updatedAt,
    navigate,
    reload,
    refresh,
  } = useTextTv()
  useVisualViewport()
  const content = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const pullTrack = useRef<HTMLDivElement>(null)
  const pullFill = useRef<HTMLSpanElement>(null)
  const [motion] = useState(motionAllowed)
  /** What the pull strip is saying; written at most twice per gesture. */
  const [pullState, setPullState] = useState<PullState>('idle')
  /**
   * The page the running refresh is for, captured when it started. The reader
   * may swipe sideways while the strip is parked, and the strip must go on
   * naming the page actually in flight rather than the one now on screen.
   */
  const [fetchingPage, setFetchingPage] = useState(pageNumber)
  /** True from the axis lock until the gesture and its snap are over. */
  const [dragging, setDragging] = useState(false)
  /** Which of SHEETS is the current page; a commit rotates it. */
  const [slot, setSlot] = useState(0)

  /**
   * Both entry points come through here, so the strip always names the page
   * the running fetch is for even after the reader swipes on to another one.
   */
  const startRefresh = () => {
    setFetchingPage(pageNumber)
    refresh()
  }

  useSwipeNavigation({
    container: content,
    track,
    pullTrack,
    pullFill,
    pageNumber,
    prev,
    next,
    motion,
    refreshing,
    navigate,
    onDragging: setDragging,
    onSwap: (direction) =>
      setSlot((slot) => (slot + (direction === 'next' ? 1 : SHEETS.length - 1)) % SHEETS.length),
    onPullState: setPullState,
    onRefresh: startRefresh,
  })

  /** The current page has nothing of its own yet: still on its way. */
  const pending = result === undefined
  /**
   * Whether an arrow with no target is unknown rather than absent. Only a
   * payload can say a neighbour does not exist, so a page that failed to load
   * names nothing either way - and an arrow the reader may be holding must not
   * turn `disabled` under them on a transport error.
   */
  const neighboursUnknown = pending || result.kind === 'error'

  const sheetAt = (offset: number) => SHEETS[(slot + offset + SHEETS.length) % SHEETS.length]
  // The current sheet comes first: source order is free to CSS, which places
  // the sheets by `left`, but not to the reader, whose page has to be the first
  // one the document offers.
  const sheets: { id: string; pageNumber: PageNumber; place: 'current' | 'prev' | 'next' }[] = [
    { id: sheetAt(0), pageNumber, place: 'current' },
  ]
  if (dragging) {
    if (prev) sheets.push({ id: sheetAt(-1), pageNumber: prev, place: 'prev' })
    if (next) sheets.push({ id: sheetAt(1), pageNumber: next, place: 'next' })
  }

  return (
    <div className="app">
      <FreshnessBar
        updatedAt={updatedAt}
        stale={stale}
        pending={pending}
        refreshing={refreshing}
      />
      <main className="content" ref={content}>
        {/*
          The vertical translate gets its own box. The swipe track's transform
          is written per frame and read back as a matrix, so sharing one element
          would mean composing and decomposing two axes on every move - and the
          two do coexist, whenever the reader swipes sideways while the strip is
          parked over a running fetch.
        */}
        <div className="pull-track" ref={pullTrack}>
          {/*
            The state lives on the strip, so both the label's colour and the
            fill's visibility read from one place. Hidden from assistive tech on
            purpose: the freshness bar's live region already announces the
            fetch, and two voices would say the same thing twice.
          */}
          <div className={`pull-strip pull-strip--${pullState}`} aria-hidden="true">
            {/*
              The same glyph as the bar's refresh button, turning: whichever way
              the reader asked, the thing that answers looks the same.
            */}
            {pullState === 'fetching' && <span className="pull-strip__spinner">↻</span>}
            <span className="pull-strip__label">{PULL_LABEL[pullState](fetchingPage)}</span>
            <span className="pull-strip__fill" ref={pullFill} />
          </div>
          <div
            className={dragging ? 'swipe-track swipe-track--dragging' : 'swipe-track'}
            ref={track}
            style={{ '--swipe-gutter': `${SWIPE_GUTTER_PX}px` } as React.CSSProperties}
          >
            {sheets.map((sheet) => (
              <PageSheet
                key={sheet.id}
                pageNumber={sheet.pageNumber}
                result={contentFor(sheet.pageNumber)}
                place={sheet.place}
                markId={markId}
                onNavigate={navigate}
                onRetry={reload}
              />
            ))}
          </div>
        </div>
      </main>
      <QuickLinks current={pageNumber} onNavigate={navigate} />
      <BottomBar
        pageNumber={pageNumber}
        prev={prev}
        next={next}
        pending={neighboursUnknown}
        refreshing={refreshing}
        onNavigate={navigate}
        onHome={() => navigate(HOME_PAGE)}
        onRefresh={startRefresh}
      />
    </div>
  )
}
