import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { installCanvasStub, resetCanvasStub } from './canvas'
import { resetFakes, server } from './server'

installCanvasStub()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  resetFakes()
  resetCanvasStub()
  window.localStorage.clear()
  window.location.hash = ''
})
afterAll(() => server.close())
