import type { FetchResult, PageNumber } from '../api.types'
import { NotBroadcast } from './NotBroadcast'
import { PageView } from './PageView'
import { TransportError } from './TransportError'

interface Props {
  pageNumber: PageNumber
  result: FetchResult | undefined
  /** Where the sheet sits on the track; `current` is the page being read. */
  place: 'current' | 'prev' | 'next'
  /**
   * The same counter for every sheet, neighbours included. Handing a neighbour
   * a different one would seed it wrong: a sheet mounted as a neighbour is
   * rotated into the current slot by a commit and lives on, so it would then
   * be behind the count and mark on the next change from any source. Only the
   * page being read can bump the counter, so the neighbours stay quiet anyway.
   */
  markId: number
  onNavigate: (pageNumber: PageNumber) => void
  onRetry: () => void
}

/**
 * One page's own box on the track, in whichever of the four states it is.
 *
 * A neighbour reaches only three of them: a failed prefetch is dropped rather
 * than shown as an error nobody can act on, so it stays on `Hämtar…`.
 */
export function PageSheet({ pageNumber, result, place, markId, onNavigate, onRetry }: Props) {
  return (
    <div
      className={`swipe-sheet swipe-sheet--${place}`}
      data-page={pageNumber}
      // Off the tab order and out of the accessibility tree: only the page
      // being read is reachable.
      inert={place !== 'current'}
    >
      {result === undefined && (
        <div className="loading">
          <p className="loading__page">{pageNumber}</p>
          <p className="message__text loading__status">Hämtar…</p>
        </div>
      )}
      {result?.kind === 'page' && (
        <PageView page={result} markId={markId} onNavigate={onNavigate} />
      )}
      {result?.kind === 'not-broadcast' && <NotBroadcast result={result} onNavigate={onNavigate} />}
      {result?.kind === 'error' && <TransportError result={result} onRetry={onRetry} />}
    </div>
  )
}
