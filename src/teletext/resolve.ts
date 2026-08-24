import { alignAltText } from './align.js'
import { GLYPHS } from './glyphs.generated'
import { doubleHeightKey, isStretched, maskKey, unstretchedKey } from './mask.js'
import { GRID_COLS, GRID_ROWS, type Cell, type Glyph } from './types'

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

/** A mask the table has never seen and the alt text could not name either; U4 cuts its box out of the GIF instead (R6). */
export interface UnknownRun extends RunBase {
  kind: 'unknown'
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

/**
 * Whether a grid row could be half of a double-height line.
 *
 * The two halves do not share an occupancy pattern — a stretched glyph sits at
 * a vertical offset, so ascenders land in one row and descenders in the other
 * — hence the test is on the scanlines, not on which cells are filled.
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

/**
 * Which of a display row's columns are drawn; a double-height row unions its
 * two halves, since one line of text is set across both of them.
 */
const occupancyOf = (cells: Cell[], row: number, doubleHeight: boolean): boolean[] =>
  Array.from(
    { length: GRID_COLS },
    (_, col) =>
      cells[row * GRID_COLS + col].mask !== null ||
      (doubleHeight && cells[(row + 1) * GRID_COLS + col].mask !== null),
  )

/** One column of a display row, resolved against the table but not yet drawn. */
interface Column {
  /** `undefined` when the table has no entry, or when the cell is blank. */
  glyph: Glyph | undefined
  fg: string
  bg: string
  blank: boolean
}

const columnsOf = (cells: Cell[], row: number, doubleHeight: boolean): Column[] => {
  const columns: Column[] = []

  for (let col = 0; col < GRID_COLS; col += 1) {
    const top = cells[row * GRID_COLS + col]
    const bottom = doubleHeight ? cells[(row + 1) * GRID_COLS + col] : null

    if (top.mask === null && (bottom === null || bottom.mask === null)) {
      columns.push({ glyph: undefined, fg: top.bg, bg: top.bg, blank: true })
      continue
    }

    // Either half of a double-height cell may be blank, and a blank cell has no
    // foreground of its own, so the colours come from the half that is drawn.
    const source = top.mask !== null ? top : (bottom as Cell)
    // A double-height cell is looked up twice: first as the pair it is, then as
    // the normal-height character it is a stretched copy of. The second lookup
    // is what spares the table a second entry per character - a character seen
    // at either size is drawn at both, and only one that has never been
    // captured at all falls through to its slice of the GIF.
    const glyph =
      bottom === null
        ? GLYPHS[maskKey(top.mask as Uint16Array)]
        : (GLYPHS[doubleHeightKey(top.mask, bottom.mask)] ??
          GLYPHS[unstretchedKey(top.mask, bottom.mask)])

    columns.push({ glyph, fg: source.fg, bg: source.bg, blank: false })
  }

  return columns
}

/**
 * Whether an aligned line agrees with the characters the table already knows.
 *
 * Occupancy is a weak key, and matching on it alone can seat a line on the
 * wrong row: a line whose own row carries a mosaic can never match that row -
 * altText spaces mosaics out - but it may be the single best fit for a row
 * further down, which it then claims, pushing that row's real line out as
 * out-of-order. The result would be a row of confidently wrong letters, which
 * reads as correct and is worse than the blur it replaced.
 *
 * The cells the table does know are the check. Where the pixels already say
 * which character a cell draws, the line has to say the same, or it is not
 * this row's line and none of it can be trusted.
 */
const agrees = (columns: Column[], line: string): boolean => {
  for (let col = 0; col < GRID_COLS; col += 1) {
    const { glyph } = columns[col]
    if (glyph !== undefined && glyph.kind === 'char' && glyph.char !== line[col]) return false
  }
  return true
}

const resolveRow = (columns: Column[], line: string | null): Run[] => {
  const builder = new RowBuilder()
  const named = line !== null && agrees(columns, line) ? line : null

  for (let col = 0; col < GRID_COLS; col += 1) {
    const { glyph, fg, bg, blank } = columns[col]

    if (blank) {
      builder.space(col, bg)
    } else if (glyph === undefined) {
      // The table only knows the characters the captured pages happened to
      // use, so an unseen one - an accent, a punctuation mark - would cost a
      // cell to the GIF for good. The page carries its own text, though, and
      // a line that survived the check above names what the table never learnt.
      const labelled = named === null ? ' ' : named[col]
      if (labelled === ' ') builder.own({ kind: 'unknown', col, width: 1, fg, bg })
      else builder.char(col, labelled, fg, bg)
    } else if (glyph.kind === 'mosaic') {
      builder.own({ kind: 'mosaic', col, width: 1, fg, bg, bits: glyph.bits })
    } else {
      builder.char(col, glyph.char, fg, bg)
    }
  }

  return builder.done()
}

/**
 * Turns a decoded frame's 1000 cells into the rows and runs that draw it.
 *
 * `altText` is the sub-page's own text. It is not what the page is built from
 * - the pixels are - only what names a cell the glyph table has no entry for.
 */
export function resolvePage(cells: Cell[], altText = ''): DisplayRow[] {
  const bounds: { row: number; doubleHeight: boolean; occupancy: boolean[] }[] = []

  for (let row = 0; row < GRID_ROWS; row += 1) {
    const doubleHeight =
      row + 1 < GRID_ROWS && isStretchedRow(cells, row) && isStretchedRow(cells, row + 1)
    bounds.push({ row, doubleHeight, occupancy: occupancyOf(cells, row, doubleHeight) })
    if (doubleHeight) row += 1
  }

  // Only the rows that draw something are offered to the alignment, exactly as
  // the build-time table is: a blank row would fit every blank line and make
  // every one of them ambiguous.
  const drawn = bounds.filter((bound) => bound.occupancy.some(Boolean))
  const { lines } = alignAltText(
    drawn.map((bound) => bound.occupancy),
    altText,
    GRID_COLS,
  )
  const labels = new Map(drawn.map((bound, index) => [bound.row, lines[index]]))

  return bounds.map(({ row, doubleHeight }) => ({
    row,
    doubleHeight,
    runs: resolveRow(columnsOf(cells, row, doubleHeight), labels.get(row) ?? null),
  }))
}
