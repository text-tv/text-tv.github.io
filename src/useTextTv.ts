import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPage } from './api'
import { isPageNumber, type FetchResult, type PageNumber } from './api.types'
import {
  fetchedAt,
  readLastVisited,
  readPage,
  removePage,
  writeLastVisited,
  writePage,
} from './pageStore'

export const HOME_PAGE = '100'
/** Come back within the hour and you are where you left off. */
export const RESTORE_WINDOW_MS = 60 * 60 * 1000
/**
 * Returning to the foreground refetches content older than this. Coming back
 * to the app is the moment the reader wants what is on air now, so this stays
 * short - shorter than the window below, which governs moving around inside a
 * session the reader never left.
 */
export const REVALIDATE_AFTER_MS = 60 * 1000
/**
 * How old a copy already in hand may be and still be shown on arrival without
 * a fetch behind it. Generous on purpose: swiping between pages is reading,
 * not refreshing, and a page that reloads under the reader as they land on it
 * is the cost this window exists to avoid. The freshness bar carries SVT's
 * publication time, so age is disclosed rather than hidden by the wait.
 */
export const ARRIVAL_WINDOW_MS = 60 * 60 * 1000
/**
 * How much of the window above a stored copy must have left for a prefetch to
 * hand it over unfetched.
 *
 * A neighbour is resolved when the reader lands on the page beside it, and
 * swiped to whenever they are ready - a page later, or several minutes of
 * reading later. A copy already close to ageing out would pass the prefetch
 * and then fail the same test on arrival, refetching under the reader with the
 * page already on screen. That is the repaint this margin exists to avoid.
 */
const PREFETCH_MARGIN_MS = 5 * 60 * 1000
/**
 * The shortest time a refresh is allowed to *look* like it is running.
 *
 * A page already in the store, or one SVT answers for immediately, can settle
 * inside a frame or two. Everything that reports a reader-initiated refresh -
 * the cyan status, the dimmed refresh button, the parked pull strip - then
 * appears and vanishes too fast to register, and the refresh reads as though
 * nothing happened at all. Reported by a reader on exactly that.
 *
 * This never delays the request or the content: the fetch leaves immediately
 * and the new page paints as soon as it lands. Only the flag saying a refresh
 * is in flight is held, and only when the answer beat it.
 */
export const MIN_REFRESH_VISIBLE_MS = 500

