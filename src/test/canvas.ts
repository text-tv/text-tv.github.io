import { decodeGif } from '../../scripts/gif.mjs'
import { CELL_HEIGHT, CELL_WIDTH } from '../teletext/types'

/**
 * A canvas for happy-dom, which ships none.
 *
 * `getContext('2d')` answers `null` there and `createImageBitmap` hands back an
 * object with no pixels behind it, so without this every frame would fail to
 * decode and the tests would only ever see the `<img>` fallback. The pixels are
 * real: the fixtures' GIFs are unpacked by `scripts/gif.mjs`, our own decoder,
 * so nothing has to be precomputed or kept in step with the fixtures.
 */
interface Frame {
  width: number
  height: number
  rgba: Uint8ClampedArray
}

/** Pixels are attached to the stand-in bitmap and follow it into `drawImage`. */
const frames = new WeakMap<object, Frame>()

/**
 * How the frames decoded from here on are damaged, if at all.
 *
 * Each value is a different refusal in `decodeFrame`: a bitmap that is not
 * 520x400, a cell of three colours, and a cell whose mask no glyph in the
 * table matches. `unknown-glyph` blanks a cell the page leaves empty, so the
 * row no longer lines up with its altText; `unseen-glyph` rewrites one the
 * page draws, so it does.
 */
type Damage = 'none' | 'size' | 'three-colour' | 'unknown-glyph' | 'unseen-glyph'

let damage: Damage = 'none'

/** Makes every frame decoded from here on unreadable, so the fallback shows. */
export const breakFrameDecoding = (): void => {
  damage = 'size'
}

/** Puts a third colour in one cell, which abandons the whole frame (R10). */
export const addThreeColourCell = (): void => {
  damage = 'three-colour'
}

/** Puts a mask the glyph table has never seen in one cell, for the R6 slice. */
export const addUnknownCell = (): void => {
  damage = 'unknown-glyph'
}

/**
 * Rewrites a cell the page draws with a mask no glyph matches, leaving the row
 * as occupied as it was. The altText still lines up, so the character it names
 * is what the cell has to render.
 */
export const addUnseenCell = (): void => {
  damage = 'unseen-glyph'
}

/** Decodes that have been started but not let through, in order. */
let held: (() => void)[] | null = null

/** Holds every decode from here on, so a test can navigate away mid-decode. */
export const holdFrameDecoding = (): void => {
  held = []
}

/** How many decodes are waiting to be let through. */
export const heldFrames = (): number => held?.length ?? 0

/** Lets the decode started most recently finish, leaving the earlier ones held. */
export const releaseNewestFrame = (): void => {
  held?.pop()?.()
}

/** Lets every held decode finish, and stops holding new ones. */
export const releaseFrameDecoding = (): void => {
  const waiting = held ?? []
  held = null
  for (const release of waiting) release()
}

export const resetCanvasStub = (): void => {
  damage = 'none'
  releaseFrameDecoding()
}

const MAGENTA = [255, 0, 255]
const CYAN = [0, 255, 255]

const paint = (rgba: Uint8ClampedArray, width: number, x: number, y: number, [r, g, b]: number[]) => {
  const offset = (y * width + x) * 4
  rgba[offset] = r
  rgba[offset + 1] = g
  rgba[offset + 2] = b
  rgba[offset + 3] = 255
}

/** Row y lights bits y + 1: the mask resolve.test.ts also treats as unholdable. */
const paintUnseenGlyph = (
  rgba: Uint8ClampedArray,
  width: number,
  originX: number,
  originY: number,
): void => {
  for (let y = 0; y < CELL_HEIGHT; y += 1) {
    for (let x = 0; x < CELL_WIDTH; x += 1) {
      const lit = ((y + 1) >> x) & 1
      paint(rgba, width, originX + x, originY + y, lit ? MAGENTA : [0, 0, 0])
    }
  }
}

