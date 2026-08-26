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
/** Returning to the foreground refetches content older than this. */
export const REVALIDATE_AFTER_MS = 60 * 1000

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
   * The pages either side. Held through a load rather than cleared with the
   * result, so both directions stay navigable while the next page arrives.
   */
  prev: PageNumber | undefined
  next: PageNumber | undefined
  /**
   * What is known of any page the reader can reach in one swipe. `undefined`
   * is "not yet known", which is the sheet's loading state. Keyed by page
   * number rather than by place, so the sheet a commit hands the current slot
   * to carries its own content on the very first render.
   */
  contentFor: (pageNumber: PageNumber) => FetchResult | undefined
  /** True while showing a cached copy that a fetch is still revalidating. */
  stale: boolean
  /** When the displayed content was published or last fetched. */
  updatedAt: number | undefined
  navigate: (pageNumber: PageNumber) => void
  reload: () => void
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
  const [updatedAt, setUpdatedAt] = useState<number | undefined>()
  const [reloadCount, setReloadCount] = useState(0)
  /** The page a fetch is currently in flight for, if any. */
  const inFlight = useRef<PageNumber | undefined>(undefined)
  /**
   * Pages a prefetch is in flight for. Its own set: `inFlight` holds a single
   * page number and belongs to the revalidation guard below.
   */
  const prefetching = useRef(new Set<PageNumber>())
  /** A prefetch that lands after the app is gone must not touch the store. */
  const live = useRef(true)
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

  useEffect(() => {
    // Set by the cleanup below, so a slow response for a page the reader has
    // already left is dropped instead of overwriting the current one.
    let cancelled = false
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

    void fetchPage(pageNumber).then((fresh) => {
      if (inFlight.current === pageNumber) inFlight.current = undefined
      if (cancelled) return
      // A transport failure must not throw away a good cached copy - that is
      // what makes the app work underground. A confirmed not-broadcast is
      // different: it is SVT's answer about the page, so it replaces the
      // cached copy and the copy is forgotten rather than shown again later.
      if (fresh.kind === 'error' && painted) {
        setStale(false)
        return
      }
      setKnown((known) => ({ ...known, [pageNumber]: fresh }))
      setStale(false)
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
      if (inFlight.current === pageNumber) inFlight.current = undefined
    }
  }, [pageNumber, reloadCount])

  /**
   * Resolves one neighbour, from the store when it is there and from the
   * network otherwise. Never touches the current page's own state, so a
   * gesture never waits on it.
   */
  const prefetch = useCallback((target: PageNumber) => {
    if (latest.current[target] || prefetching.current.has(target)) return
    const cached = readPage(target)
    if (cached) {
      setKnown((known) => ({ ...known, [target]: cached.result }))
      return
    }
    prefetching.current.add(target)
    void fetchPage(target).then((fresh) => {
      prefetching.current.delete(target)
      if (!live.current) return
      // A failed prefetch is dropped rather than kept. The sheet stays on
      // "Hämtar…", and committing onto the page takes the ordinary load path,
      // where the reader gets the page's own error and a retry.
      if (fresh.kind === 'error') return
      setKnown((known) => ({ ...known, [target]: fresh }))
      if (fresh.kind === 'page') writePage(target, fresh, Date.now(), 'prefetch')
    })
  }, [])

  const settled = found !== undefined
  const ownPrev = own?.prev
  const ownNext = own?.next

  // Once the page has landed, resolve what lies either side of it, so the
  // sheet beside the finger has content before the finger gets there. A
  // neighbour already known is skipped, which is why a commit costs exactly
  // one further page - the one in the direction of travel.
  useEffect(() => {
    if (!settled) return
    if (ownPrev) prefetch(ownPrev)
    if (ownNext) prefetch(ownNext)
    // A page further away than one swipe is not worth a megabyte of memory.
    setKnown((known) => {
      const reach = [pageNumber, ownPrev, ownNext]
      const entries = Object.entries(known).filter(([page]) => reach.includes(page))
      return entries.length === Object.keys(known).length ? known : Object.fromEntries(entries)
    })
  }, [pageNumber, ownPrev, ownNext, settled, prefetch])

  const reload = useCallback(() => setReloadCount((count) => count + 1), [])

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
    updatedAt,
    navigate,
    reload,
  }
}
