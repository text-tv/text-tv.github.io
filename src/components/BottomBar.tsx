import { useState, type ChangeEvent, type KeyboardEvent } from 'react'
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
 *
 * One field carries the page you are on and the page you are asking for. They
 * were two controls and said the same thing twice; merged, the number you are
 * reading is the thing you tap to change it. The keyboard that answers the tap
 * is the operating system's own - a phone already has a good numeric keypad,
 * and this app has no business drawing a second one.
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
  /** Whether the reader is typing. Focus is the whole state; nothing mirrors it. */
  const [focused, setFocused] = useState(false)
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
    // blur takes the keyboard away without the reader asking for it.
    if (digits.length === 3) {
      event.target.blur()
      onNavigate(digits)
    }
  }

  /** Abandoning an entry from a keyboard, where there is nothing to tap. */
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.currentTarget.blur()
  }

  return (
    <nav className="bar" aria-label="Sidnavigering">
      <div className="bar__inner">
        <button type="button" className="bar__arrow" aria-label="Föregående sida" {...arrow(prev)}>
          <span className="bar__glyph bar__glyph--prev" />
        </button>
        {/*
          Home and refresh act on *this* page, where the arrows move between
          pages; they belong beside the number rather than out on the edges.
        */}
        <div className="bar__centre">
          <button type="button" className="bar__button" aria-label="Startsida 100" onClick={onHome}>
            <span className="bar__glyph bar__glyph--home" />
          </button>
          {/*
            One name for both jobs. It cannot say "current page", because the
            same box takes the page being asked for a moment later - and on an
            input the number is the accessible *value*, so a name claiming to
            report where you are would be read against a number that is where
            you are going.

            No placeholder: a ghosted 000 behind a half-typed number reads as a
            mistake, which is why the design dropped it.
          */}
          <input
            className={armed ? 'bar__page-field bar__page-field--armed' : 'bar__page-field'}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            value={focused ? typed : pageNumber}
            onFocus={() => {
              setFocused(true)
              setTyped('')
            }}
            // No need to clear the digits here: an unfocused field shows the
            // page number whatever they are, and focusing again starts empty.
            onBlur={() => setFocused(false)}
            onChange={onType}
            onKeyDown={onKeyDown}
            aria-label="Sida"
          />
          <button
            type="button"
            className="bar__button bar__button--refresh"
            aria-label="Uppdatera sidan"
            {...(refreshing ? holding : { onClick: onRefresh })}
          >
            ↻
          </button>
        </div>
        <button type="button" className="bar__arrow" aria-label="Nästa sida" {...arrow(next)}>
          <span className="bar__glyph bar__glyph--next" />
        </button>
      </div>
    </nav>
  )
}
