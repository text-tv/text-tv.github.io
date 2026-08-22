import { useMemo } from 'react'
import type { PageNumber, SubPage } from '../api.types'
import { parseImageMap } from '../imageMap'
import { HotspotLayer } from './HotspotLayer'

interface Props {
  subPage: SubPage
  onNavigate: (pageNumber: PageNumber) => void
}

/** One teletext frame, rendered at native geometry with hard pixel edges. */
export function SubPageFrame({ subPage, onNavigate }: Props) {
  const hotspots = useMemo(() => parseImageMap(subPage.imageMap), [subPage.imageMap])

  return (
    <div className="frame">
      <img className="frame__gif" src={subPage.gifDataUrl} alt={subPage.altText} />
      <HotspotLayer hotspots={hotspots} onNavigate={onNavigate} />
    </div>
  )
}
