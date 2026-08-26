import { useState, type ChangeEvent } from 'react'
import type { PageNumber } from '../api.types'

interface Props {
  pageNumber: PageNumber
  prev: PageNumber | undefined
  next: PageNumber | undefined
  /** True while the current page's own neighbours are still on their way. */
  pending: boolean
  onNavigate: (pageNumber: PageNumber) => void
  onHome: () => void
}

/**
 * The few things links cannot do, within thumb reach.
 *
 * Arrows follow the payload's own neighbours, so numbers that are not
 * broadcast are skipped rather than landed on.
 */
export function BottomBar({ pageNumber, prev, next, pending, onNavigate, onHome }: Props) {
  const [typed, setTyped] = useState('')

  /**
   * An arrow with no target is either absent - the page has no such neighbour
   * - or merely pending, waiting on a page still loading. Only the absent one
   * takes the native `disabled`: disabling a focused button drops focus to
   * `<body>`, and a bar arrow is one of the ways into that loading window.
   */
  const arrow = (target: PageNumber | undefined) =>
    target
      ? { onClick: () => onNavigate(target) }
      : pending
        ? { 'aria-disabled': true, onClick: () => {} }
        : { disabled: true }

  const onType = (event: ChangeEvent<HTMLInputElement>) => {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 3)
    setTyped(digits)
    // The third digit is the whole instruction; no confirm button, and the
    // blur dismisses the keypad without the reader asking for it.
    if (digits.length === 3) {
      event.target.blur()
      setTyped('')
      onNavigate(digits)
    }
  }

  return (
    <nav className="bar" aria-label="Sidnavigering">
      <div className="bar__inner">
        <input
          className="bar__input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          value={typed}
          onChange={onType}
          placeholder="000"
          aria-label="Gå till sida"
        />
        <button
          type="button"
          className="bar__button"
          aria-label="Föregående sida"
          {...arrow(prev)}
        >
          ◀
        </button>
        <span className="bar__page" aria-label="Aktuell sida">
          {pageNumber}
        </span>
        <button type="button" className="bar__button" aria-label="Startsida 100" onClick={onHome}>
          ⌂
        </button>
        <button
          type="button"
          className="bar__button"
          aria-label="Nästa sida"
          {...arrow(next)}
        >
          ▶
        </button>
      </div>
    </nav>
  )
}
