import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { FIXTURE_PAGES, rawFixture } from './fixtures'

/**
 * Fakes the network at the HTTP boundary rather than stubbing the API client,
 * so the client itself stays inside every test.
 */
const captured = new Map<string, unknown>(
  FIXTURE_PAGES.map((page) => [page as string, rawFixture(page)]),
)

/** Pages the current test should answer with a transport failure. */
const failing = new Set<string>()

/** Pages SVT has stopped broadcasting since they were captured. */
const offAir = new Map<string, { prev: string; next: string }>()

export const takeOffAir = (
  pageNumber: string,
  neighbours: { prev: string; next: string },
): void => {
  offAir.set(pageNumber, neighbours)
}

/**
 * Republishes a page with a new publication time, so a test can tell a
 * refetch apart from a repaint of what was already on screen.
 */
export const republish = (pageNumber: string, updated: string): void => {
  const body = captured.get(pageNumber) as { data: { meta?: { updated: string } } }
  captured.set(pageNumber, { ...body, data: { ...body.data, meta: { updated } } })
}

/** Serves a page the way SVT serves one it gives no publication time for. */
export const dropPublishTime = (pageNumber: string): void => {
  const body = captured.get(pageNumber) as { data: Record<string, unknown> }
  const { meta: _meta, ...data } = body.data
  captured.set(pageNumber, { ...body, data })
}

/**
 * Republishes a page carrying another page's frame, under its own sub-page
 * numbers - the way SVT rolls a live page over while the app is showing it.
 */
export const reframe = (pageNumber: string, source: string): void => {
  type Body = { data: { subPages: { gifAsBase64: string; altText: string }[] } }
  const body = captured.get(pageNumber) as Body
  const [frame] = (rawFixture(source) as Body).data.subPages
  captured.set(pageNumber, {
    ...body,
    data: {
      ...body.data,
      subPages: body.data.subPages.map((subPage, index) =>
        index === 0
          ? { ...subPage, gifAsBase64: frame.gifAsBase64, altText: frame.altText }
          : subPage,
      ),
    },
  })
}

/**
 * Republishes a page with one sub-page fewer, the way SVT does when a rolling
 * page sheds a screen. The count is what decides whether two payloads can be
 * compared at all.
 */
export const dropSubPage = (pageNumber: string): void => {
  type Body = { data: { subPages: unknown[] } }
  const body = captured.get(pageNumber) as Body
  captured.set(pageNumber, {
    ...body,
    data: { ...body.data, subPages: body.data.subPages.slice(0, -1) },
  })
}

/** Every page the app has asked the network for, oldest first. */
const requested: string[] = []

export const requestedPages = (): string[] => [...requested]

/** Responses the test is holding back, so a page can be caught mid-flight. */
const holding = new Map<string, () => void>()
const held = new Map<string, Promise<void>>()

export const holdPage = (pageNumber: string): void => {
  held.set(pageNumber, new Promise((resolve) => holding.set(pageNumber, resolve)))
}

export const releasePage = (pageNumber: string): void => {
  holding.get(pageNumber)?.()
  holding.delete(pageNumber)
  held.delete(pageNumber)
}

export const failNextFor = (pageNumber: string): void => {
  failing.add(pageNumber)
}
export const stopFailing = (pageNumber: string): void => {
  failing.delete(pageNumber)
}

export const server = setupServer(
  http.get('*/api/:page', async ({ params }) => {
    const page = String(params.page)
    requested.push(page)
    await held.get(page)
    if (failing.has(page)) return HttpResponse.error()
    const gone = offAir.get(page)
    if (gone) {
      // The real API answers HTTP 200 with status "fail".
      return HttpResponse.json({
        status: 'fail',
        data: { page, prevPage: gone.prev, nextPage: gone.next },
      })
    }
    const body = captured.get(page)
    if (body) return HttpResponse.json(body)
    // Unknown numbers behave like the real API: HTTP 200 carrying a failure.
    return HttpResponse.json({ status: 'fail', data: { page, prevPage: '', nextPage: '' } })
  }),
)

export const resetFakes = (): void => {
  for (const page of [...holding.keys()]) releasePage(page)
  requested.length = 0
  failing.clear()
  offAir.clear()
  for (const page of FIXTURE_PAGES) captured.set(page, rawFixture(page))
}