/** The origin of the first cell the frame draws anything in, row-major. */
const firstDrawnCell = (
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): [number, number] => {
  const at = (x: number, y: number) => rgba.slice((y * width + x) * 4, (y * width + x) * 4 + 3).join()
  for (let originY = 0; originY + CELL_HEIGHT <= height; originY += CELL_HEIGHT) {
    for (let originX = 0; originX + CELL_WIDTH <= width; originX += CELL_WIDTH) {
      const first = at(originX, originY)
      for (let y = 0; y < CELL_HEIGHT; y += 1) {
        for (let x = 0; x < CELL_WIDTH; x += 1) {
          if (at(originX + x, originY + y) !== first) return [originX, originY]
        }
      }
    }
  }
  // A frame that draws nothing would leave the damage unapplied, and the test
  // asking for it would pass on an undamaged page without ever saying so.
  throw new Error('ingen ritad cell att skada')
}

/**
 * Repaints one 13x16 cell, black behind whichever damage the test asked for,
 * so the rest of the page still decodes as itself. Which cell depends on the
 * damage: the top-left one is blank on every page, which is what makes it
 * useful for a row that can no longer be aligned.
 */
const damageOneCell = (rgba: Uint8ClampedArray, width: number, height: number): void => {
  if (damage === 'unseen-glyph') {
    const [originX, originY] = firstDrawnCell(rgba, width, height)
    paintUnseenGlyph(rgba, width, originX, originY)
    return
  }
  if (damage !== 'three-colour' && damage !== 'unknown-glyph') return
  for (let y = 0; y < CELL_HEIGHT; y += 1) {
    for (let x = 0; x < CELL_WIDTH; x += 1) paint(rgba, width, x, y, [0, 0, 0])
  }
  if (damage === 'three-colour') {
    paint(rgba, width, 0, 0, MAGENTA)
    paint(rgba, width, 1, 0, CYAN)
    return
  }
  paintUnseenGlyph(rgba, width, 0, 0)
}

const toRgba = (gif: ReturnType<typeof decodeGif>): Uint8ClampedArray => {
  const rgba = new Uint8ClampedArray(gif.w * gif.h * 4)
  const palette = gif.pal ?? []
  for (let i = 0; i < gif.idx.length; i += 1) {
    const [r, g, b] = palette[gif.idx[i]] ?? [0, 0, 0]
    rgba[i * 4] = r
    rgba[i * 4 + 1] = g
    rgba[i * 4 + 2] = b
    rgba[i * 4 + 3] = 255
  }
  damageOneCell(rgba, gif.w, gif.h)
  return rgba
}

const fakeBitmap = async (source: Blob): Promise<ImageBitmap> => {
  if (held !== null) await new Promise<void>((resolve) => held?.push(resolve))
  const gif = decodeGif(Buffer.from(await source.arrayBuffer()))
  const bitmap = {
    // A wrong natural size is how the frame is broken: `decodeFrame` refuses
    // anything that is not 520x400, which is a failure path it really has.
    width: damage === 'size' ? 1 : gif.w,
    height: damage === 'size' ? 1 : gif.h,
    close: () => {},
  }
  frames.set(bitmap, { width: gif.w, height: gif.h, rgba: toRgba(gif) })
  return bitmap as unknown as ImageBitmap
}

/** Just enough 2D context for `decodeFrame`: draw a bitmap, read it back. */
const fakeContext = () => {
  let drawn: Frame | undefined
  return {
    drawImage: (source: object) => {
      drawn = frames.get(source)
    },
    getImageData: (x: number, y: number, width: number, height: number) => {
      if (drawn === undefined || x !== 0 || y !== 0) throw new Error('nothing drawn')
      const data = new Uint8ClampedArray(width * height * 4)
      for (let row = 0; row < Math.min(height, drawn.height); row += 1) {
        const from = row * drawn.width * 4
        data.set(drawn.rgba.subarray(from, from + Math.min(width, drawn.width) * 4), row * width * 4)
      }
      return { data, width, height, colorSpace: 'srgb' }
    },
  }
}

/**
 * Installs the stand-ins. Both canvases are patched: `decodeFrame` prefers
 * `OffscreenCanvas` and falls back to a detached `<canvas>`.
 */
export function installCanvasStub(): void {
  globalThis.createImageBitmap = ((source: Blob) => fakeBitmap(source)) as typeof createImageBitmap

  const getContext = function (this: unknown, kind: string) {
    return kind === '2d' ? fakeContext() : null
  }
  HTMLCanvasElement.prototype.getContext = getContext as HTMLCanvasElement['getContext']
  if (typeof OffscreenCanvas === 'function') {
    OffscreenCanvas.prototype.getContext = getContext as OffscreenCanvas['getContext']
  }
}
