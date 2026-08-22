import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPage } from './api'
import type { FetchResult, PageNumber } from './api.types'
import { readLastVisited, readPage, writeLastVisited, writePage } from './pageStore'

export const HOME_PAGE = '100'
/** Come back within the hour and you are where you left off. */
export const RESTORE_WINDOW_MS = 60 * 60 * 1000
/** Returning to the foreground refetches content older than this. */
export const REVALIDATE_AFTER_MS = 60 * 1000

const isPageNumber = (value: string): boolean => /^\d{3}$/.test(value)

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

export interface TextTvState {
  pageNumber: PageNumber
  result: FetchResult | undefined
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
  const [result, setResult] = useState<FetchResult | undefined>()
  const [stale, setStale] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number | undefined>()
  const [reloadCount, setReloadCount] = useState(0)
  /** Guards against a slow response for a page the reader has already left. */
  const wanted = useRef(pageNumber)

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
    wanted.current = pageNumber
    let cancelled = false

    // Paint the last-seen copy first; a restored page is never left unfetched.
    const cached = readPage(pageNumber)
    if (cached) {
      setResult(cached.result)
      setUpdatedAt(cached.result.updatedAt)
      setStale(true)
    } else {
      setResult(undefined)
      setStale(false)
      setUpdatedAt(undefined)
    }

    void fetchPage(pageNumber).then((fresh) => {
      if (cancelled || wanted.current !== pageNumber) return
      // A failed fetch must not throw away a good cached copy.
      if (fresh.kind !== 'page' && cached) {
        setStale(false)
        return
      }
      setResult(fresh)
      setStale(false)
      if (fresh.kind === 'page') {
        const now = Date.now()
        setUpdatedAt(fresh.updatedAt)
        writePage(pageNumber, fresh, now)
      } else {
        setUpdatedAt(undefined)
      }
    })

    return () => {
      cancelled = true
    }
  }, [pageNumber, reloadCount])

  const reload = useCallback(() => setReloadCount((count) => count + 1), [])

  // No polling. Refetch only when the reader comes back to a stale page.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      const fetchedAt = readPage(pageNumber)?.fetchedAt ?? 0
      if (Date.now() - fetchedAt >= REVALIDATE_AFTER_MS) reload()
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

  return { pageNumber, result, stale, updatedAt, navigate, reload }
}
