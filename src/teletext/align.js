// Lining a page's altText up with the rows it describes, shared by both sides.
//
// Plain JS for the same reason src/teletext/mask.js is: scripts/glyphs.mjs
// (Node, build time) aligns a whole corpus to vote on what each bitmap draws,
// and src/teletext/resolve.ts (browser, run time) aligns one frame to name the
// cells the table missed. Both have to refuse the same lines - an alignment
// that is merely plausible labels a character onto the wrong bitmap - so both
// read one copy.

/** True where the column carries something other than a space. */
const occupancyOf = (text) => Array.from(text, (ch) => ch !== ' ')

const same = (a, b) => a.every((cell, i) => cell === b[i])

/**
 * The altText line describing each display row, or `null` where none does.
 *
 * A line is matched to a row by occupancy - which columns are drawn - because
 * that is all the two representations share. Two refusals keep a wrong match
 * out. Uniqueness: a line that fits more than one row, or none, labels nothing.
 * Order: altText runs down the page, so the rows it labels must too, and a line
 * whose only match sits at or above the last one's is rejected rather than
 * followed. Uniqueness alone would not catch that - a line that cannot match
 * its own row, because a mosaic on it is spaced out in altText, may still be
 * the only fit for some other row, and would label every one of its characters
 * wrongly.
 *
 * `occupancies` covers the rows that draw something, in display order; a blank
 * row must be left out, or it would fit every blank line. `rejectedLines` and
 * `rejectedVotes` count what the order rule turned away, for the build script's
 * report.
 */
export const alignAltText = (occupancies, altText, cols) => {
  const lines = occupancies.map(() => null)
  let rejectedLines = 0
  let rejectedVotes = 0
  let lastMatched = -1

  for (const line of altText.split('\n')) {
    if (line.trim() === '') continue
    const text = line.slice(0, cols).padEnd(cols, ' ')
    const occupancy = occupancyOf(text)

    let index = -1
    let ambiguous = false
    for (let row = 0; row < occupancies.length; row += 1) {
      if (!same(occupancies[row], occupancy)) continue
      if (index === -1) index = row
      else {
        ambiguous = true
        break
      }
    }
    if (ambiguous || index === -1) continue

    if (index <= lastMatched) {
      rejectedLines += 1
      for (let col = 0; col < cols; col += 1) if (text[col] !== ' ') rejectedVotes += 1
      continue
    }

    lastMatched = index
    lines[index] = text
  }

  return { lines, rejectedLines, rejectedVotes }
}
