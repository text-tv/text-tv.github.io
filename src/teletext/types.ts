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
