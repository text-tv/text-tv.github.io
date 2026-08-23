import { decodeFrame, resetDecodeCache } from './decode'
import { installCanvasStub } from '../test/canvas'

/**
 * Distinct frames, decoded only for their bookkeeping: every one of them is
 * refused for its size, which is an answer worth caching, so the cache fills
 * without 65 real GIFs having to exist.
 */
const CACHE_LIMIT = 64

const frame = (index: number) => `data:image/gif;base64,${btoa(`frame-${index}`)}`

let decodes: string[] = []

beforeEach(() => {
  resetDecodeCache()
  decodes = []
  // The stub in src/test/canvas.ts decodes real GIFs; here the point is only
  // how often a frame reaches the decoder at all.
  globalThis.createImageBitmap = (async (source: Blob) => {
    decodes.push(await source.text())
    return { width: 1, height: 1, close: () => {} } as unknown as ImageBitmap
  }) as typeof createImageBitmap
})

// The stand-in is global, so the rest of the suite gets its real one back.
afterEach(installCanvasStub)

describe('decodeFrame', () => {
  it('avkodar samma ruta en gång och svarar ur cachen sedan', async () => {
    await decodeFrame(frame(0))
    await decodeFrame(frame(0))

    expect(decodes).toHaveLength(1)
  })

  it('delar en pågående avkodning mellan samtidiga anrop', async () => {
    await Promise.all([decodeFrame(frame(0)), decodeFrame(frame(0))])

    expect(decodes).toHaveLength(1)
  })

  it('kastar ut den äldsta rutan när cachen är full och avkodar den på nytt', async () => {
    for (let index = 0; index <= CACHE_LIMIT; index += 1) await decodeFrame(frame(index))
    expect(decodes).toHaveLength(CACHE_LIMIT + 1)

    // The oldest was evicted by the one past the cap; the newest is still there.
    await decodeFrame(frame(0))
    expect(decodes).toHaveLength(CACHE_LIMIT + 2)
    await decodeFrame(frame(CACHE_LIMIT))
    expect(decodes).toHaveLength(CACHE_LIMIT + 2)
  })

  it('räknar en träff som färsk, så den inte kastas ut först', async () => {
    for (let index = 0; index < CACHE_LIMIT; index += 1) await decodeFrame(frame(index))
    // Touching the oldest moves it to the back of the eviction order, so the
    // next insert evicts the one after it instead.
    await decodeFrame(frame(0))
    await decodeFrame(frame(CACHE_LIMIT))

    decodes = []
    await decodeFrame(frame(0))
    expect(decodes).toHaveLength(0)
    await decodeFrame(frame(1))
    expect(decodes).toHaveLength(1)
  })
})
