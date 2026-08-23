import { keepFresh } from './serviceWorker'

/**
 * The one thing that cannot be seen from the app: an installed copy that never
 * asks whether a new version exists. happy-dom ships no service worker, so the
 * container is stood in for - what is pinned here is our own wiring, not the
 * browser's.
 */
const useServiceWorker = (controller: object | null) => {
  const registration = { update: vi.fn().mockResolvedValue(undefined) }
  const listeners: Record<string, Array<() => void>> = {}
  const container = {
    controller,
    register: vi.fn().mockResolvedValue(registration),
    addEventListener: (type: string, handler: () => void) => {
      ;(listeners[type] ??= []).push(handler)
    },
  }
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: container,
    configurable: true,
  })
  return {
    registration,
    container,
    fire: (type: string) => listeners[type]?.forEach((handler) => handler()),
  }
}

const becomeVisible = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

let reload: ReturnType<typeof vi.fn>

beforeEach(() => {
  reload = vi.fn()
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload },
    configurable: true,
  })
})

afterEach(() => {
  Reflect.deleteProperty(window.navigator, 'serviceWorker')
})

it('hämtar arbetaren utan att gå via HTTP-cachen', async () => {
  const { container } = useServiceWorker(null)

  keepFresh()

  expect(container.register).toHaveBeenCalledWith('./sw.js', {
    scope: './',
    updateViaCache: 'none',
  })
})

it('frågar efter en ny version när appen öppnas igen', async () => {
  const { registration } = useServiceWorker({})

  keepFresh()
  await Promise.resolve()
  becomeVisible('visible')

  expect(registration.update).toHaveBeenCalled()
})

it('frågar inte medan appen ligger i bakgrunden', async () => {
  const { registration } = useServiceWorker({})

  keepFresh()
  await Promise.resolve()
  becomeVisible('hidden')

  expect(registration.update).not.toHaveBeenCalled()
})

it('laddar om när en ny arbetare tagit över', async () => {
  const { fire } = useServiceWorker({})

  keepFresh()
  fire('controllerchange')

  expect(reload).toHaveBeenCalledTimes(1)
})

it('laddar om en enda gång', async () => {
  const { fire } = useServiceWorker({})

  keepFresh()
  fire('controllerchange')
  fire('controllerchange')

  expect(reload).toHaveBeenCalledTimes(1)
})

// The first install claims this page too; there is nothing stale to replace.
it('laddar inte om vid den allra första installationen', async () => {
  const { fire } = useServiceWorker(null)

  keepFresh()
  fire('controllerchange')

  expect(reload).not.toHaveBeenCalled()
})

it('kraschar inte i en webbläsare utan service workers', () => {
  Reflect.deleteProperty(window.navigator, 'serviceWorker')

  expect(() => keepFresh()).not.toThrow()
})
