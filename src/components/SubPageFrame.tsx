import { useEffect, useMemo, useRef, useState } from 'react'
import type { PageNumber, SubPage } from '../api.types'
import { parseImageMap } from '../imageMap'
import { decodeFrame } from '../teletext/decode'
import { changedRows } from '../teletext/diff'
import { resolvePage, type DisplayRow } from '../teletext/resolve'
import { HotspotLayer } from './HotspotLayer'
import { TextFrame } from './TextFrame'

/** How long a changed-row mark stays at full strength. */
const MARK_SOLID_MS = 1700
/** The fade that carries it away; matches the CSS transition on the mark. */
const MARK_FADE_MS = 500

interface Props {
  subPage: SubPage
  /**
   * Bumped by `useTextTv` when a payload the reader asked for lands and can be
   * compared with the one it replaced. Compared against what this frame has
   * already marked, never spent.
   */
  markId: number
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
 * Only a frame that has never resolved shows that empty box - a revalidation
 * keeps the rows it already has until the new ones are ready.
 *
 * That holding is also what makes the changed-row marks possible: the rows
 * still on screen are the copy a new decode is compared against.
 */
export function SubPageFrame({ subPage, markId, onNavigate }: Props) {
  const hotspots = useMemo(() => parseImageMap(subPage.imageMap), [subPage.imageMap])
  const [decoded, setDecoded] = useState<Decoded>({ status: 'pending' })
  const [changed, setChanged] = useState<readonly number[]>([])
  const [fading, setFading] = useState(false)
  /** The `markId` this frame has already answered. */
  const marked = useRef(markId)

  useEffect(() => {
    let current = true
    // Decided synchronously, before the decode is even started: this effect is
    // running *because* the frame changed, so `markId` is the id of the payload
    // that changed it, while the ref still holds the id the previous frame
    // arrived with. Different means the reader asked for this one.
    const compares = markId !== marked.current
    setDecoded((previous) => (previous.status === 'resolved' ? previous : { status: 'pending' }))

    void decodeFrame(subPage.gifDataUrl).then((cells) => {
      // A superseded sub-page's grid must never paint under the new frame.
      if (!current) return
      if (cells === null) {
        setDecoded({ status: 'failed' })
        return
      }
      const rows = resolvePage(cells, subPage.altText)
      // `decoded` and `markId` are read from the closure deliberately and are
      // not dependencies: they are wanted as they were when this GIF arrived,
      // which is exactly what makes the previous rows the copy that was on
      // screen. An unchanged GIF never re-runs this effect at all, so a refresh
      // that brings nothing new never reaches the comparison - which is the
      // real answer to "mark nothing when nothing changed".
      if (compares && decoded.status === 'resolved') {
        setChanged(changedRows(decoded.rows, rows))
        setFading(false)
      }
      setDecoded({ status: 'resolved', rows })
    })

    return () => {
      current = false
    }
  }, [subPage.gifDataUrl, subPage.altText])

  /**
   * The id moves on whether or not this frame had anything to compare.
   *
   * A refresh that brings back a byte-identical GIF runs no decode at all, so
   * without this the frame would be left permanently owing that id - and would
   * spend it on the next change from any source, marking a background
   * revalidation the reader never asked for. Declared after the decode effect
   * so that one reads the previous id first.
   */
  useEffect(() => {
    marked.current = markId
  }, [markId])

  // Solid, then faded out, then gone. Two timers rather than one because an
  // emptied list unmounts the marks with nothing left to fade.
  useEffect(() => {
    if (changed.length === 0) return
    const fade = window.setTimeout(() => setFading(true), MARK_SOLID_MS)
    const clear = window.setTimeout(() => setChanged([]), MARK_SOLID_MS + MARK_FADE_MS)
    return () => {
      window.clearTimeout(fade)
      window.clearTimeout(clear)
    }
  }, [changed])

  return (
    // The label names the group only while the <img> is all there is; once the
    // page is drawn as text the text itself is the content, and labelling the
    // group would have it read out and then read again.
    <div
      className="frame"
      role="group"
      aria-label={decoded.status === 'failed' ? subPage.altText : undefined}
    >
      {decoded.status === 'resolved' && (
        <TextFrame
          rows={decoded.rows}
          gifDataUrl={subPage.gifDataUrl}
          changed={changed}
          fading={fading}
        />
      )}
      {decoded.status === 'failed' && (
        <img className="frame__gif" src={subPage.gifDataUrl} alt={subPage.altText} />
      )}
      <HotspotLayer hotspots={hotspots} onNavigate={onNavigate} />
    </div>
  )
}
