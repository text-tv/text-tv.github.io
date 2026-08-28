/**
 * The twelve keys, in the order they are laid out. Words rather than `×` and
 * `⌫` for the same reason the bar's arrows are drawn rather than typed: those
 * glyphs fall back to emoji or tofu on common Android and Windows stacks.
 */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'avbryt', '0', 'radera'] as const

/** The two keys that are words rather than digits, and read differently. */
const KEY_CLASS: Partial<Record<(typeof KEYS)[number], string>> = {
  avbryt: 'keypad__key keypad__key--cancel',
  radera: 'keypad__key keypad__key--erase',
}

interface Props {
  /** Whether the pad is up. Closed, it is out of reach of tab and of a reader. */
  open: boolean
  onPress: (key: string) => void
}

/**
 * Three digits, and nothing else - no letters, no confirm key, because the
 * third digit is the whole instruction.
 *
 * The pad stays mounted when it is closed: it is what the bar slides up to
 * reveal, and a pad that unmounted on close would leave the slide back down
 * playing over the page behind it.
 */
export function Keypad({ open, onPress }: Props) {
  return (
    <div
      className="keypad"
      role="group"
      aria-label="Knappsats"
      inert={!open}
      aria-hidden={open ? undefined : true}
    >
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className={KEY_CLASS[key] ?? 'keypad__key'}
          // The field keeps focus for the whole session: it carries the keydown
          // handler that Escape and the hardware digits arrive on, and a key
          // that took focus would take that handler out of reach. Out of the
          // tab order for the same reason - a keyboard reader types digits.
          tabIndex={-1}
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPress(key)}
        >
          {key}
        </button>
      ))}
    </div>
  )
}
