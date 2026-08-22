import type { PageNumber, PageResult } from './api.types'

/**
 * Last-seen pages, so a visited page paints instantly and still renders with
 * no network. Frames are base64 GIFs and a many-sub-page page is large, so a
 * full store evicts the oldest entries rather than failing the write.
 */
const PAGE_PREFIX = 'texttv:page:'
const LAST_VISITED_KEY = 'texttv:last'

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

export function readPage(pageNumber: PageNumber): StoredPage | undefined {
  const store = storage()
  if (!store) return undefined
  const stored = parse<StoredPage>(store.getItem(PAGE_PREFIX + pageNumber))
  return stored?.result?.kind === 'page' ? stored : undefined
}

/** Evicts least-recently-fetched pages until the write fits, then gives up. */
export function writePage(pageNumber: PageNumber, result: PageResult, fetchedAt: number): void {
  const store = storage()
  if (!store) return
  const entry = JSON.stringify({ result, fetchedAt } satisfies StoredPage)

  for (;;) {
    try {
      store.setItem(PAGE_PREFIX + pageNumber, entry)
      return
    } catch {
      const oldest = oldestPageKey(store, PAGE_PREFIX + pageNumber)
      if (!oldest) return
      store.removeItem(oldest)
    }
  }
}

function oldestPageKey(store: Storage, exclude: string): string | undefined {
  let oldestKey: string | undefined
  let oldestAt = Infinity
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index)
    if (!key?.startsWith(PAGE_PREFIX) || key === exclude) continue
    const at = parse<StoredPage>(store.getItem(key))?.fetchedAt ?? 0
    if (at < oldestAt) {
      oldestAt = at
      oldestKey = key
    }
  }
  return oldestKey
}

export function readLastVisited(): LastVisited | undefined {
  const store = storage()
  if (!store) return undefined
  const stored = parse<LastVisited>(store.getItem(LAST_VISITED_KEY))
  return /^\d{3}$/.test(stored?.pageNumber ?? '') ? stored : undefined
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
