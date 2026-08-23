import { decodeGif } from '../../scripts/gif.mjs'

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

/** Set while a test wants decoding to fail, for the R10 `<img>` fallback. */
let broken = false

/** Makes every frame decoded from here on unreadable, so the fallback shows. */
export const breakFrameDecoding = (): void => {
  broken = true
}

export const resetCanvasStub = (): void => {
  broken = false
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
  return rgba
}

const fakeBitmap = async (source: Blob): Promise<ImageBitmap> => {
  const gif = decodeGif(Buffer.from(await source.arrayBuffer()))
  const bitmap = {
    // A wrong natural size is how the frame is broken: `decodeFrame` refuses
    // anything that is not 520x400, which is a failure path it really has.
    width: broken ? 1 : gif.w,
    height: broken ? 1 : gif.h,
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
