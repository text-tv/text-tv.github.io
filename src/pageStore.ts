import { isPageNumber, type PageNumber, type PageResult } from './api.types'

/**
 * Last-seen pages, so a visited page paints instantly and still renders with
 * no network. Frames are base64 GIFs and a many-sub-page page is large, so a
 * full store evicts the oldest entries rather than failing the write.
 */
const PAGE_PREFIX = 'texttv:page:'
const LAST_VISITED_KEY = 'texttv:last'
/**
 * page number -> when it was last fetched. Kept apart from the pages
 * themselves so answering "how old is this?" does not mean parsing a
 * megabyte of base64 GIF. It may drift from the pages if a write fails; both
 * directions of drift resolve to a refetch, which is the safe answer.
 */
const FETCHED_KEY = 'texttv:fetched'
/**
 * How many stored pages one write may evict before giving up. A page too
 * large to ever fit would otherwise empty the whole cache one entry at a time
 * and still fail, costing the reader every page they could read offline.
 */
const MAX_EVICTIONS = 3

export interface StoredPage {
  result: PageResult
  fetchedAt: number
}

export interface LastVisited {
  pageNumber: PageNumber
  at: number
}

const storage = (): Storage | undefined => {
  try {
    const probe = window.localStorage
    probe.getItem(LAST_VISITED_KEY)
    return probe
  } catch {
    return undefined
  }
}

const parse = <T>(raw: string | null): T | undefined => {
  if (raw === null) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

type FetchedIndex = Record<PageNumber, number>

const readFetchedIndex = (store: Storage): FetchedIndex =>
  parse<FetchedIndex>(store.getItem(FETCHED_KEY)) ?? {}

const writeFetchedIndex = (store: Storage, index: FetchedIndex): void => {
  try {
    store.setItem(FETCHED_KEY, JSON.stringify(index))
  } catch {
    // The index is an optimisation; losing it only costs an extra fetch.
  }
}

/** When the stored copy of a page was fetched, or 0 if there is none. */
export function fetchedAt(pageNumber: PageNumber): number {
  const store = storage()
  return store ? (readFetchedIndex(store)[pageNumber] ?? 0) : 0
}

export function readPage(pageNumber: PageNumber): StoredPage | undefined {
  const store = storage()
  if (!store) return undefined
  const stored = parse<StoredPage>(store.getItem(PAGE_PREFIX + pageNumber))
  return stored?.result?.kind === 'page' ? stored : undefined
}

/**
 * `visited` is a page the reader asked for; `prefetch` is one the app guessed
 * at. Only the first may evict.
 */
export type WriteMode = 'visited' | 'prefetch'

/** Evicts least-recently-fetched pages until the write fits, then gives up. */
export function writePage(
  pageNumber: PageNumber,
  result: PageResult,
  at: number,
  mode: WriteMode = 'visited',
): void {
  const store = storage()
  if (!store) return
  const entry = JSON.stringify({ result, fetchedAt: at } satisfies StoredPage)
  const index = readFetchedIndex(store)

  for (let evicted = 0; ; evicted += 1) {
    try {
      store.setItem(PAGE_PREFIX + pageNumber, entry)
      index[pageNumber] = at
      writeFetchedIndex(store, index)
      return
    } catch {
      // A prefetched page is a convenience; a stored one is the offline story.
      // Never trade the second for the first, and leave any older copy alone.
      if (mode === 'prefetch') return
      const oldest = evicted < MAX_EVICTIONS ? oldestPage(index, pageNumber) : undefined
      if (!oldest) {
        // Out of room, or out of patience. Keep what is already cached and go
        // without this page rather than trading the cache for nothing.
        store.removeItem(PAGE_PREFIX + pageNumber)
        writeFetchedIndex(store, index)
        return
      }
      store.removeItem(PAGE_PREFIX + oldest)
      delete index[oldest]
    }
  }
}

/** Least recently fetched, read from the index so no GIF is parsed. */
function oldestPage(index: FetchedIndex, exclude: PageNumber): PageNumber | undefined {
  let oldestKey: PageNumber | undefined
  let oldestAt = Infinity
  for (const [page, at] of Object.entries(index)) {
    if (page === exclude || at >= oldestAt) continue
    oldestAt = at
    oldestKey = page
  }
  return oldestKey
}

/** Forgets a stored page, so nothing repaints it later. */
export function removePage(pageNumber: PageNumber): void {
  const store = storage()
  if (!store) return
  store.removeItem(PAGE_PREFIX + pageNumber)
  const index = readFetchedIndex(store)
  delete index[pageNumber]
  writeFetchedIndex(store, index)
}

export function readLastVisited(): LastVisited | undefined {
  const store = storage()
  if (!store) return undefined
  const stored = parse<LastVisited>(store.getItem(LAST_VISITED_KEY))
  return isPageNumber(stored?.pageNumber ?? '') ? stored : undefined
}

export function writeLastVisited(pageNumber: PageNumber, at: number): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(LAST_VISITED_KEY, JSON.stringify({ pageNumber, at } satisfies LastVisited))
  } catch {
    // A full store must not break navigation; the hour rule just resets to 100.
  }
}
