import { FRAME_HEIGHT, FRAME_WIDTH, isPageNumber, type PageNumber } from './api.types'

/**
 * One clickable page reference printed in a teletext frame.
 *
 * Pixel coordinates are the frame's own; the percentages are what the overlay
 * positions with, so hotspots track the frame at any viewport size.
 */
export interface Hotspot {
  href: PageNumber
  x1: number
  y1: number
  x2: number
  y2: number
  leftPct: number
  topPct: number
  widthPct: number
  heightPct: number
  centreX: number
  centreY: number
}

export interface FrameSize {
  width: number
  height: number
}

const AREA = /<\s*area\b([^>]*)>/gi
const ATTR = /(\w+)\s*=\s*"([^"]*)"/g

const attributes = (tag: string): Record<string, string> => {
  const found: Record<string, string> = {}
  for (const [, name, value] of tag.matchAll(ATTR)) found[name.toLowerCase()] = value
  return found
}

/**
 * Parses SVT's `imageMap` string into structured rects.
 *
 * The live payload is tab-separated with uppercase `<AREA>` tags, but nothing
 * here depends on that: tags and attribute names match case-insensitively and
 * entries may be separated by any whitespace. Malformed entries are dropped
 * rather than thrown on, so one bad rect cannot cost a page its other links.
 */
export function parseImageMap(
  map: string,
  frame: FrameSize = { width: FRAME_WIDTH, height: FRAME_HEIGHT },
): Hotspot[] {
  const hotspots: Hotspot[] = []

  for (const [, tag] of map.matchAll(AREA)) {
    const { coords, href } = attributes(tag)
    if (!href || !isPageNumber(href)) continue

    const numbers = (coords ?? '').split(',').map((part) => Number(part.trim()))
    if (numbers.length !== 4 || !numbers.every(Number.isFinite)) continue

    const [left, top, right, bottom] = numbers
    const x1 = Math.min(left, right)
    const y1 = Math.min(top, bottom)
    const x2 = Math.max(left, right)
    const y2 = Math.max(top, bottom)

    hotspots.push({
      href,
      x1,
      y1,
      x2,
      y2,
      leftPct: (x1 / frame.width) * 100,
      topPct: (y1 / frame.height) * 100,
      widthPct: ((x2 - x1) / frame.width) * 100,
      heightPct: ((y2 - y1) / frame.height) * 100,
      centreX: (x1 + x2) / 2,
      centreY: (y1 + y2) / 2,
    })
  }

  return hotspots
}

/**
 * Picks the hotspot a touch at (x, y) meant, in frame pixels.
 *
 * A printed page reference is only 16 px tall, so targets are expanded
 * vertically to a finger's width and then overlap on a dense page. Overlaps
 * resolve to the nearest rect centre rather than to paint order, which is why
 * this is arithmetic here and not z-order in the DOM.
 *
 * `halfHeight` is half the minimum target height, in frame pixels.
 */
export function resolveHotspot(
  hotspots: Hotspot[],
  x: number,
  y: number,
  halfHeight: number,
): Hotspot | undefined {
  let best: Hotspot | undefined
  let bestDistance = Infinity

  for (const hotspot of hotspots) {
    if (x < hotspot.x1 || x > hotspot.x2) continue
    const reach = Math.max((hotspot.y2 - hotspot.y1) / 2, halfHeight)
    if (Math.abs(y - hotspot.centreY) > reach) continue

    const distance = (hotspot.centreX - x) ** 2 + (hotspot.centreY - y) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = hotspot
    }
  }

  return best
}
