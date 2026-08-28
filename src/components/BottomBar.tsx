import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { PageNumber } from '../api.types'
import { Keypad } from './Keypad'

/**
 * How long the third digit stays on screen before the page changes. Short
 * enough not to feel like a wait, long enough that the reader sees the digit
 * they typed land rather than the field emptying under their thumb.
 */
const COMMIT_BEAT_MS = 90

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
  /** Whether the keypad is up. The shell locks the pull gesture out while it is. */
  onEditing: (editing: boolean) => void
}

/**
 * The few things links cannot do, within thumb reach.
 *
 * Arrows follow the payload's own neighbours, so numbers that are not
 * broadcast are skipped rather than landed on.
 *
 * One field carries the page you are on and the page you are asking for. They
 * were two controls and said the same thing twice; merged, the number you are
 * reading is the thing you tap to change it, and the keypad that rises is the
 * app's own rather than the operating system's.
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
  onEditing,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [typed, setTyped] = useState('')
  const id = useId()
  /** The beat between the third digit and the page change; also the lock on it. */
  const beat = useRef<number | undefined>(undefined)
  /** Read by the effect below, which must not re-run when editing changes. */
  const open = useRef(false)
  open.current = editing

  const close = () => {
    if (beat.current !== undefined) {
      clearTimeout(beat.current)
      beat.current = undefined
    }
    setEditing(false)
    setTyped('')
    onEditing(false)
  }

  /**
   * A page change the field did not make - a rail link, an arrow, the home
   * button, a hotspot - leaves the keypad standing over digits that no longer
   * mean anything. The field's own commit closes before it navigates, so it
   * never arrives here.
   */
  useEffect(() => {
    if (open.current) close()
    // Only the page: adding `editing` would close the keypad the moment it opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber])

  useEffect(() => () => clearTimeout(beat.current), [])

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

  /** The third digit is the whole instruction; there is no confirm key. */
  const commit = (digits: string) => {
    beat.current = window.setTimeout(() => {
      beat.current = undefined
      close()
      onNavigate(digits)
    }, COMMIT_BEAT_MS)
  }

  /** The one path every key takes, on screen or on a keyboard. */
  const press = (key: string) => {
    // The beat is short but it is not nothing, and what the reader sees during
    // it is already decided. A key arriving inside it is a tap they had not
    // seen the answer to yet.
    if (beat.current !== undefined) return
    if (key === 'avbryt') return close()
    if (key === 'radera') return setTyped((digits) => digits.slice(0, -1))
    const digits = (typed + key).slice(0, 3)
    setTyped(digits)
    if (digits.length === 3) commit(digits)
  }

  const openKeypad = () => {
    setTyped('')
    setEditing(true)
    onEditing(true)
  }

  const onFieldClick = () => (editing ? close() : openKeypad())

  const onFieldKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      if (!editing) return
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'Enter') {
      // The button's own Enter would fire a click, and the click toggles: the
      // two together would open the keypad and shut it again in one press.
      event.preventDefault()
      // Enter opens the keypad and does nothing else. There is no confirm key
      // here or on screen, because a page number is three digits and the third
      // one is the whole instruction - it has already committed by the time a
      // confirm could mean anything, and before it there is nothing to confirm.
      if (!editing) openKeypad()
      return
    }
    if (editing && event.key >= '0' && event.key <= '9') {
      event.preventDefault()
      press(event.key)
    }
  }

  return (
    <>
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
              A button, not an input: an input with a numeric mode would summon
              the operating system's keypad, which is the thing the app's own
              keypad replaces. The name is composed rather than written, so the
              number has one source - an aria-label here would override the
              text and leave a screen reader unable to say which page this is.
            */}
            <button
              type="button"
              id={id}
              className={
                editing
                  ? 'bar__page-field bar__page-field--editing'
                  : armed
                    ? 'bar__page-field bar__page-field--armed'
                    : 'bar__page-field'
              }
              aria-labelledby={`${id}-label ${id}`}
              onClick={onFieldClick}
              onKeyDown={onFieldKeyDown}
            >
              {editing ? typed : pageNumber}
              {editing && <span className="bar__caret" />}
            </button>
            <span className="visually-hidden" id={`${id}-label`}>
              {editing ? 'Gå till sida' : 'Aktuell sida'}
            </span>
            {/* Says what has been typed so far; the field's own name cannot. */}
            <span className="visually-hidden" aria-live="polite">
              {editing ? typed : ''}
            </span>
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
      <Keypad open={editing} onPress={press} />
    </>
  )
}
