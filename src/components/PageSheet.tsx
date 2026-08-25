import type { FetchResult, PageNumber } from '../api.types'
import { NotBroadcast } from './NotBroadcast'
import { PageView } from './PageView'
import { TransportError } from './TransportError'

interface Props {
  pageNumber: PageNumber
  result: FetchResult | undefined
  /** Where the sheet sits on the track; `current` is the page being read. */
  place: 'current' | 'prev' | 'next'
  onNavigate: (pageNumber: PageNumber) => void
  onRetry: () => void
}

/**
 * One page's own box on the track, in whichever of the four states it is.
 *
 * A neighbour reaches only three of them: a failed prefetch is dropped rather
 * than shown as an error nobody can act on, so it stays on `Hämtar…`.
 */
export function PageSheet({ pageNumber, result, place, onNavigate, onRetry }: Props) {
  return (
    <div
      className={`swipe-sheet swipe-sheet--${place}`}
      data-page={pageNumber}
      // Off the tab order and out of the accessibility tree: only the page
      // being read is reachable.
      inert={place !== 'current'}
    >
      {result === undefined && <p className="message__text">Hämtar…</p>}
      {result?.kind === 'page' && <PageView page={result} onNavigate={onNavigate} />}
      {result?.kind === 'not-broadcast' && <NotBroadcast result={result} onNavigate={onNavigate} />}
      {result?.kind === 'error' && <TransportError result={result} onRetry={onRetry} />}
    </div>
  )
}
