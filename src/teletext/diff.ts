import type { DisplayRow, Run } from './resolve'

/**
 * One run, reduced to everything that decides what it draws.
 *
 * Colours are part of it: teletext says things with colour, so a score that
 * turns from white to yellow has changed even though its characters have not.
 */
const runKey = (run: Run): string => {
  const box = `${run.col}:${run.width}:${run.fg}:${run.bg}`
  if (run.kind === 'text') return `t${box}:${run.text}`
  if (run.kind === 'mosaic') return `m${box}:${run.bits}`
  // An unresolved cell draws a slice of its own frame, and two slices from two
  // different frames are not comparable here - the row is reported as changed
  // if anything else about it moved, and left alone if nothing did. Treating
  // every unknown as a difference would mark the same row on every refresh.
  return `u${box}`
}

const rowKey = (row: DisplayRow): string =>
  `${row.doubleHeight ? 'd' : 's'}|${row.runs.map(runKey).join('|')}`

/**
 * Which grid rows differ between two decodes of the same sub-page.
 *
 * Rows are matched by `row`, not by position: a double-height row covers the
 * grid row beneath it and that row is never emitted on its own, so the same
 * row number can be present on one side and absent on the other. A row on only
 * one side counts as changed - it appeared or it went away, and either is news.
 */
export function changedRows(before: DisplayRow[], after: DisplayRow[]): number[] {
  const was = new Map(before.map((row) => [row.row, rowKey(row)]))
  const changed: number[] = []

  for (const row of after) {
    if (was.get(row.row) !== rowKey(row)) changed.push(row.row)
    was.delete(row.row)
  }
  // Whatever the new decode did not account for was on screen and is not any
  // more, so its row changed too.
  for (const row of was.keys()) changed.push(row)

  return changed.sort((a, b) => a - b)
}
