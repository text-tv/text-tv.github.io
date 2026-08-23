import { FRAME_HEIGHT, FRAME_WIDTH } from '../api.types'
import { CELL_HEIGHT, CELL_WIDTH, GRID_COLS, GRID_ROWS, type Cell } from './types'

/**
 * Turns a frame GIF into its character grid.
 *
 * Decoding is per sub-page and the same frame is re-rendered on every stacking
 * change, so results are cached on the data URL and concurrent decodes of one
 * URL share a single pass.
 */
const decoded = new Map<string, Cell[] | null>()
const inFlight = new Map<string, Promise<Cell[] | null>>()

/**
 * The keys are whole base64 frames, so the cache is bounded rather than left to
 * grow across an installed session. Room for the widest page's 14 sub-pages
 * several times over, which covers a run of back-and-forth navigation.
 */
const CACHE_LIMIT = 64

const remember = (dataUrl: string, cells: Cell[] | null): void => {
  decoded.set(dataUrl, cells)
  while (decoded.size > CACHE_LIMIT) decoded.delete(decoded.keys().next().value as string)
}

/**
 * Empties both caches, so a test never inherits another's decode. Exported for
 * the tests alone; the app decodes into a cache that lives as long as it does.
 */
export const resetDecodeCache = (): void => {
  decoded.clear()
  inFlight.clear()
}

/** The RGBA pixel at `offset`, packed into one 0xRRGGBBAA number. */
const pack = (pixels: Uint8ClampedArray, offset: number): number =>
  ((pixels[offset] << 24) |
    (pixels[offset + 1] << 16) |
    (pixels[offset + 2] << 8) |
    pixels[offset + 3]) >>>
  0

/** Packed 0xRRGGBBAA back to CSS `#rrggbb`; teletext frames are fully opaque. */
const hex = (colour: number): string => `#${(colour >>> 8).toString(16).padStart(6, '0')}`

/**
 * Builds the blob straight from the base64 payload rather than fetching the
 * data URL: a `fetch` would route an image decode through the service worker,
 * and the tests' msw handler rejects unhandled requests outright.
 */
const toBlob = (dataUrl: string): Blob => {
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: 'image/gif' })
}

const context2d = (): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null => {
  if (typeof OffscreenCanvas === 'function') {
    return new OffscreenCanvas(FRAME_WIDTH, FRAME_HEIGHT).getContext('2d')
  }
  const canvas = document.createElement('canvas')
  canvas.width = FRAME_WIDTH
  canvas.height = FRAME_HEIGHT
  return canvas.getContext('2d')
}

/**
 * Splits the pixels into cells of at most two colours.
 *
 * A third colour in any cell means this frame is not the character grid this
 * model assumes, so the whole frame is abandoned to the `<img>` fallback rather
 * than rendered wrong.
 */
const toCells = (pixels: Uint8ClampedArray): Cell[] | null => {
  const cells: Cell[] = []
  // Both passes read the same 208 colours, so they are packed once per cell
  // into a buffer that every cell reuses.
  const cell = new Uint32Array(CELL_WIDTH * CELL_HEIGHT)

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const originX = col * CELL_WIDTH
      const originY = row * CELL_HEIGHT

      let first = -1
      let firstCount = 0
      let second = -1
      let secondCount = 0

      for (let y = 0; y < CELL_HEIGHT; y += 1) {
        let offset = ((originY + y) * FRAME_WIDTH + originX) * 4
        for (let x = 0; x < CELL_WIDTH; x += 1, offset += 4) {
          const colour = pack(pixels, offset)
          cell[y * CELL_WIDTH + x] = colour
          if (first === -1 || colour === first) {
            first = colour
            firstCount += 1
          } else if (second === -1 || colour === second) {
            second = colour
            secondCount += 1
          } else {
            return null
          }
        }
      }

      const background = secondCount > firstCount ? second : first
      const foreground = background === first ? second : first
      const bg = hex(background)

      if (foreground === -1) {
        cells.push({ bg, fg: bg, mask: null })
        continue
      }

      const mask = new Uint16Array(CELL_HEIGHT)
      for (let y = 0; y < CELL_HEIGHT; y += 1) {
        let bits = 0
        for (let x = 0; x < CELL_WIDTH; x += 1) {
          if (cell[y * CELL_WIDTH + x] !== background) bits |= 1 << x
        }
        mask[y] = bits
      }

      cells.push({
        bg,
        fg: hex(foreground),
        mask,
      })
    }
  }

  return cells
}

/**
 * `null` is a refusal that would repeat for this frame - the wrong size, or a
 * cell of more than two colours - and is worth caching. `undefined` is a
 * failure that may not repeat, such as a rejected bitmap or a context the
 * browser withheld from a backgrounded tab, and is left uncached so the next
 * render tries again.
 */
const decode = async (dataUrl: string): Promise<Cell[] | null | undefined> => {
  try {
    const bitmap = await createImageBitmap(toBlob(dataUrl))
    if (bitmap.width !== FRAME_WIDTH || bitmap.height !== FRAME_HEIGHT) {
      bitmap.close?.()
      return null
    }

    const context = context2d()
    if (context === null) return undefined
    context.drawImage(bitmap, 0, 0)
    bitmap.close?.()

    return toCells(context.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT).data)
  } catch {
    return undefined
  }
}

/** Resolves to the frame's 1000 cells, row-major, or `null` when it cannot be read as a grid. */
export async function decodeFrame(dataUrl: string): Promise<Cell[] | null> {
  const cached = decoded.get(dataUrl)
  if (cached !== undefined) {
    // Re-inserting moves the key to the back of the eviction order.
    decoded.delete(dataUrl)
    decoded.set(dataUrl, cached)
    return cached
  }

  const pending = inFlight.get(dataUrl)
  if (pending !== undefined) return pending

  const run = decode(dataUrl).then((cells) => {
    inFlight.delete(dataUrl)
    if (cells === undefined) return null
    remember(dataUrl, cells)
    return cells
  })
  inFlight.set(dataUrl, run)
  return run
}
