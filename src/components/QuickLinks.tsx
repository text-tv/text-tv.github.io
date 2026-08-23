import type { PageNumber } from '../api.types'

/** The nine sections SVT links from its own front page, in its own order. */
const LINKS: ReadonlyArray<[PageNumber, string]> = [
  ['100', 'NYHETER'],
  ['300', 'SPORT'],
  ['330', 'RESULTATBÖRSEN'],
  ['377', 'MÅLSERVICE'],
  ['400', 'VÄDER'],
  ['500', 'BLANDAT'],
  ['600', 'PÅ TV'],
  ['700', 'INNEHÅLL'],
  ['800', 'UR'],
]

interface Props {
  current: PageNumber
  onNavigate: (pageNumber: PageNumber) => void
}

/**
 * Shortcuts to the nine sections, under the frames and in their palette.
 *
 * The names are written in capitals in the source rather than uppercased in
 * CSS: teletext has no lower case, so this is the spelling, not a transform.
 * The page you are on drops out of the colour scheme instead of gaining a
 * marker, which is driven off aria-current so the two cannot disagree.
 */
export function QuickLinks({ current, onNavigate }: Props) {
  return (
    <nav className="links" aria-label="Genvägar">
      {LINKS.map(([pageNumber, name]) => (
        <button
          key={pageNumber}
          type="button"
          className="links__item"
          aria-current={pageNumber === current ? 'page' : undefined}
          onClick={() => onNavigate(pageNumber)}
        >
          <span className="links__num">{pageNumber}</span>
          <span className="links__name">{name}</span>
        </button>
      ))}
    </nav>
  )
}
