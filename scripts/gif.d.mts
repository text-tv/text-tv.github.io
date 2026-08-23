/** Types for the dev-only GIF decoder, so the tests' canvas stub can import it. */
export declare function decodeGif(buffer: Buffer): {
  w: number
  h: number
  pal: [number, number, number][] | null
  idx: Uint8Array
}
