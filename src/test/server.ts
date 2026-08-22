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

export const failNextFor = (pageNumber: string): void => {
  failing.add(pageNumber)
}
export const stopFailing = (pageNumber: string): void => {
  failing.delete(pageNumber)
}

export const server = setupServer(
  http.get('*/api/:page', ({ params }) => {
    const page = String(params.page)
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
  failing.clear()
  offAir.clear()
  for (const page of FIXTURE_PAGES) captured.set(page, rawFixture(page))
}
