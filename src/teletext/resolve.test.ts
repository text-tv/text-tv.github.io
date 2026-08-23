import { resolvePage, type Run } from './resolve'
import { GRID_COLS, GRID_ROWS, type Cell } from './types'

const BLACK = '#000000'
const WHITE = '#ffffff'
const YELLOW = '#ffff00'

/** Masks copied from the generated table, so the lookups are the real ones. */
const A = [0, 0, 0, 0, 0, 1008, 2032, 1536, 2032, 2040, 1560, 2040, 2032, 0, 0, 0]
const N = [0, 0, 0, 0, 0, 1020, 2044, 1548, 1548, 1548, 1548, 1548, 1548, 0, 0, 0]
const A_TOP = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1008, 1008, 2032, 2032, 1536, 1536]
const A_BOTTOM = [2032, 2032, 2040, 2040, 1560, 1560, 2040, 2040, 2032, 2032, 0, 0, 0, 0, 0, 0]
/* 'x' is in the table at normal height only, so it exercises the second lookup. */
const X_TOP = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1548, 1548, 1820, 1820, 952, 952]
const X_BOTTOM = [496, 496, 496, 496, 952, 952, 1820, 1820, 1548, 1548, 0, 0, 0, 0, 0, 0]
const MOSAIC = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 63, 63, 63, 63, 63]
const UNSEEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]

const blank = (bg = BLACK): Cell => ({ bg, fg: bg, mask: null })

const grid = (): Cell[] => Array.from({ length: GRID_COLS * GRID_ROWS }, () => blank())

const put = (cells: Cell[], row: number, col: number, cell: Cell): void => {
  cells[row * GRID_COLS + col] = cell
}

const glyph = (mask: number[], fg = WHITE, bg = BLACK): Cell => ({
  bg,
  fg,
  mask: Uint16Array.from(mask),
})

/**
 * The runs of one display row, found by the grid row it starts on, with the
 * blank tail of the row trimmed away so a test only states the cells it set.
 */
const runsOf = (cells: Cell[], row: number): { doubleHeight: boolean; runs: Run[] } => {
  const found = resolvePage(cells).find((display) => display.row === row)
  if (found === undefined) throw new Error(`ingen rad ${row}`)
  const runs = found.runs.map((run) =>
    run.kind === 'text' ? { ...run, text: run.text.trimEnd(), width: run.text.trimEnd().length } : run,
  )
  return { ...found, runs: runs.filter((run) => !(run.kind === 'text' && run.width === 0)) }
}

describe('resolvePage', () => {
  it('slår ihop grannceller med samma färger till en körning', () => {
    const cells = grid()
    put(cells, 3, 0, glyph(A))
    put(cells, 3, 1, glyph(N))
    put(cells, 3, 2, glyph(A))

    const [run] = runsOf(cells, 3).runs
    expect(run).toMatchObject({ kind: 'text', col: 0, width: 3, fg: WHITE, bg: BLACK })
    expect(run).toHaveProperty('text', 'ana')
  })

  it('bryter körningen vid färgbyte', () => {
    const cells = grid()
    put(cells, 3, 0, glyph(A))
    put(cells, 3, 1, glyph(N, YELLOW))

    const { runs } = runsOf(cells, 3)
    expect(runs.slice(0, 2)).toMatchObject([
      { kind: 'text', col: 0, width: 1, fg: WHITE, text: 'a' },
      { kind: 'text', col: 1, width: 1, fg: YELLOW, text: 'n' },
    ])
  })

  it('gör en tom cell till ett mellanslag', () => {
    const cells = grid()
    put(cells, 3, 0, glyph(A))
    put(cells, 3, 2, glyph(N))

    const [run] = runsOf(cells, 3).runs
    expect(run).toMatchObject({ kind: 'text', col: 0, fg: WHITE, bg: BLACK })
    expect(run).toHaveProperty('text', 'a n')
  })

  it('bryter körningen vid bakgrundsbyte även på en tom cell', () => {
    const cells = grid()
    put(cells, 3, 0, glyph(A))
    put(cells, 3, 1, blank(YELLOW))

    // The trimming helper would eat an all-space run, so read the row as it is.
    const row = resolvePage(cells).find((display) => display.row === 3)
    expect(row?.runs.slice(0, 2)).toMatchObject([
      { kind: 'text', col: 0, width: 1, bg: BLACK, text: 'a' },
      { kind: 'text', col: 1, width: 1, bg: YELLOW, text: ' ' },
    ])
  })

  it('läser ett dubbelhöjdspar som en rad och äter raden under', () => {
    const cells = grid()
    put(cells, 3, 0, glyph(A_TOP))
    put(cells, 4, 0, glyph(A_BOTTOM))

    const rows = resolvePage(cells)
    expect(rows).toHaveLength(GRID_ROWS - 1)
    expect(rows.map((row) => row.row)).not.toContain(4)

    const row = runsOf(cells, 3)
    expect(row.doubleHeight).toBe(true)
    expect(row.runs[0]).toMatchObject({ kind: 'text', col: 0, width: 1, text: 'a' })
  })

  it('känner igen ett dubbelhöjdstecken som bara finns i normalhöjd i tabellen', () => {
    const cells = grid()
    put(cells, 3, 0, glyph(X_TOP))
    put(cells, 4, 0, glyph(X_BOTTOM))

    const row = runsOf(cells, 3)
    expect(row.doubleHeight).toBe(true)
    expect(row.runs[0]).toMatchObject({ kind: 'text', col: 0, width: 1, text: 'x' })
  })

  it('låter en mosaik bli en egen körning', () => {
    const cells = grid()
    put(cells, 3, 0, glyph(A))
    put(cells, 3, 1, glyph(MOSAIC))
    put(cells, 3, 2, glyph(N))

    const { runs } = runsOf(cells, 3)
    expect(runs.slice(0, 3)).toMatchObject([
      { kind: 'text', col: 0, width: 1, text: 'a' },
      { kind: 'mosaic', col: 1, width: 1, bits: 16, fg: WHITE, bg: BLACK },
      { kind: 'text', col: 2, width: 1, text: 'n' },
    ])
  })

  it('lämnar en okänd mask till cellreserven', () => {
    const cells = grid()
    put(cells, 3, 0, glyph(A))
    put(cells, 3, 1, glyph(UNSEEN))

    const { runs } = runsOf(cells, 3)
    expect(runs[1]).toMatchObject({ kind: 'unknown', col: 1, width: 1, fg: WHITE, bg: BLACK })
  })
})
