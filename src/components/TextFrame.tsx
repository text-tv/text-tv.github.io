import type { CSSProperties } from 'react'
import type { DisplayRow, Run } from '../teletext/resolve'
import { GRID_COLS, GRID_ROWS } from '../teletext/types'

interface Props {
  rows: DisplayRow[]
  /** The frame the grid came from; an unresolved cell is cut out of it (R6). */
  gifDataUrl: string
  /** Grid rows a refresh brought back different, marked in column 0. */
  changed?: readonly number[]
  /** True once the marks have had their time and are on their way out. */
  fading?: boolean
}

/**
 * A mosaic cell's six sextants, as two overlapping background layers.
 *
 * The splits are neither halves nor thirds: SVT splits x at 6 and y at 5 and 11,
 * and only these proportions tile with the neighbouring cells. One element per
 * cell rather than seven - a page carries hundreds of them.
 *
 * Left and right are two layers rather than one split three ways so that no
 * boundary inside the cell is a butt joint. A cell is a fraction of the
 * container's width, so none of its boundaries lands on a whole device pixel,
 * and two independently rasterised bands meeting at one would round apart and
 * let the cell's own background through as a hairline across a block of solid
 * colour - the same crack the row and run bleeds cover between cells, one level
 * in. Here the y splits are hard stops inside a single gradient, and the x split
 * is an overlap, so neither can open.
 */
const MOSAIC_SPLIT_X = 'calc(100% * 6 / 13)'
/** SVT's y splits at 5 and 11 of 16, as the stops that divide a column's bands. */
const MOSAIC_SPLIT_Y = ['31.25%', '68.75%']

/**
 * One column of a cell as a single top-to-bottom gradient.
 *
 * Bit order is top-left first and bottom-right last, so a column's three bits
 * are `band * 2 + side`; an unlit sextant is the cell's background.
 */
const mosaicColumn = (bits: number, side: 0 | 1, fg: string, bg: string) => {
  const band = (index: number) => ((bits >> (index * 2 + side)) & 1 ? fg : bg)
  const [upper, lower] = MOSAIC_SPLIT_Y
  return `linear-gradient(to bottom, ${band(0)} 0 ${upper}, ${band(1)} ${upper} ${lower}, ${band(2)} ${lower} 100%)`
}

const mosaicStyle = (bits: number, fg: string, bg: string): CSSProperties => ({
  backgroundColor: bg,
  // The left column is listed first, so it paints over the right one, which is
  // given the whole cell to sit under it. The order is not cosmetic: reversing
  // it would not move the x split but erase it, since the full-width layer would
  // then cover the cell and draw every sextant in the right column's colours.
  backgroundImage: `${mosaicColumn(bits, 0, fg, bg)}, ${mosaicColumn(bits, 1, fg, bg)}`,
  // Both layers sit at the default 0 0; only the left one is narrowed.
  backgroundSize: `${MOSAIC_SPLIT_X} 100%, 100% 100%`,
})

/** Grid coordinates travel as custom properties; the CSS turns them into a box. */
const vars = (values: Record<string, number>): CSSProperties => values as CSSProperties

function RunElement({ run, gifDataUrl }: { run: Run; gifDataUrl: string }) {
  // The row element carries --row, so its runs inherit it for the GIF cut-out.
  const box = vars({ '--col': run.col, '--width': run.width })

  if (run.kind === 'mosaic') {
    return (
      <span
        className="text-frame__mosaic"
        aria-hidden="true"
        style={{ ...box, ...mosaicStyle(run.bits, run.fg, run.bg) }}
      />
    )
  }

  if (run.kind === 'unknown') {
    // backgroundColor, not the shorthand: inline styles outrank the class, and
    // the shorthand would reset the sizing that places the slice.
    return (
      <span
        className="text-frame__slice"
        aria-hidden="true"
        style={{ ...box, backgroundColor: run.bg, backgroundImage: `url(${gifDataUrl})` }}
      />
    )
  }

  return (
    <span className="text-frame__run" style={{ ...box, color: run.fg, backgroundColor: run.bg }}>
      {run.text}
    </span>
  )
}

/**
 * A decoded page drawn as real text on the frame's own geometry.
 *
 * Everything is placed in grid coordinates and sized from the container's
 * width, so the page fills the same box the GIF did at any column width and
 * stays sharp at any zoom - which is the point of rendering text at all.
 */
export function TextFrame({ rows, gifDataUrl, changed = [], fading = false }: Props) {
  const marked = new Set(changed)

  return (
    <div className="text-frame" style={vars({ '--cols': GRID_COLS, '--rows': GRID_ROWS })}>
      {rows.map((row) => (
        <div
          key={row.row}
          className={`text-frame__row${row.doubleHeight ? ' text-frame__row--double' : ''}`}
          style={vars({ '--row': row.row })}
        >
          {row.runs.map((run) => (
            <RunElement key={run.col} run={run} gifDataUrl={gifDataUrl} />
          ))}
          {/*
            Last, not first. Column 0 is the column the full-width bars leave
            blank - though text rows do use it for `*` markers - and blank is
            not nothing: the resolver emits it as a run of spaces carrying an
            opaque background, and runs are given no stacking order on purpose
            (see the bleed note in the stylesheet), so paint order is all there
            is. A mark drawn before that run would be covered by it. Inside the
            row, so a double-height row scales the mark along with its text.
          */}
          {marked.has(row.row) && (
            <span
              className={`text-frame__mark${fading ? ' text-frame__mark--fading' : ''}`}
              aria-hidden="true"
            />
          )}
        </div>
      ))}
    </div>
  )
}
