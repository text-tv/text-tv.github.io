import type { ErrorResult } from '../api.types'

interface Props {
  result: ErrorResult
  onRetry: () => void
}

/** Reads differently from a page that is not broadcast: retry, don't renumber. */
export function TransportError({ result, onRetry }: Props) {
  return (
    <div className="message message--error">
      <p className="message__text">Kunde inte hämta sidan</p>
      <p className="message__detail">Kontrollera anslutningen. ({result.message})</p>
      <div className="message__actions">
        <button type="button" onClick={onRetry}>
          Försök igen
        </button>
      </div>
    </div>
  )
}
