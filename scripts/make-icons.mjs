// Draws the app icons: the digits 100 in teletext colours on black.
//
// Teletext is a 40x25 grid of characters drawn from a 5x7 pixel font, so the
// icon is drawn the same way rather than rendered from a typeface. Writing the
// PNGs by hand keeps the build free of an image dependency and makes the
// output byte-identical on every machine.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public')

/** 5x7 glyphs, one string per row, '#' where the pixel is lit. */
const GLYPHS = {
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  0: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
}

// Teletext's own palette: yellow, cyan, green.
const COLOURS = [
  [255, 255, 0],
  [0, 255, 255],
  [0, 255, 0],
]

function drawIcon(size, { maskable }) {
  const pixels = new Uint8Array(size * size * 4)
  // Opaque black everywhere; a maskable icon needs its safe zone filled too.
  for (let i = 0; i < size * size; i += 1) pixels[i * 4 + 3] = 255

  const digits = ['1', '0', '0']
  // Maskable icons are cropped to a circle of 80% width, so shrink the text.
  const usable = maskable ? size * 0.6 : size * 0.82
  // Glyphs are 5 px wide with a 1 px gap, so three digits span 17 glyph pixels.
  const glyphWidth = digits.length * 6 - 1
  const scale = Math.max(1, Math.floor(usable / glyphWidth))
  const textWidth = glyphWidth * scale
  const originX = Math.round((size - textWidth) / 2)
  const originY = Math.round((size - 7 * scale) / 2)

  digits.forEach((digit, index) => {
    const glyph = GLYPHS[digit]
    const [r, g, b] = COLOURS[index % COLOURS.length]
    glyph.forEach((row, y) => {
      ;[...row].forEach((cellChar, x) => {
        if (cellChar !== '#') return
        const left = originX + (index * 6 + x) * scale
        const top = originY + y * scale
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const px = left + dx
            const py = top + dy
            if (px < 0 || py < 0 || px >= size || py >= size) continue
            const offset = (py * size + px) * 4
            pixels[offset] = r
            pixels[offset + 1] = g
            pixels[offset + 2] = b
          }
        }
      })
    })
  })

  return encodePng(size, size, pixels)
}

function encodePng(width, height, rgba) {
  // Each scanline is prefixed with filter type 0 (none).
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const body = Buffer.concat([head.subarray(4), data])
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(body) >>> 0, 0)
  return Buffer.concat([head.subarray(0, 4), body, tail])
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return crc ^ 0xffffffff
}

mkdirSync(outDir, { recursive: true })
const icons = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
  ['favicon.png', 64, false],
]
for (const [name, size, maskable] of icons) {
  writeFileSync(join(outDir, name), drawIcon(size, { maskable }))
  console.log(`public/${name} (${size}x${size})`)
}
