import { useRef, useState, type MouseEvent } from 'react'
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

/**
 * Transparent tap targets over a teletext frame.
 *
 * Each printed page reference is 39x16 px, which is well under a finger at the
 * size the frame renders, so targets are expanded vertically. Expanded targets
 * overlap on a dense page, and the capture handler below resolves a touch to
 * the nearest rect centre rather than to whichever element the browser happens
 * to hit first. Where there is no layout to measure - a keyboard activation,
 * or a test environment - the buttons' own handlers still work.
 */
export function HotspotLayer({ hotspots, onNavigate }: Props) {
  const layer = useRef<HTMLDivElement>(null)
  const [flashed, setFlashed] = useState<number | undefined>()

  const follow = (index: number, href: PageNumber) => {
    setFlashed(index)
    window.setTimeout(() => setFlashed(undefined), FLASH_MS)
    onNavigate(href)
  }

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const box = layer.current?.getBoundingClientRect()
    if (!box?.width || !box.height) return

    const scale = box.width / FRAME_WIDTH
    const x = (event.clientX - box.left) / scale
    const y = (event.clientY - box.top) / (box.height / FRAME_HEIGHT)
    const hit = resolveHotspot(hotspots, x, y, MIN_TARGET_PX / 2 / scale)
    if (!hit) return

    event.preventDefault()
    event.stopPropagation()
    follow(hotspots.indexOf(hit), hit.href)
  }

  return (
    <div className="hotspots" ref={layer} onClickCapture={onClickCapture}>
      {hotspots.map((hotspot, index) => (
        <button
          key={`${hotspot.href}-${hotspot.x1}-${hotspot.y1}`}
          type="button"
          className={`hotspot${flashed === index ? ' hotspot--flash' : ''}`}
          aria-label={`Sida ${hotspot.href}`}
          style={{
            left: `${hotspot.leftPct}%`,
            top: `${hotspot.topPct}%`,
            width: `${hotspot.widthPct}%`,
            height: `${hotspot.heightPct}%`,
          }}
          onClick={() => follow(index, hotspot.href)}
        >
          <span className="hotspot__mark" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
