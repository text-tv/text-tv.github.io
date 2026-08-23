// Minimal single-frame GIF87a/89a decoder.
//
// Node has no image decoding and the glyph table is dev-only, so the fixtures'
// frames are unpacked here rather than by pulling in an image dependency. Only
// what SVT actually serves is handled: one non-interlaced frame per file.

/** Returns `{ w, h, pal, idx }` — palette indices, row-major, one byte per pixel. */
export function decodeGif(b) {
  let p = 6
  const w = b.readUInt16LE(p)
  p += 2
  const h = b.readUInt16LE(p)
  p += 2
  const f = b[p]
  p += 1
  p += 2 // background colour index, pixel aspect ratio
  let pal = null
  if (f & 0x80) {
    const n = 2 ** ((f & 7) + 1)
    pal = []
    for (let i = 0; i < n; i += 1) pal.push([b[p++], b[p++], b[p++]])
  }

  // Skip extension blocks until the first image descriptor.
  for (;;) {
    const sep = b[p++]
    if (sep === 0x21) {
      p += 1
      while (b[p]) p += b[p] + 1
      p += 1
      continue
    }
    if (sep === 0x2c) break
    if (sep === 0x3b) throw new Error('no image')
    throw new Error(`bad separator ${sep.toString(16)}`)
  }

  const ix = b.readUInt16LE(p)
  const iy = b.readUInt16LE(p + 2)
  const iw = b.readUInt16LE(p + 4)
  const ih = b.readUInt16LE(p + 6)
  const lf = b[p + 8]
  p += 9
  if (lf & 0x80) {
    const n = 2 ** ((lf & 7) + 1)
    pal = []
    for (let i = 0; i < n; i += 1) pal.push([b[p++], b[p++], b[p++]])
  }
  if (lf & 0x40) throw new Error('interlaced')

  const minCode = b[p++]
  const data = []
  while (b[p]) {
    const n = b[p++]
    for (let i = 0; i < n; i += 1) data.push(b[p + i])
    p += n
  }

  // LZW, least-significant bit first, with the dictionary growing to 12 bits.
  const clear = 1 << minCode
  const eoi = clear + 1
  let size = minCode + 1
  let dict = []
  let next = eoi + 1
  const reset = () => {
    dict = []
    for (let i = 0; i < clear; i += 1) dict[i] = [i]
    dict[clear] = []
    dict[eoi] = []
    next = eoi + 1
    size = minCode + 1
  }
  reset()

  const out = []
  let bit = 0
  let prev = null
  const read = () => {
    let v = 0
    for (let i = 0; i < size; i += 1) {
      const by = data[bit >> 3]
      if (by === undefined) return eoi
      v |= ((by >> (bit & 7)) & 1) << i
      bit += 1
    }
    return v
  }

  for (;;) {
    const code = read()
    if (code === eoi) break
    if (code === clear) {
      reset()
      prev = null
      continue
    }
    let entry
    if (code < next && dict[code]) entry = dict[code]
    else if (prev) entry = prev.concat(prev[0])
    else break
    out.push(...entry)
    if (prev) {
      dict[next++] = prev.concat(entry[0])
      if (next === 1 << size && size < 12) size += 1
    }
    prev = entry
  }

  const idx = new Uint8Array(w * h)
  for (let y = 0; y < ih; y += 1) {
    for (let x = 0; x < iw; x += 1) idx[(y + iy) * w + x + ix] = out[y * iw + x]
  }
  return { w, h, pal, idx }
}
