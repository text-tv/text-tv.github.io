/** The teletext grid the 520x400 frame is made of. */
export const GRID_COLS = 40
export const GRID_ROWS = 25
export const CELL_WIDTH = 13
export const CELL_HEIGHT = 16

/** One teletext character cell: 13x16 px, at most two colours. */
export interface Cell {
  /** `#rrggbb`. */
  bg: string
  fg: string
  /** 16 rows of 13 bits, bit x set where the pixel is foreground. `null` when blank. */
  mask: Uint16Array | null
}

/**
 * What a cell's mask draws, from the generated glyph table.
 *
 * Block graphics carry no character: `bits` holds the six sextants, top-left
 * first and bottom-right last, so they can be drawn as blocks instead.
 */
export type Glyph =
  | { kind: 'char'; char: string; doubleHeight: boolean }
  | { kind: 'mosaic'; bits: number }

/** The table's key for a normal-height cell: the 16 mask rows, in order. */
export const maskKey = (mask: Uint16Array): string => mask.join(',')

/**
 * The table's key for a double-height cell, built from both of its halves.
 *
 * Neither half identifies the character alone: 's' and 'c' share a top half,
 * 'a' and 'å' a bottom one. A blank half contributes nothing but its separator.
 */
export const doubleHeightKey = (top: Uint16Array | null, bottom: Uint16Array | null): string =>
  `${top === null ? '' : maskKey(top)}|${bottom === null ? '' : maskKey(bottom)}`
