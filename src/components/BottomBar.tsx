import { useState, type ChangeEvent } from 'react'
import type { PageNumber } from '../api.types'

interface Props {
  pageNumber: PageNumber
  prev: PageNumber | undefined
  next: PageNumber | undefined
  /**
   * True while a sideways drag has passed the distance a commit needs: the
   * page number on screen is about to be wrong.
   */
  armed: boolean
  /** True while the current page has not said what lies either side of it. */
  pending: boolean
  /** True while a fetch the reader asked for is in flight. */
  refreshing: boolean
  onNavigate: (pageNumber: PageNumber) => void
  onHome: () => void
  onRefresh: () => void
}

/**
 * The few things links cannot do, within thumb reach.
 *
 * Arrows follow the payload's own neighbours, so numbers that are not
 * broadcast are skipped rather than landed on.
 */
export function BottomBar({
  pageNumber,
  prev,
  next,
  armed,
  pending,
  refreshing,
  onNavigate,
  onHome,
  onRefresh,
}: Props) {
  const [typed, setTyped] = useState('')

  /**
   * How a control says "not now" without dropping the reader's focus.
   *
   * Never the native `disabled`: disabling a focused button moves focus to
   * `<body>`, and every control that uses this is one the reader may be
   * holding when it becomes unavailable - an arrow into a loading window, or
   * the refresh button whose own tap started the wait.
   */
  const holding = { 'aria-disabled': true, onClick: () => {} }

  /**
   * An arrow with no target is either absent - the page has no such neighbour
   * - or merely pending, waiting on a page still loading. Only the absent one
   * takes the native `disabled`; nobody is waiting on a neighbour that does
   * not exist.
   */
  const arrow = (target: PageNumber | undefined) =>
    target ? { onClick: () => onNavigate(target) } : pending ? holding : { disabled: true }

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
        <span
          className={armed ? 'bar__page bar__page--armed' : 'bar__page'}
          aria-label="Aktuell sida"
        >
          {pageNumber}
        </span>
        <button type="button" className="bar__button" aria-label="Startsida 100" onClick={onHome}>
          ⌂
        </button>
        {/*
          Beside home rather than out on an edge: both act on *this* page, where
          the arrows move between pages.
        */}
        <button
          type="button"
          className="bar__button bar__button--refresh"
          aria-label="Uppdatera sidan"
          {...(refreshing ? holding : { onClick: onRefresh })}
        >
          ↻
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
