import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { PageNumber } from '../api.types'
import { Keypad, type KeypadKey } from './Keypad'

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
  /**
   * Whether the keypad is up. It is the shell's state rather than the bar's:
   * the pull gesture is locked out while the pad is showing, and the dock the
   * bar rides in is what slides. The digits typed into it stay here.
   */
  editing: boolean
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
  editing,
  onEditing,
}: Props) {
  const [typed, setTyped] = useState('')
  const id = useId()
  /** The beat between the third digit and the page change; also the lock on it. */
  const beat = useRef<number | undefined>(undefined)
  /** The field itself, so opening the keypad can take focus for the keyboard. */
  const field = useRef<HTMLButtonElement>(null)
  /**
   * Read by the effect below, which must not re-run when editing changes. Not
   * written during render: a render React discards would leave the ref
   * describing a tree that never existed.
   */
  const open = useRef(false)
  useLayoutEffect(() => {
    open.current = editing
  })

  const close = () => onEditing(false)

  /**
   * Everything the keypad leaves behind, wherever the closing came from - the
   * field, Escape, or the shell putting it away because the reader pressed a
   * control that navigates. Keeping it here rather than in `close` means no
   * caller can put the keypad away and forget the digits or the pending beat.
   */
  useEffect(() => {
    if (editing) return
    setTyped('')
    if (beat.current !== undefined) {
      clearTimeout(beat.current)
      beat.current = undefined
    }
  }, [editing])

  /**
   * A page change the field did not make and the shell did not see: the browser
   * back button, or any other hash change. The controls all close the keypad
   * themselves, so this is the last route rather than the usual one.
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

  /**
   * The one path every key takes, whether it came from the pad or from a
   * hardware keyboard - which is why it is wider than `KeypadKey`.
   */
  const press = (key: KeypadKey | string) => {
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
    onEditing(true)
    // Not left to the click: Safari and Firefox on macOS do not focus a button
    // when it is clicked, and the field's own keydown handler is the only thing
    // Escape and the hardware digits have to arrive on.
    field.current?.focus()
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
              ref={field}
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
