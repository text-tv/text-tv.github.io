import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { PageNumber } from './api.types'
import {
  CLICK_SWALLOW_MS,
  SWIPE_GUTTER_PX,
  dampedOffset,
  lockAxis,
  smoothVelocity,
  startsInGutter,
  swipeDirection,
  type Point,
} from './swipe'

const COMMIT_SNAP = 'transform 260ms cubic-bezier(.32,.94,.28,1)'
const CANCEL_SNAP = 'transform 300ms cubic-bezier(.22,1,.36,1)'
const CENTRED = 'translate3d(0px, 0, 0)'

/**
 * Where the track lands on a commit. Percentages resolve against the track's
 * own width, so nothing has to measure it.
 */
const commitTarget = (direction: 'prev' | 'next') =>
  direction === 'next'
    ? `translate3d(calc(-100% - ${SWIPE_GUTTER_PX}px), 0, 0)`
    : `translate3d(calc(100% + ${SWIPE_GUTTER_PX}px), 0, 0)`

/** The px offset a track is sitting at, as far as it can be read back. */
const offsetOf = (track: HTMLElement) => {
  // Mid-transition the computed value is a matrix; before one it is whatever
  // was written, and a calc() commit target reads back as no offset at all.
  const painted = getComputedStyle(track).transform
  const matrix = /matrix\([^)]*?,\s*(-?[\d.]+),\s*-?[\d.]+\)/.exec(painted)
  if (matrix) return Number(matrix[1])
  const written = /translate3d\((-?[\d.]+)px/.exec(track.style.transform)
  return written ? Number(written[1]) : 0
}

interface Gesture {
  pointerId: number
  start: Point
  last: Point
  /** Decided once, at the first movement past the lock, and then held. */
  axis: 'x' | 'y' | undefined
  /** Where the track already was: a gesture can start mid-snap. */
  origin: number
  /** Read once at pointerdown; re-reading it per move would force a layout. */
  width: number
  velocity: number
  lastX: number
  lastAt: number
}

interface Options {
  container: RefObject<HTMLElement | null>
  track: RefObject<HTMLElement | null>
  pageNumber: PageNumber
  prev: PageNumber | undefined
  next: PageNumber | undefined
  /** False under prefers-reduced-motion: nothing moves, the page just changes. */
  motion: boolean
  navigate: (pageNumber: PageNumber) => void
  onDragging: (dragging: boolean) => void
  /** Hands the current slot to the neighbour the commit landed on. */
  onSwap: (direction: 'prev' | 'next') => void
}

/**
 * Turns a sideways finger drag across `container` into a page change, with the
 * track following the finger while it lasts.
 *
 * Only touch pointers count: the frame's text is deliberately selectable, so a
 * mouse drag has to stay a selection. Nothing here calls preventDefault - the
 * browser keeps scrolling, pinch-zoom, selection and the OS edge gestures, and
 * `pointercancel` is the app's only notice that it took one of them.
 *
 * The whole gesture lives in a ref and is written straight to the track's
 * style: a state write per pointermove would re-render every decoded frame on
 * screen, which on a fourteen-sub-page page is the cost this feature is trying
 * to avoid paying.
 */
