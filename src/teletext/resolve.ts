import { GLYPHS } from './glyphs.generated'
import { CELL_HEIGHT, GRID_COLS, GRID_ROWS, doubleHeightKey, maskKey, type Cell } from './types'

/**
 * One stretch of a display row that renders as a single element.
 *
 * `col` and `width` are in grid columns, so U4 can place a run without
 * replaying the grouping.
 */
interface RunBase {
  col: number
  width: number
  fg: string
  bg: string
}

/** Characters that share both colours, joined into one string. */
export interface TextRun extends RunBase {
  kind: 'text'
  text: string
}

/** Block graphics, drawn as six sextants rather than as a character. */
export interface MosaicRun extends RunBase {
  kind: 'mosaic'
  bits: number
}

/** A mask the table has never seen; the cells travel along for R6's per-cell fallback. */
export interface UnknownRun extends RunBase {
  kind: 'unknown'
  /** The grid cells this run covers: one, or a double-height row's two halves. */
  cells: Cell[]
}

export type Run = TextRun | MosaicRun | UnknownRun

/**
 * A row as it is drawn. `row` is the grid row it starts on — a double-height
 * row also covers `row + 1`, which is never emitted on its own (R7).
 */
export interface DisplayRow {
  row: number
  doubleHeight: boolean
  runs: Run[]
}

/** A double-height glyph is drawn at 2x, so every scanline is duplicated. */
const isStretched = (mask: Uint16Array): boolean => {
  for (let y = 0; y < CELL_HEIGHT; y += 2) if (mask[y] !== mask[y + 1]) return false
  return true
}

/**
 * Whether a grid row could be half of a double-height line.
 *
 * The two halves do not share an occupancy pattern — a stretched glyph sits at
 * a vertical offset, so ascenders land in one row and descenders in the other
 * — hence the test is on the scanlines, not on which cells are filled. This
 * mirrors `scripts/glyphs.mjs`; the two must agree or the keys miss.
 */
const isStretchedRow = (cells: Cell[], row: number): boolean => {
  let filled = false
  for (let col = 0; col < GRID_COLS; col += 1) {
    const { mask } = cells[row * GRID_COLS + col]
    if (mask === null) continue
    if (!isStretched(mask)) return false
    filled = true
  }
  return filled
}

/** Accumulates one row's runs, merging adjacent cells that can share an element. */
class RowBuilder {
  readonly runs: Run[] = []
  private text: TextRun | null = null
  /** A run of nothing but spaces has no foreground yet, so it adopts the first one it meets. */
  private blankOnly = true

  private flush(): void {
    if (this.text !== null) this.runs.push(this.text)
    this.text = null
  }

  /** A space carries no foreground, so only the background has to match to join. */
  space(col: number, bg: string): void {
    if (this.text !== null && this.text.bg === bg) {
      this.text.text += ' '
      this.text.width += 1
      return
    }
    this.flush()
    this.text = { kind: 'text', col, width: 1, fg: bg, bg, text: ' ' }
    this.blankOnly = true
  }

  char(col: number, char: string, fg: string, bg: string): void {
    if (this.text !== null && this.text.bg === bg && (this.blankOnly || this.text.fg === fg)) {
      this.text.fg = fg
      this.text.text += char
      this.text.width += 1
      this.blankOnly = false
      return
    }
    this.flush()
    this.text = { kind: 'text', col, width: 1, fg, bg, text: char }
    this.blankOnly = false
  }

  /** Mosaics and unknowns never merge: each keeps its own cell. */
  own(run: Run): void {
    this.flush()
    this.runs.push(run)
  }

  done(): Run[] {
    this.flush()
    return this.runs
  }
}

const resolveRow = (cells: Cell[], row: number, doubleHeight: boolean): Run[] => {
  const builder = new RowBuilder()

  for (let col = 0; col < GRID_COLS; col += 1) {
    const top = cells[row * GRID_COLS + col]
    const bottom = doubleHeight ? cells[(row + 1) * GRID_COLS + col] : null

    if (top.mask === null && (bottom === null || bottom.mask === null)) {
      builder.space(col, top.bg)
      continue
    }

    // Either half of a double-height cell may be blank, and a blank cell has no
    // foreground of its own, so the colours come from the half that is drawn.
    const source = top.mask !== null ? top : (bottom as Cell)
    const key =
      bottom === null ? maskKey(top.mask as Uint16Array) : doubleHeightKey(top.mask, bottom.mask)
    const glyph = GLYPHS[key]
    const { fg, bg } = source

    if (glyph === undefined) {
      builder.own({
        kind: 'unknown',
        col,
        width: 1,
        fg,
        bg,
        cells: bottom === null ? [top] : [top, bottom],
      })
    } else if (glyph.kind === 'mosaic') {
      builder.own({ kind: 'mosaic', col, width: 1, fg, bg, bits: glyph.bits })
    } else {
      builder.char(col, glyph.char, fg, bg)
    }
  }

  return builder.done()
}

/** Turns a decoded frame's 1000 cells into the rows and runs that draw it. */
export function resolvePage(cells: Cell[]): DisplayRow[] {
  const rows: DisplayRow[] = []

  for (let row = 0; row < GRID_ROWS; row += 1) {
    const doubleHeight =
      row + 1 < GRID_ROWS && isStretchedRow(cells, row) && isStretchedRow(cells, row + 1)
    rows.push({ row, doubleHeight, runs: resolveRow(cells, row, doubleHeight) })
    if (doubleHeight) row += 1
  }

  return rows
}
