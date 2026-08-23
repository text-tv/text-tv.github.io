import { useEffect, useMemo, useState } from 'react'
import type { PageNumber, SubPage } from '../api.types'
import { parseImageMap } from '../imageMap'
import { decodeFrame } from '../teletext/decode'
import { resolvePage, type DisplayRow } from '../teletext/resolve'
import { HotspotLayer } from './HotspotLayer'
import { TextFrame } from './TextFrame'

interface Props {
  subPage: SubPage
  onNavigate: (pageNumber: PageNumber) => void
}

type Decoded =
  | { status: 'pending' }
  | { status: 'resolved'; rows: DisplayRow[] }
  | { status: 'failed' }

/**
 * One teletext frame, drawn as text once its GIF has been decoded.
 *
 * The box is held empty while the decode runs rather than showing the GIF: the
 * blurry frame flashing on every page load is what this rendering replaces,
 * and drawing it here would make the R10 fallback look like a slow decode.
 */
export function SubPageFrame({ subPage, onNavigate }: Props) {
  const hotspots = useMemo(() => parseImageMap(subPage.imageMap), [subPage.imageMap])
  const [decoded, setDecoded] = useState<Decoded>({ status: 'pending' })

  useEffect(() => {
    let current = true
    setDecoded({ status: 'pending' })

    void decodeFrame(subPage.gifDataUrl).then((cells) => {
      // A superseded sub-page's grid must never paint under the new frame.
      if (!current) return
      if (cells === null) setDecoded({ status: 'failed' })
      else setDecoded({ status: 'resolved', rows: resolvePage(cells) })
    })

    return () => {
      current = false
    }
  }, [subPage.gifDataUrl])

  return (
    <div className="frame" role="group" aria-label={subPage.altText}>
      {decoded.status === 'resolved' && (
        <TextFrame rows={decoded.rows} gifDataUrl={subPage.gifDataUrl} />
      )}
      {decoded.status === 'failed' && (
        <img className="frame__gif" src={subPage.gifDataUrl} alt={subPage.altText} />
      )}
      <HotspotLayer hotspots={hotspots} onNavigate={onNavigate} />
    </div>
  )
}