export function useSwipeNavigation({
  container,
  track,
  pageNumber,
  prev,
  next,
  motion,
  navigate,
  onDragging,
  onSwap,
}: Options): void {
  const gesture = useRef<Gesture | undefined>(undefined)
  const swallowTimer = useRef<number | undefined>(undefined)
  const swallow = useRef<((event: MouseEvent) => void) | undefined>(undefined)
  /** The page change the snap in flight makes when its transition ends. */
  const queued = useRef<{ page: PageNumber; direction: 'prev' | 'next' } | undefined>(undefined)
  /** Which way the swipe that is changing the page went. */
  const swapped = useRef<'prev' | 'next' | undefined>(undefined)
  /** Set when a swipe caused the page change, so the reset only runs for one. */
  const swiped = useRef(false)
  /**
   * The neighbours and navigate change with every page, but re-attaching the
   * listeners on each change would drop a gesture mid-drag; a ref keeps them
   * current instead.
   */
  const latest = useRef({ prev, next, navigate, onDragging, onSwap })
  // Not written during render, which would break React's purity contract, and
  // not in a passive effect either: those flush asynchronously, so a swipe made
  // right after a page loaded could still read the previous page's neighbours.
  useLayoutEffect(() => {
    latest.current = { prev, next, navigate, onDragging, onSwap }
  })

  /**
   * The commit transition ends the gesture; this render ends the commit. The
   * hash is applied a frame or more after `navigate`, so resetting any earlier
   * would paint the outgoing page snapped back to centre first.
   */
  useLayoutEffect(() => {
    if (!swiped.current) return
    swiped.current = false
    if (swapped.current) latest.current.onSwap(swapped.current)
    swapped.current = undefined
    const element = track.current
    if (element) {
      element.style.transition = ''
      element.style.transform = ''
    }
    latest.current.onDragging(false)
  }, [pageNumber, track])

  useEffect(() => {
    const element = container.current
    if (!element) return

    const clearSwallow = () => {
      window.clearTimeout(swallowTimer.current)
      swallowTimer.current = undefined
      if (swallow.current) document.removeEventListener('click', swallow.current, true)
      swallow.current = undefined
    }

    /**
     * A committed swipe can still be followed by a synthetic click on whatever
     * the finger lifted over. It has to be caught on the document, ahead of the
     * hotspot layer's own capture handler, which React attaches at the root.
     */
    const armSwallow = () => {
      clearSwallow()
      const listener = (event: MouseEvent) => {
        // Only the click the finger itself left behind, which lands inside the
        // element the drag happened on. Swallowing whatever came next would eat
        // a deliberate tap on the bar or the rail made within the window below.
        if (!element.contains(event.target as Node)) return
        event.stopPropagation()
        event.preventDefault()
        clearSwallow()
      }
      swallow.current = listener
      document.addEventListener('click', listener, true)
      // A browser that suppressed the click itself must not leave the listener
      // armed to eat the reader's next real tap.
      swallowTimer.current = window.setTimeout(clearSwallow, CLICK_SWALLOW_MS)
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      // A second finger aborts, and it is tested before isPrimary because that
      // second pointerdown is never the primary one: reading isPrimary first
      // would return early and leave the first finger armed to commit.
      if (gesture.current) {
        gesture.current = undefined
        return
      }
      if (!event.isPrimary) return
      // innerWidth, not visualViewport.width: clientX is relative to the layout
      // viewport, and mixing the two would swell the gutter under pinch-zoom.
      if (startsInGutter(event.clientX, window.innerWidth)) return

      const moving = track.current
      let origin = 0
      // A finger down during a snap takes the snap over: the sheet stays where
      // it is and the page change it was going to make is abandoned.
      if (motion && moving?.style.transition) {
        origin = offsetOf(moving)
        moving.style.transition = ''
        moving.style.transform = `translate3d(${origin}px, 0, 0)`
        queued.current = undefined
      }

      const point = { x: event.clientX, y: event.clientY }
      gesture.current = {
        pointerId: event.pointerId,
        start: point,
        last: point,
        axis: undefined,
        origin,
        width: moving?.clientWidth ?? 0,
        velocity: 0,
        lastX: point.x,
        lastAt: event.timeStamp,
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      const live = gesture.current
      // Carrying the last point matters on its own: some browsers report a
      // pointerup whose coordinates are stale.
      if (live?.pointerId !== event.pointerId) return
      live.last = { x: event.clientX, y: event.clientY }
      if (!motion) return

      const travel = event.clientX - live.start.x
      if (!live.axis) {
        live.axis = lockAxis(travel, event.clientY - live.start.y)
        if (!live.axis) return
        // A vertical gesture is a scroll, and is given up before the track has
        // moved a pixel.
        if (live.axis === 'y') {
          gesture.current = undefined
          return
        }
        latest.current.onDragging(true)
      }

      live.velocity = smoothVelocity(
        live.velocity,
        event.clientX - live.lastX,
        event.timeStamp - live.lastAt,
      )
      live.lastX = event.clientX
      live.lastAt = event.timeStamp

      const neighbour = travel < 0 ? latest.current.next : latest.current.prev
      const offset = live.origin + (neighbour ? travel : dampedOffset(travel, live.width))
      if (track.current) track.current.style.transform = `translate3d(${offset}px, 0, 0)`
    }

    /** The snap is over: the page change it was carrying happens now. */
    const settle = () => {
      const commit = queued.current
      queued.current = undefined
      if (commit) {
        swiped.current = true
        swapped.current = commit.direction
        latest.current.navigate(commit.page)
        return
      }
      // A cancelled snap changes no page, so nothing else will clear the track.
      const moving = track.current
      if (moving) {
        moving.style.transition = ''
        moving.style.transform = ''
      }
      latest.current.onDragging(false)
    }

    /**
     * The one way a gesture ends, whichever event brought the news. It clears
     * the gesture first, so the doubled events - the element's and the
     * window's - cost nothing.
     */
    const endGesture = (aborted: boolean) => {
      const live = gesture.current
      if (!live) return
      gesture.current = undefined

      const direction = aborted
        ? undefined
        : swipeDirection(live.start, live.last, window.innerWidth, live.velocity)
      const { prev: back, next: on } = latest.current
      const target = direction && (direction === 'prev' ? back : on)

      const moving = track.current
      if (!motion || !moving || live.axis !== 'x') {
        if (target) {
          armSwallow()
          latest.current.navigate(target)
        }
        latest.current.onDragging(false)
        return
      }

      const commit = target && direction ? { page: target, direction } : undefined
      const goal = commit ? commitTarget(commit.direction) : CENTRED
      queued.current = commit
      if (commit) armSwallow()
      moving.style.transition = commit ? COMMIT_SNAP : CANCEL_SNAP
      // A snap with nowhere to travel fires no transitionend, so it has to
      // finish itself rather than leave the page change hanging.
      if (moving.style.transform === goal) settle()
      else moving.style.transform = goal
    }

    const onPointerUp = (event: PointerEvent) => {
      if (gesture.current && gesture.current.pointerId !== event.pointerId) return
      endGesture(false)
    }

    // The browser or the OS has taken the gesture over - the app's only notice,
    // and an authoritative abort rather than a decision to weigh.
    const onPointerCancel = (event: PointerEvent) => {
      if (gesture.current && gesture.current.pointerId !== event.pointerId) return
      endGesture(true)
    }

    const onBlur = () => endGesture(true)

    element.addEventListener('pointerdown', onPointerDown, { passive: true })
    element.addEventListener('pointermove', onPointerMove, { passive: true })
    element.addEventListener('pointerup', onPointerUp, { passive: true })
    element.addEventListener('pointercancel', onPointerCancel, { passive: true })
    // A finger lifted outside .content - over the bar, or off the window
    // entirely - would otherwise leave the sheet parked off centre.
    window.addEventListener('pointerup', onPointerUp, { passive: true })
    window.addEventListener('pointercancel', onPointerCancel, { passive: true })
    window.addEventListener('blur', onBlur, { passive: true })
    const moving = track.current
    moving?.addEventListener('transitionend', settle)
    moving?.addEventListener('transitioncancel', settle)
    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('blur', onBlur)
      moving?.removeEventListener('transitionend', settle)
      moving?.removeEventListener('transitioncancel', settle)
      clearSwallow()
    }
  }, [container, track, motion])
}
