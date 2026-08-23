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

/**
 * The normal-height key of a double-height cell, from its two halves.
 *
 * Doubling is the whole of what double height does: the glyph's first eight
 * scanlines fill the top cell and its last eight the bottom, each drawn twice.
 * Undoing it recovers the 16 rows the same character has when it is set at
 * normal height, so a character the table knows in one size is known in both
 * and only needs to be captured once. A blank half is eight blank scanlines.
 */
export const unstretchedKey = (top, bottom) => {
  const half = (mask) => Array.from({ length: 8 }, (_, i) => (mask === null ? 0 : mask[i * 2]))
  return [...half(top), ...half(bottom)].join(',')
}

/** A double-height glyph is drawn at 2x, so every scanline is duplicated. */
export const isStretched = (mask) => {
  for (let y = 0; y < mask.length; y += 2) if (mask[y] !== mask[y + 1]) return false
  return true
}
