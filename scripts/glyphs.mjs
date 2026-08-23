// Builds src/teletext/glyphs.generated.ts from the captured fixtures.
//
// The runtime resolves a cell by looking its mask up in this table (KTD3), so
// the mask is serialised here exactly the way src/teletext/decode.ts builds it.
// Characters are recovered by aligning each sub-page's altText lines to the
// grid; block-graphics cells are recognised by shape and need no label.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeGif } from './gif.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixturesDir = join(root, 'fixtures')
const overridesFile = join(root, 'scripts', 'glyph-overrides.json')
const outFile = join(root, 'src', 'teletext', 'glyphs.generated.ts')

const COLS = 40
const ROWS = 25
const CELL_W = 13
const CELL_H = 16
const FRAME_W = COLS * CELL_W
const FRAME_H = ROWS * CELL_H

/** The six mosaic regions, as [x0, x1, y0, y1), in the order of `bits`. */
const MOSAIC_REGIONS = [
  [0, 6, 0, 5],
  [6, 13, 0, 5],
  [0, 6, 5, 11],
  [6, 13, 5, 11],
  [0, 6, 11, 16],
  [6, 13, 11, 16],
]

const maskKey = (mask) => mask.join(',')

/** Splits a decoded frame into 1000 masks; `null` where the cell is one colour. */
function toMasks({ pal, idx }) {
  const colour = (x, y) => {
    const [r, g, b] = pal[idx[y * FRAME_W + x]]
    return (r << 16) | (g << 8) | b
  }
  const masks = []
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const x0 = col * CELL_W
      const y0 = row * CELL_H
      const counts = new Map()
      for (let y = 0; y < CELL_H; y += 1) {
        for (let x = 0; x < CELL_W; x += 1) {
          const c = colour(x0 + x, y0 + y)
          counts.set(c, (counts.get(c) ?? 0) + 1)
        }
      }
      if (counts.size === 1) {
        masks.push(null)
        continue
      }
      let bg = 0
      let best = -1
      for (const [c, n] of counts) if (n > best) [bg, best] = [c, n]
      const mask = new Uint16Array(CELL_H)
      for (let y = 0; y < CELL_H; y += 1) {
        let bits = 0
        for (let x = 0; x < CELL_W; x += 1) if (colour(x0 + x, y0 + y) !== bg) bits |= 1 << x
        mask[y] = bits
      }
      masks.push(mask)
    }
  }
  return masks
}

const on = (mask, x, y) => (mask[y] >> x) & 1

/**
 * Block graphics divide the cell into six solid rectangles. Any cell where all
 * six are uniform is a mosaic, which carries no character at all.
 */
function mosaicBits(mask) {
  let bits = 0
  for (let i = 0; i < MOSAIC_REGIONS.length; i += 1) {
    const [x0, x1, y0, y1] = MOSAIC_REGIONS[i]
    const first = on(mask, x0, y0)
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) if (on(mask, x, y) !== first) return null
    }
    if (first) bits |= 1 << i
  }
  return bits
}

/** A double-height glyph is drawn at 2x, so every scanline is duplicated. */
function isStretched(mask) {
  for (let y = 0; y < CELL_H; y += 2) if (mask[y] !== mask[y + 1]) return false
  return true
}

const occupancy = (masks, row) =>
  Array.from({ length: COLS }, (_, col) => masks[row * COLS + col] !== null)

/**
 * Pairs up the grid rows carrying the two halves of one double-height line.
 *
 * The halves do not share an occupancy pattern — a stretched glyph sits at a
 * vertical offset, so ascenders land in one row and descenders in the other —
 * hence the test is on the scanlines, not on which cells are filled.
 */
function displayRows(masks) {
  const rows = []
  for (let row = 0; row < ROWS; row += 1) {
    const own = occupancy(masks, row)
    if (!own.some(Boolean)) continue

    const cellsStretched = (r) => {
      const cells = []
      for (let col = 0; col < COLS; col += 1) {
        const mask = masks[r * COLS + col]
        if (mask !== null) cells.push(mask)
      }
      return cells.length > 0 && cells.every(isStretched)
    }

    if (row + 1 < ROWS && cellsStretched(row) && cellsStretched(row + 1)) {
      const below = occupancy(masks, row + 1)
      rows.push({
        row,
        doubleHeight: true,
        occupancy: own.map((cell, col) => cell || below[col]),
      })
      row += 1
      continue
    }
    rows.push({ row, doubleHeight: false, occupancy: own })
  }
  return rows
}

const sameOccupancy = (a, b) => a.every((cell, i) => cell === b[i])

function readFixtures() {
  const pages = []
  for (const name of readdirSync(fixturesDir).filter((n) => /^raw_\d{3}\.json$/.test(n)).sort()) {
    const body = JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'))
    for (const sub of body.data?.subPages ?? []) {
      if (!sub.gifAsBase64) continue
      const frame = decodeGif(Buffer.from(sub.gifAsBase64, 'base64'))
      if (frame.w !== FRAME_W || frame.h !== FRAME_H) throw new Error(`${name}: not ${FRAME_W}x${FRAME_H}`)
      pages.push({ name, sub: sub.subPageNumber, masks: toMasks(frame), altText: sub.altText ?? '' })
    }
  }
  return pages
}

