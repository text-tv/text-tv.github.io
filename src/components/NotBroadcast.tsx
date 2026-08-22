import type { NotBroadcastResult, PageNumber } from '../api.types'

interface Props {
  result: NotBroadcastResult
  onNavigate: (pageNumber: PageNumber) => void
}

/** SVT's own wording for a page number that carries nothing. */
export function NotBroadcast({ result, onNavigate }: Props) {
  const neighbours = [result.prev, result.next].filter(
    (page): page is PageNumber => page !== undefined,
  )

  return (
    <div className="message">
      <p className="message__text">Sidan ej i sändning</p>
      <p className="message__detail">Sida {result.pageNumber}</p>
      {neighbours.length > 0 && (
        <div className="message__actions">
          {neighbours.map((page) => (
            <button key={page} type="button" onClick={() => onNavigate(page)}>
              Sida {page}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
