/**
 * Works around a Chrome for iOS bug by reloading the page properly once.
 *
 * Chrome draws its toolbars beside the web view and resizes the view to the
 * slot between them. On a reload of a history entry that was reached by a
 * same-document navigation - which every in-app page change is, since the
 * routing is hash-based - it skips the reset that re-seeds that bookkeeping
 * (`FullscreenWebStateObserver::DidFinishNavigation` in Chrome's iOS source
 * resets only when the navigation changes document). The view is left at the
 * full height of the screen while the toolbars are still drawn over it, so the
 * shell is laid out from behind the address bar and ends a toolbar's height
 * above the bottom of what is visible.
 *
 * Nothing in the page can correct it: the offset lives in Chrome's own
 * geometry, safe-area insets and the visual viewport all report zero, and
 * every rect the page can measure agrees with itself. Rotating the phone or
 * locking it clears the state, and so does any navigation that changes
 * document - which is the one of those a page can perform for itself.
 *
 * Safari, Brave, Android and an installed copy are unaffected and never take
 * this path.
 */

/** The parameter that makes the corrective navigation change document. */
const MARKER = 'omritad'

/** Attempts made this session, so a device this does not help cannot loop. */
const ATTEMPTS_KEY = 'texttv:omritad'

/** Two: one for the bug, one for a reload that lands on it again. */
const MAX_ATTEMPTS = 2

/** How long after boot the resize is still worth watching for, in ms. */
const WATCH_MS = 3000

/**
 * How much shorter than the viewport the slot has to measure. The gap is a
 * status bar and two toolbars - about two hundred - and anything under fifty
 * is a phone whose chrome is genuinely out of the way.
 */
const SLOT_MARGIN_PX = 50

/** What the page can find out about where it has been put. */
export type Measurements = {
  /** What the page is told its viewport is. */
  viewport: number
  /** The whole screen, toolbars included. */
  screen: number
  /** What `100svh` resolves to: the slot the browser actually shows. */
  slot: number
}

/**
 * Whether the viewport is the whole screen while the slot is still a slot.
 *
 * Both halves are needed. A viewport the size of the screen is ordinary once
 * the toolbars have scrolled away, and a slot shorter than the viewport is
 * ordinary while they are on their way out; only the two together mean the
 * page has been handed the screen it cannot see all of.
 */
export const displaced = ({ viewport, screen, slot }: Measurements): boolean =>
  Math.abs(viewport - screen) <= 2 && viewport - slot > SLOT_MARGIN_PX

/**
 * What to do about it, decided apart from the doing so it can be read and
 * tested as a table: correct it, leave it alone, or stop trying.
 */
export type Verdict = 'renavigate' | 'settle' | 'give-up'

export function decide(state: {
  standalone: boolean
  measurements: Measurements
  attempts: number
}): Verdict {
  // An installed copy has no browser toolbars and cannot be in this state.
  if (state.standalone) return 'settle'
  if (!displaced(state.measurements)) return 'settle'
  // Two tries, then live with it: a device this does not help must not spend
  // the session reloading.
  return state.attempts < MAX_ATTEMPTS ? 'renavigate' : 'give-up'
}

/** `100svh` in pixels, which no property reports and only a box can answer. */
const slotHeight = (): number => {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden'
  document.body.append(probe)
  const height = probe.getBoundingClientRect().height
  probe.remove()
  return height
}

/*
 * Storage can throw rather than answer - a browser told to block it, an
 * embedded view, a locked-down profile - and this runs before the first
 * render, where an exception would leave the reader a blank page. A session
 * that cannot count its attempts gets one and only one.
 */
const attempts = (): number => {
  try {
    return Number(sessionStorage.getItem(ATTEMPTS_KEY) ?? 0)
  } catch {
    return MAX_ATTEMPTS - 1
  }
}

const rememberAttempt = (): void => {
  try {
    sessionStorage.setItem(ATTEMPTS_KEY, String(attempts() + 1))
  } catch {
    // Then it is not remembered, and the reader gets one attempt per load.
  }
}

const forgetAttempts = (): void => {
  try {
    sessionStorage.removeItem(ATTEMPTS_KEY)
  } catch {
    // Nothing was stored to forget.
  }
}

/**
 * The corrective navigation: the same page, with a parameter on it so the
 * browser has to fetch a document rather than replay the entry it has. It
 * replaces the entry rather than adding one, so Back still goes where the
 * reader expects.
 */
const renavigate = (): void => {
  rememberAttempt()
  const url = new URL(window.location.href)
  url.searchParams.set(MARKER, String(Date.now()))
  window.location.replace(url.toString())
}

/** The marker has done its work by the time the page is running; take it off. */
const dropMarker = (): void => {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(MARKER)) return
  url.searchParams.delete(MARKER)
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

/** As index.html reads it: iOS answers one of the two, depending on its age. */
const installed = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  Boolean((window.navigator as { standalone?: boolean }).standalone)

/**
 * `?nofix` in the query stands the workaround down.
 *
 * The correction hides the bug rather than ending it, and a hidden bug cannot
 * be looked at: the state this browser gets into is only observable on a phone
 * and only until the page renavigates. So there is a way to ask for it back -
 * to see whether a Chrome flag or a Chrome release changes the behaviour, and
 * to find out whether this is still earning its place.
 */
const standDownAsked = () => new URLSearchParams(window.location.search).has('nofix')

export function resetChromeViewport(): void {
  if (!window.screen || standDownAsked()) return

  const look = () => {
    const verdict = decide({
      standalone: installed(),
      measurements: {
        viewport: window.innerHeight,
        screen: window.screen.height,
        slot: slotHeight(),
      },
      attempts: attempts(),
    })
    if (verdict === 'renavigate') renavigate()
    return verdict
  }

  // The resize that does this lands a frame or two after the load, so it may
  // have happened before this ran or may be about to; both are covered.
  const first = look()
  if (first === 'renavigate') return
  if (first === 'settle') {
    dropMarker()
    // A load that came up right earns the next occurrence its attempts back.
    forgetAttempts()
  }

  const watching = setTimeout(() => window.removeEventListener('resize', onResize), WATCH_MS)
  function onResize() {
    if (look() === 'renavigate') clearTimeout(watching)
  }
  window.addEventListener('resize', onResize)
}
