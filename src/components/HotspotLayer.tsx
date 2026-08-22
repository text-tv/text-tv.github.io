import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { FRAME_HEIGHT, FRAME_WIDTH, type PageNumber } from '../api.types'
import { resolveHotspot, type Hotspot } from '../imageMap'

/** The smallest comfortable touch target, in CSS pixels. */
const MIN_TARGET_PX = 44
/** How long a tapped link stays lit, in milliseconds. */
const FLASH_MS = 140

interface Props {
  hotspots: Hotspot[]
  onNavigate: (pageNumber: PageNumber) => void
}

const key = (hotspot: Hotspot) => `${hotspot.href}-${hotspot.x1}-${hotspot.y1}`

/**
 * Transparent tap targets over a teletext frame.
 *
 * A printed page reference is 39x16 px, well under a finger at the size the
 * frame renders, so the targets are expanded vertically and centred on the
 * printed rect. The underline is drawn as its own element on the printed rect,
 * so expanding the target never moves the mark off the digits.
 *
 * Expanded targets overlap on a dense page. The capture handler resolves a
 * touch to the nearest rect centre rather than to whichever element the
 * browser hits first. Where there is no layout to measure - a keyboard
 * activation, or a test environment - each button's own handler still works.
 */
export function HotspotLayer({ hotspots, onNavigate }: Props) {
  const layer = useRef<HTMLDivElement>(null)
  const flashTimer = useRef<number | undefined>(undefined)
  const [flashed, setFlashed] = useState<string | undefined>()

  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  const follow = (hotspot: Hotspot) => {
    setFlashed(key(hotspot))
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlashed(undefined), FLASH_MS)
    onNavigate(hotspot.href)
  }

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const box = layer.current?.getBoundingClientRect()
    if (!box?.width || !box.height) return

    const x = ((event.clientX - box.left) / box.width) * FRAME_WIDTH
    const y = ((event.clientY - box.top) / box.height) * FRAME_HEIGHT
    const halfHeight = (MIN_TARGET_PX / 2 / box.height) * FRAME_HEIGHT
    const hit = resolveHotspot(hotspots, x, y, halfHeight)
    if (!hit) return

    event.preventDefault()
    event.stopPropagation()
    follow(hit)
  }

  return (
    <div className="hotspots" ref={layer} onClickCapture={onClickCapture}>
      {hotspots.map((hotspot) => (
        <span
          key={`mark-${key(hotspot)}`}
          aria-hidden="true"
          className={`hotspot-mark${flashed === key(hotspot) ? ' hotspot-mark--flash' : ''}`}
          style={{
            left: `${hotspot.leftPct}%`,
            top: `${hotspot.topPct}%`,
            width: `${hotspot.widthPct}%`,
            height: `${hotspot.heightPct}%`,
          }}
        />
      ))}
      {hotspots.map((hotspot) => (
        <button
          key={`target-${key(hotspot)}`}
          type="button"
          className="hotspot"
          aria-label={`Sida ${hotspot.href}`}
          style={{
            left: `${hotspot.leftPct}%`,
            width: `${hotspot.widthPct}%`,
            // Centred on the printed rect, then grown to a finger's width.
            top: `${hotspot.topPct + hotspot.heightPct / 2}%`,
            height: `max(${hotspot.heightPct}%, ${MIN_TARGET_PX}px)`,
          }}
          onClick={() => follow(hotspot)}
        />
      ))}
    </div>
  )
}
