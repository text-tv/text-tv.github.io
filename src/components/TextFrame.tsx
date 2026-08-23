import type { CSSProperties } from 'react'
import type { DisplayRow, Run } from '../teletext/resolve'
import { GRID_COLS, GRID_ROWS } from '../teletext/types'

interface Props {
  rows: DisplayRow[]
  /** The frame the grid came from; an unresolved cell is cut out of it (R6). */
  gifDataUrl: string
}

/**
 * A mosaic cell's six sextants, as fractions of its 13x16 box.
 *
 * The bands are neither halves nor thirds: SVT splits x at 6 and y at 5 and 11,
 * and only these proportions tile with the neighbouring cells.
 */
const MOSAIC_COLUMNS = '6fr 7fr'
const MOSAIC_ROWS = '5fr 6fr 5fr'
/** Bit order, top-left first and bottom-right last. */
const SEXTANTS = [0, 1, 2, 3, 4, 5]

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
        style={{
          ...box,
          backgroundColor: run.bg,
          gridTemplateColumns: MOSAIC_COLUMNS,
          gridTemplateRows: MOSAIC_ROWS,
        }}
      >
        {SEXTANTS.map((bit) => (
          <span key={bit} style={{ background: (run.bits >> bit) & 1 ? run.fg : 'transparent' }} />
        ))}
      </span>
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
export function TextFrame({ rows, gifDataUrl }: Props) {
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
        </div>
      ))}
    </div>
  )
}
