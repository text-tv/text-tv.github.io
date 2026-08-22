import {
  type ErrorResult,
  type FetchResult,
  type NotBroadcastResult,
  type PageNumber,
  type PageResult,
  type SubPage,
} from './api.types'

/**
 * The only place that knows SVT's wire format. Everything above consumes
 * `FetchResult`.
 *
 * The API answers HTTP 200 for pages that are not broadcast, so success is
 * decided by the `status` field and never by the HTTP status code.
 */
const DEFAULT_BASE = 'https://www.svt.se/text-tv'

const apiBase = (): string => {
  const configured = import.meta.env?.VITE_SVT_API_BASE
  return (typeof configured === 'string' && configured) || DEFAULT_BASE
}

/** `prevPage` / `nextPage` are `""` when absent. */
const neighbour = (value: unknown): PageNumber | undefined =>
  typeof value === 'string' && /^\d{3}$/.test(value) ? value : undefined

const toSubPage = (raw: unknown): SubPage | undefined => {
  if (typeof raw !== 'object' || raw === null) return undefined
  const { subPageNumber, gifAsBase64, imageMap, altText } = raw as Record<string, unknown>
  if (typeof gifAsBase64 !== 'string' || gifAsBase64 === '') return undefined
  return {
    subPageNumber: typeof subPageNumber === 'string' ? subPageNumber : '',
    gifDataUrl: `data:image/gif;base64,${gifAsBase64}`,
    imageMap: typeof imageMap === 'string' ? imageMap : '',
    altText: typeof altText === 'string' ? altText : '',
  }
}

const publishedAt = (meta: unknown): number | undefined => {
  if (typeof meta !== 'object' || meta === null) return undefined
  const updated = (meta as Record<string, unknown>).updated
  if (typeof updated !== 'string') return undefined
  const parsed = Date.parse(updated)
  return Number.isFinite(parsed) ? parsed : undefined
}

const failure = (pageNumber: PageNumber, message: string): ErrorResult => ({
  kind: 'error',
  pageNumber,
  message,
})

export async function fetchPage(pageNumber: PageNumber): Promise<FetchResult> {
  let body: unknown
  try {
    const response = await fetch(`${apiBase()}/api/${pageNumber}`)
    if (!response.ok) return failure(pageNumber, `HTTP ${response.status}`)
    body = await response.json()
  } catch (cause) {
    return failure(pageNumber, cause instanceof Error ? cause.message : 'Nätverksfel')
  }

  if (typeof body !== 'object' || body === null) {
    return failure(pageNumber, 'Oväntat svar')
  }
  const { status, data } = body as Record<string, unknown>
  const payload = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  const prev = neighbour(payload.prevPage)
  const next = neighbour(payload.nextPage)

  if (status !== 'success') {
    return { kind: 'not-broadcast', pageNumber, prev, next } satisfies NotBroadcastResult
  }

  const subPages = Array.isArray(payload.subPages)
    ? payload.subPages.map(toSubPage).filter((page): page is SubPage => page !== undefined)
    : []
  if (subPages.length === 0) {
    return failure(pageNumber, 'Sidan saknar innehåll')
  }

  return {
    kind: 'page',
    pageNumber: typeof payload.pageNumber === 'string' ? payload.pageNumber : pageNumber,
    prev,
    next,
    subPages,
    updatedAt: publishedAt(payload.meta) ?? Date.now(),
  } satisfies PageResult
}