const glyphs = new Map() // key -> { key, masks, votes: Map<char, count>, doubleHeight }

/**
 * Both halves key a double-height glyph: 's' and 'c' share a top half and
 * differ below, while 'a' and 'å' share a bottom half and differ above, so
 * neither half identifies the character on its own.
 */
const composite = (top, bottom) =>
  `${top === null ? '' : maskKey(top)}|${bottom === null ? '' : maskKey(bottom)}`

function glyph(key, masks) {
  let entry = glyphs.get(key)
  if (entry === undefined) {
    entry = { key, masks, votes: new Map(), doubleHeight: masks.length === 2 }
    glyphs.set(key, entry)
  }
  return entry
}

/** The glyph a column of a display row draws: one cell, or a stretched pair. */
function cellGlyph(masks, row, col) {
  const top = masks[row.row * COLS + col]
  if (!row.doubleHeight) return top === null ? null : glyph(maskKey(top), [top])
  const bottom = masks[(row.row + 1) * COLS + col]
  if (top === null && bottom === null) return null
  return glyph(composite(top, bottom), [top, bottom])
}

const pages = readFixtures()

for (const page of pages) {
  const { masks } = page
  const rows = displayRows(masks)
  for (const row of rows) for (let col = 0; col < COLS; col += 1) cellGlyph(masks, row, col)

  for (const line of page.altText.split('\n')) {
    if (line.trim() === '') continue
    const text = line.slice(0, COLS).padEnd(COLS, ' ')
    const occ = Array.from(text, (ch) => ch !== ' ')
    // Only an unambiguous alignment may vote: a first match that happens to fit
    // labels the wrong row, and a wrong label outvotes nothing but poisons a key.
    const matches = rows.filter((row) => sameOccupancy(row.occupancy, occ))
    if (matches.length !== 1) continue
    const row = matches[0]

    for (let col = 0; col < COLS; col += 1) {
      const char = text[col]
      if (char === ' ') continue
      const entry = cellGlyph(masks, row, col)
      if (entry !== null) entry.votes.set(char, (entry.votes.get(char) ?? 0) + 1)
    }
  }
}

if (!existsSync(overridesFile)) writeFileSync(overridesFile, '{}\n')
const overrides = JSON.parse(readFileSync(overridesFile, 'utf8'))

const entries = []
const unlabelled = []
let mosaics = 0
let voted = 0
let overridden = 0

for (const entry of [...glyphs.values()].sort((a, b) => a.key.localeCompare(b.key))) {
  const bits = entry.doubleHeight ? null : mosaicBits(entry.masks[0])
  if (bits !== null) {
    mosaics += 1
    entries.push([entry.key, `{ kind: 'mosaic', bits: ${bits} }`])
    continue
  }

  const override = overrides[entry.key]
  let char = override
  if (char === undefined) {
    const ranked = [...entry.votes.entries()].sort((a, b) => b[1] - a[1])
    // A contested key is only settled by a landslide; anything closer is left
    // to a hand override rather than guessed at.
    if (ranked.length === 1 || (ranked.length > 1 && ranked[0][1] >= 3 * ranked[1][1])) {
      char = ranked[0][0]
      voted += 1
    }
  } else {
    overridden += 1
  }

  if (char === undefined) {
    unlabelled.push(entry)
    continue
  }
  entries.push([
    entry.key,
    `{ kind: 'char', char: ${JSON.stringify(char)}, doubleHeight: ${entry.doubleHeight} }`,
  ])
}

const body = entries.map(([key, value]) => `  '${key}': ${value},`).join('\n')
writeFileSync(
  outFile,
  `// Generated by \`npm run glyphs\` from fixtures/raw_*.json. Do not hand-edit;\n` +
    `// hand labels belong in scripts/glyph-overrides.json.\n` +
    `import type { Glyph } from './types'\n\n` +
    `export const GLYPHS: Record<string, Glyph> = {\n${body}\n}\n`,
)

/** A glyph as ASCII art; a double-height one is drawn as its two halves stacked. */
const art = (masks) =>
  masks
    .map((mask) =>
      Array.from({ length: CELL_H }, (_, y) =>
        Array.from({ length: CELL_W }, (_, x) => (mask !== null && on(mask, x, y) ? '#' : '.')).join(''),
      ).join('\n'),
    )
    .join('\n')

const log = (line) => process.stderr.write(`${line}\n`)
log(`${glyphs.size} distinct glyphs across ${pages.length} sub-pages`)
log(`  ${mosaics} mosaics, ${voted} auto-labelled, ${overridden} overridden`)
log(`  ${[...glyphs.values()].filter((e) => e.doubleHeight).length} of them double-height`)
log(`  ${unlabelled.length} unlabelled`)
for (const entry of unlabelled) {
  log(`\n'${entry.key}':`)
  log(art(entry.masks))
}
log(`\nwrote ${outFile.slice(root.length + 1)}: ${entries.length} entries`)