const hashPage = (): PageNumber | undefined => {
  const raw = window.location.hash.replace(/^#/, '')
  return isPageNumber(raw) ? raw : undefined
}

/** The hash wins; else the last-visited page inside the hour; else 100. */
function initialPage(now: number): PageNumber {
  const fromHash = hashPage()
  if (fromHash) return fromHash
  const last = readLastVisited()
  if (last && now - last.at < RESTORE_WINDOW_MS) return last.pageNumber
  return HOME_PAGE
}

/** What the app knows about each page it is holding, keyed by page number. */
type Known = Record<PageNumber, FetchResult | undefined>

/** Both a page and a not-broadcast result carry the neighbours; an error does not. */
const neighboursOf = (result: FetchResult | undefined) =>
  result === undefined || result.kind === 'error' ? undefined : result

export interface TextTvState {
  pageNumber: PageNumber
  result: FetchResult | undefined
  /**
   * The pages either side, held through a load rather than cleared with the
   * result. Landing on one of them rotates the pair onto the page arrived at,
   * so the side travelled from stays navigable and the side ahead is
   * `undefined` until the new page's own payload names it.
   */
  prev: PageNumber | undefined
  next: PageNumber | undefined
  /**
   * What is known of any page inside the prefetch window. `undefined`
   * is "not yet known", which is the sheet's loading state. Keyed by page
   * number rather than by place, so the sheet a commit hands the current slot
   * to carries its own content on the very first render.
   */
  contentFor: (pageNumber: PageNumber) => FetchResult | undefined
  /** True while showing a cached copy that a fetch is still revalidating. */
  stale: boolean
  /**
   * True while a fetch the reader asked for is in flight. A background
   * revalidation leaves it false: it drives the signals the reader is standing
   * over - the cyan status, the dimmed refresh button, the parked pull strip -
   * and spending them on a fetch nobody asked for would make them mean nothing.
   */
  refreshing: boolean
  /**
   * Bumped once per reader-initiated payload that can be compared with the one
   * it replaced. A counter rather than a flag: the payload lands, and the
   * decode that could compare it resolves later and possibly more than once, so
   * each frame compares this against what it has already marked.
   */
  markId: number
  /** When the displayed content was published or last fetched. */
  updatedAt: number | undefined
  navigate: (pageNumber: PageNumber) => void
  reload: () => void
  /** Reload, and say it was the reader who asked. */
  refresh: () => void
}

/**
 * Owns the current page, its load outcome and its freshness.
 *
 * Navigation goes through the URL hash so every move pushes a history entry
 * and the system back gesture means "the previous page I looked at".
 */
export function useTextTv(): TextTvState {
  const [pageNumber, setPageNumber] = useState<PageNumber>(() => initialPage(Date.now()))
  const [known, setKnown] = useState<Known>({})
  const [stale, setStale] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [markId, setMarkId] = useState(0)
  const [updatedAt, setUpdatedAt] = useState<number | undefined>()
  const [reloadCount, setReloadCount] = useState(0)
  /**
   * Which load the reader asked for: the `reloadCount` it bumped to and the
   * page it was standing on. Compared, never consumed - StrictMode runs the
   * load effect, tears it down and runs it again, and a flag the first pass
   * spent would leave the second one, whose result is the one kept, thinking
   * nobody asked. The page is carried too: navigating away does not change
   * `reloadCount`, so the count alone would name the next page's load as well.
   */
  const refreshWanted = useRef<{ count: number; page: PageNumber } | undefined>(undefined)
  /** When the reader asked, so the flag can be held its minimum below. */
  const askedAt = useRef(0)
  const holding = useRef<number | undefined>(undefined)
  /** The page a fetch is currently in flight for, if any. */
  const inFlight = useRef<PageNumber | undefined>(undefined)
  /**
   * The page the session's first load ran for, held until that load resolves
   * uncancelled. Compared, never consumed: StrictMode's mount-cleanup-mount
   * cycle discards the first invocation's result, and a flag spent by then
   * would leave a restored page painted from the store with nothing behind it.
   */
  const firstLoad = useRef<PageNumber | undefined>(pageNumber)
  /** The `reloadCount` the load effect last fetched for. Compared, likewise. */
  const fetchedForReload = useRef(-1)
  /**
   * Pages a prefetch is in flight for. Its own set: `inFlight` holds a single
   * page number and belongs to the revalidation guard below.
   */
  const prefetching = useRef(new Set<PageNumber>())
  /** A prefetch that lands after the app is gone must not touch the store. */
  const live = useRef(true)
  /**
   * When each held page's payload actually arrived, kept beside `known` rather
   * than read back from the store. The store is allowed to refuse a write - a
   * prefetch never evicts, and there may be no storage at all - and a page the
   * app is holding is no less fresh for not having been written down.
   */
  const arrived = useRef<Record<PageNumber, number>>({})
  const latest = useRef<Known>(known)
  latest.current = known
  /** What the current sheet last drew, for the carry-over below. */
  const carried = useRef<FetchResult | undefined>(undefined)
  /**
   * The last neighbours anyone told us about, and the page they belong to.
   * Kept across the loading window, so the arrows do not blink off between two
   * pages - but rotated onto the page arrived at, so they never describe the
   * page being left.
   */
  const held = useRef<{ of?: PageNumber; prev?: PageNumber; next?: PageNumber }>({})

  const found = known[pageNumber]
  /**
   * The hash changes a render before the effect that starts the load runs, so
   * the new page number arrives with nothing of its own to draw. A page the
   * reader jumped to - a link, a shortcut - keeps the outgoing page on screen
   * across that one render rather than blinking through "Hämtar…". A page they
   * can swipe to does not: it has a sheet of its own, and painting the page
   * being left into it is exactly what KTD12's rotation avoids.
   */
  const named = held.current
  // `of` is included so a pair already rotated onto this page still reads as
  // swiped to, rather than relying on what the previous render left behind.
  // The rotation's own guard below is what makes the two StrictMode passes
  // agree; this term keeps the reading honest if that ordering ever changes.
  const swipedTo =
    pageNumber === named.of || pageNumber === named.prev || pageNumber === named.next
  const result = found ?? (pageNumber in known || swipedTo ? undefined : carried.current)
  carried.current = result

  // Arriving on a page the pair names makes the pair about to be wrong: the
  // page behind the reader is the page they came from. Rotate before the load
  // lands, so swiping back through the loading window returns there rather
  // than to the outgoing page's other neighbour. `of` counts as named so the
  // two StrictMode passes agree; rotating is then idempotent. Landing on a
  // page the pair does not name leaves it alone - the carry-over is still
  // painting the page it describes.
  if (named.of !== pageNumber && swipedTo) {
    held.current =
      pageNumber === named.next
        ? { of: pageNumber, prev: named.of, next: undefined }
        : { of: pageNumber, prev: undefined, next: named.of }
  }

  const own = neighboursOf(found)
  if (own) held.current = { of: pageNumber, prev: own.prev, next: own.next }

  // Re-armed on mount, not only cleared on unmount: StrictMode mounts twice,
  // and a ref left false after the first teardown would silence every
  // prefetch for the rest of the session.
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  useEffect(() => {
    const onHashChange = () => setPageNumber(hashPage() ?? HOME_PAGE)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Keep the hash in step with the page, without pushing a duplicate entry.
  useEffect(() => {
    if (hashPage() !== pageNumber) window.location.hash = pageNumber
    writeLastVisited(pageNumber, Date.now())
  }, [pageNumber])

  /**
   * Lets the refresh flag down, but never sooner than the minimum above.
   *
   * Cancellation does not come through here: a reader who has left the page is
   * not waiting on its refresh, and holding the flag would colour the status of
   * the page they went to.
   */
  const settleRefresh = useCallback(() => {
    const remaining = MIN_REFRESH_VISIBLE_MS - (Date.now() - askedAt.current)
    if (remaining <= 0) {
      setRefreshing(false)
      return
    }
    window.clearTimeout(holding.current)
    holding.current = window.setTimeout(() => setRefreshing(false), remaining)
  }, [])

  // A hold outliving the app would set state on a hook nobody is rendering.
  useEffect(() => () => window.clearTimeout(holding.current), [])

  useEffect(() => {
    // Set by the cleanup below, so a slow response for a page the reader has
    // already left is dropped instead of overwriting the current one.
    let cancelled = false
    // A first load the reader swiped away from never resolves uncancelled, so
    // the flag below would name that page for the rest of the session and keep
    // refetching it. Leaving the page is what retires it.
    if (firstLoad.current !== undefined && firstLoad.current !== pageNumber) {
      firstLoad.current = undefined
    }
    // Whether this run is the one the reader asked for. Read once here rather
    // than in each branch below, so the cleanup and the response agree.
    const readerAsked =
      refreshWanted.current?.count === reloadCount && refreshWanted.current.page === pageNumber
    // Retired by leaving the page, not by the fetch succeeding - the same rule
    // `firstLoad` above follows. A note left standing would match again on a
    // later return to that page at the same count, and mark a load nobody
    // asked for. The cleanup of the run being replaced has already read it.
    if (refreshWanted.current && refreshWanted.current.page !== pageNumber) {
      refreshWanted.current = undefined
    }
    inFlight.current = pageNumber

    // Paint the last-seen copy first; a restored page is never left unfetched.
    const cached = readPage(pageNumber)
    if (cached) setKnown((known) => ({ ...known, [pageNumber]: cached.result }))
    // A page a prefetch already resolved is painted too - it is the same
    // content the store would have handed back. A stale error is not: a retry
    // starts from the loading state rather than from the failure.
    const prefetched = latest.current[pageNumber]
    const painted = cached?.result ?? (prefetched?.kind === 'error' ? undefined : prefetched)
    if (painted) {
      setUpdatedAt(painted.kind === 'page' ? painted.updatedAt : undefined)
      setStale(true)
    } else {
      // A key with nothing behind it: the load has started and the sheet has
      // nothing of its own yet, which is what ends the carry-over above.
      setKnown((known) => ({ ...known, [pageNumber]: undefined }))
      setStale(false)
      setUpdatedAt(undefined)
    }

    // What the store handed over may be new enough to keep as it is. Skipping
    // is what makes a committed swipe onto a prefetched page cost nothing.
    const keep =
      firstLoad.current !== pageNumber &&
      reloadCount <= fetchedForReload.current &&
      // A fresh index entry can outlive the copy it describes - `writePage`
      // drops a page it cannot store. Nothing on screen means fetch, always.
      painted !== undefined &&
      // Whichever record is newer. The store answers 0 for a page it refused
      // to keep, and for every page when there is no storage to read, which
      // would otherwise refetch a page the app fetched moments ago and is
      // already painting.
      Date.now() - Math.max(fetchedAt(pageNumber), arrived.current[pageNumber] ?? 0) <
        ARRIVAL_WINDOW_MS
    if (keep) {
      // The effect claimed `inFlight` above; leaving it claimed would make the
      // revalidation guard below short-circuit for as long as the reader stays.
      inFlight.current = undefined
      // The timestamp the paint above set already stands; only the promise of
      // a fetch behind it has to be taken back.
      setStale(false)
      return
    }
    fetchedForReload.current = reloadCount

    void fetchPage(pageNumber).then((fresh) => {
      if (inFlight.current === pageNumber) inFlight.current = undefined
      if (cancelled) return
      if (firstLoad.current === pageNumber) firstLoad.current = undefined
      // A transport failure must not throw away a good cached copy - that is
      // what makes the app work underground. A confirmed not-broadcast is
      // different: it is SVT's answer about the page, so it replaces the
      // cached copy and the copy is forgotten rather than shown again later.
      if (fresh.kind === 'error' && painted) {
        setStale(false)
        if (readerAsked) settleRefresh()
        return
      }
      arrived.current[pageNumber] = Date.now()
      setKnown((known) => ({ ...known, [pageNumber]: fresh }))
      setStale(false)
      if (readerAsked) {
        settleRefresh()
        // Only a payload that can be compared licenses the marks. A page whose
        // sub-page count changed is not comparable: the frames no longer pair
        // up, and marking by position would invent differences.
        if (
          fresh.kind === 'page' &&
          painted?.kind === 'page' &&
          painted.subPages.length === fresh.subPages.length
        ) {
          setMarkId((id) => id + 1)
        }
      }
      if (fresh.kind === 'page') {
        const now = Date.now()
        setUpdatedAt(fresh.updatedAt)
        writePage(pageNumber, fresh, now)
      } else {
        setUpdatedAt(undefined)
        if (fresh.kind === 'not-broadcast') removePage(pageNumber)
      }
    })

    return () => {
      cancelled = true
      // Guarded, because `reloadCount` is a dependency: the very act of asking
      // for a refresh tears this effect down and rebuilds it. The run being
      // cleaned up here is the one *before* the refresh, whose `readerAsked` is
      // false, so the flag the reader just raised survives. A page change
      // during the refresh does reach this with it true, and clears it.
      if (readerAsked) {
        // Straight down, not held: see settleRefresh.
        window.clearTimeout(holding.current)
        setRefreshing(false)
      }
      if (inFlight.current === pageNumber) inFlight.current = undefined
    }
  }, [pageNumber, reloadCount, settleRefresh])

  /**
   * Resolves one neighbour: from the store when it holds a copy good for the
   * arrival still ahead of it, and from the network otherwise. Never touches
   * the current page's own state, so a gesture never waits on it.
   */
  const prefetch = useCallback((target: PageNumber) => {
    if (latest.current[target] || prefetching.current.has(target)) return
    const cached = readPage(target)
    if (cached) {
      setKnown((known) => ({ ...known, [target]: cached.result }))
      // Painted either way; kept as the final word only while it is new enough
      // to survive the arrival test as well. A copy from an earlier session is
      // typically hours old, and stopping here would leave every page the
      // reader swipes into refetching the moment it lands.
      if (Date.now() - cached.fetchedAt < ARRIVAL_WINDOW_MS - PREFETCH_MARGIN_MS) return
    }
    prefetching.current.add(target)
    void fetchPage(target).then((fresh) => {
      prefetching.current.delete(target)
      if (!live.current) return
      // A failed prefetch is dropped rather than kept. The sheet stays on
      // "Hämtar…", and committing onto the page takes the ordinary load path,
      // where the reader gets the page's own error and a retry.
      if (fresh.kind === 'error') return
      const now = Date.now()
      arrived.current[target] = now
      setKnown((known) => ({ ...known, [target]: fresh }))
      if (fresh.kind === 'page') writePage(target, fresh, now, 'prefetch')
    })
  }, [])

  const settled = found !== undefined
  const ownPrev = own?.prev
  const ownNext = own?.next
  /**
   * The page two forward, named by the page one forward rather than by the
   * current page - the only thing that can name it. Undefined until that
   * neighbour's own payload lands, which is when the effect below asks for it.
   * Nothing reads a neighbour of this one, which is what bounds the chain.
   */
  const ahead = ownNext ? neighboursOf(known[ownNext])?.next : undefined

  // Once the page has landed, resolve what lies either side of it, so the
  // sheet beside the finger has content before the finger gets there. A
  // neighbour already known is skipped, which is why a commit costs exactly
  // one further page - the one in the direction of travel.
  useEffect(() => {
    if (!settled) return
    if (ownPrev) prefetch(ownPrev)
    if (ownNext) prefetch(ownNext)
    if (ahead) prefetch(ahead)
    // Two pages forward and one back. Reading runs forward, so a second swipe
    // that way is the one worth being ready for; the page behind the reader is
    // the one they just left and is already in hand.
    setKnown((known) => {
      const reach = [pageNumber, ownPrev, ownNext, ahead]
      const entries = Object.entries(known).filter(([page]) => reach.includes(page))
      return entries.length === Object.keys(known).length ? known : Object.fromEntries(entries)
    })
  }, [pageNumber, ownPrev, ownNext, ahead, settled, prefetch])

  const reload = useCallback(() => setReloadCount((count) => count + 1), [])

  /**
   * The same reload, with a note saying the reader asked for it.
   *
   * The note is written from inside the updater because that is the only place
   * that knows which count this reload is: `reloadCount` is state, and reading
   * it here would pin the callback to a render.
   */
  const refresh = useCallback(() => {
    window.clearTimeout(holding.current)
    askedAt.current = Date.now()
    setRefreshing(true)
    setReloadCount((count) => {
      refreshWanted.current = { count: count + 1, page: pageNumber }
      return count + 1
    })
  }, [pageNumber])

  // No polling. Refetch only when the reader comes back to a stale page.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      // Toggling away and back during the first fetch would otherwise cancel
      // and restart it, indefinitely under repeated toggling.
      if (inFlight.current === pageNumber) return
      if (Date.now() - fetchedAt(pageNumber) >= REVALIDATE_AFTER_MS) reload()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [pageNumber, reload])

  const navigate = useCallback((next: PageNumber) => {
    if (!isPageNumber(next)) return
    // Assigning the hash pushes a history entry; the listener applies it.
    if (hashPage() === next) return
    window.location.hash = next
  }, [])

  const contentFor = useCallback(
    (page: PageNumber) => (page === pageNumber ? result : known[page]),
    [known, pageNumber, result],
  )

  return {
    pageNumber,
    result,
    prev: held.current.prev,
    next: held.current.next,
    contentFor,
    stale,
    refreshing,
    markId,
    updatedAt,
    navigate,
    reload,
    refresh,
  }
}
