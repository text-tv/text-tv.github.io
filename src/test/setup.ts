import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { resetDecodeCache } from '../teletext/decode'
import { installCanvasStub, resetCanvasStub } from './canvas'
import { resetFakes, server } from './server'

installCanvasStub()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  resetFakes()
  resetCanvasStub()
  // Module-level and otherwise shared: one test's cached decode would decide
  // the next one's branch.
  resetDecodeCache()
  window.localStorage.clear()
  window.location.hash = ''
})
afterAll(() => server.close())
