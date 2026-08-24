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
 * Shortcuts to the nine sections, sliding sideways above the bottom bar in the
 * frames' palette. Chrome rather than page content: it sits outside the scroll
 * container, so a long page cannot carry it away, and it fills a band that was
 * black before. The row simply clips at the right edge - the cut-off item is
 * the only affordance it needs.
 *
 * The names are written in capitals in the source rather than uppercased in
 * CSS: teletext has no lower case, so this is the spelling, not a transform.
 * The page you are on drops out of the colour scheme instead of gaining a
 * marker, which is driven off aria-current so the two cannot disagree.
 */
export function QuickLinks({ current, onNavigate }: Props) {
  return (
    <nav className="rail" aria-label="Genvägar">
      {LINKS.map(([pageNumber, name]) => (
        <button
          key={pageNumber}
          type="button"
          className="rail__item"
          aria-current={pageNumber === current ? 'page' : undefined}
          onClick={() => onNavigate(pageNumber)}
        >
          {/* The space is real text: the flex gap gives no word break to a
              screen reader, and JSX drops the newline between two elements. */}
          <span className="rail__num">{pageNumber}</span>{' '}
          <span className="rail__name">{name}</span>
        </button>
      ))}
    </nav>
  )
}
