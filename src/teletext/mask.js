// The mask-key format and the double-height test, shared by both sides.
//
// Plain JS because scripts/glyphs.mjs (Node, build time) mints the keys and
// src/teletext/resolve.ts (browser, run time) looks them up: a key built even
// slightly differently in one of them silently misses the table and the text
// falls back to a GIF slice. One copy is the only way to keep them equal.

/** The table's key for a normal-height cell: the 16 mask rows, in order. */
export const maskKey = (mask) => mask.join(',')

/**
 * The table's key for a double-height cell, built from both of its halves.
 *
 * Neither half identifies the character alone: 's' and 'c' share a top half,
 * 'a' and 'å' a bottom one. A blank half contributes nothing but its separator.
 */
export const doubleHeightKey = (top, bottom) =>
  `${top === null ? '' : maskKey(top)}|${bottom === null ? '' : maskKey(bottom)}`

/** A double-height glyph is drawn at 2x, so every scanline is duplicated. */
export const isStretched = (mask) => {
  for (let y = 0; y < mask.length; y += 2) if (mask[y] !== mask[y + 1]) return false
  return true
}
