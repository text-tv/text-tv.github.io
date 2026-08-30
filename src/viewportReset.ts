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

type Measurements = {
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

/** `100svh` in pixels, which no property reports and only a box can answer. */
const slotHeight = (): number => {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden'
  document.body.append(probe)
  const height = probe.getBoundingClientRect().height
  probe.remove()
  return height
}

const attempts = (): number => Number(sessionStorage.getItem(ATTEMPTS_KEY) ?? 0)

/**
 * The corrective navigation: the same page, with a parameter on it so the
 * browser has to fetch a document rather than replay the entry it has. It
 * replaces the entry rather than adding one, so Back still goes where the
 * reader expects.
 */
const renavigate = (): void => {
  sessionStorage.setItem(ATTEMPTS_KEY, String(attempts() + 1))
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

export function resetChromeViewport(): void {
  // An installed copy has no browser toolbars and cannot be in this state.
  if (window.matchMedia('(display-mode: standalone)').matches) return
  if (!window.screen) return

  const look = () => {
    if (!displaced({ viewport: window.innerHeight, screen: window.screen.height, slot: slotHeight() }))
      return false
    if (attempts() >= MAX_ATTEMPTS) return false
    renavigate()
    return true
  }

  // The resize that does this lands a frame or two after the load, so it may
  // have happened before this ran or may be about to; both are covered.
  if (look()) return
  dropMarker()
  // A load that came up right earns the next occurrence its attempts back.
  sessionStorage.removeItem(ATTEMPTS_KEY)

  const watching = setTimeout(() => window.removeEventListener('resize', onResize), WATCH_MS)
  function onResize() {
    if (look()) clearTimeout(watching)
  }
  window.addEventListener('resize', onResize)
}
