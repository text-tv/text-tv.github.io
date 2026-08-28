import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { PageNumber } from './api.types'
import {
  CLICK_SWALLOW_MS,
  PULL_STRIP_PX,
  PULL_THRESHOLD_PX,
  SWIPE_ARM_RELEASE,
  SWIPE_GUTTER_PX,
  SWIPE_MIN_DISTANCE,
  dampedOffset,
  lockAxis,
  pullOffset,
  pullProgress,
  smoothVelocity,
  startsInGutter,
  swipeDirection,
  translationOf,
  type Point,
} from './swipe'

const COMMIT_SNAP = 'transform 260ms cubic-bezier(.32,.94,.28,1)'
const CANCEL_SNAP = 'transform 300ms cubic-bezier(.22,1,.36,1)'
const CENTRED = 'translate3d(0px, 0, 0)'

/** Release past the threshold: out to the parked strip, and hold there. */
const PULL_SNAP_IN = 'transform 200ms cubic-bezier(.32,.94,.28,1)'
/** Released short of it: back up, having acknowledged the gesture. */
const PULL_SNAP_BACK = 'transform 280ms cubic-bezier(.22,1,.36,1)'
/**
 * The payload landed: the strip has said what it had to say.
 *
 * Same curve as `CANCEL_SNAP` today, and deliberately not shared with it: that
 * one ends a sideways drag the reader abandoned, this one ends a wait that
 * finished. The design names them separately and either can be retimed without
 * the other following it.
 */
const PULL_CLOSE = 'transform 300ms cubic-bezier(.22,1,.36,1)'

/**
 * What the strip is saying.
 *
 * There is deliberately no separate `closing`: the state stays `fetching`
 * until the strip has finished sliding away, which is what keeps the label
 * reading `HÄMTAR nnn…` on the way out rather than reverting to an instruction
 * the reader is no longer being asked to follow.
 */
export type PullState = 'idle' | 'below' | 'armed' | 'fetching'

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
  // Mid-transition the painted value is where the sheet actually is, which is
  // the whole point of asking; what was written is only the target.
  const painted = getComputedStyle(track).transform
  return translationOf(painted) ?? translationOf(track.style.transform) ?? 0
}

interface Gesture {
  pointerId: number
  start: Point
  last: Point
  /** Decided once, at the first movement past the lock, and then held. */
  axis: 'x' | 'y' | undefined
  /**
   * Recorded rather than acted on at pointerdown. The gutter belongs to the
   * horizontal axis - it is where the OS arms its own back gesture - so
   * refusing the whole touch there would take the downward pull with it, and
   * on a 390px phone that is the outer quarter of the screen.
   */
  startedInGutter: boolean
  /** A downward drag from the top of the page: this one opens the strip. */
  pull: boolean
  /**
   * Whether this gesture grabbed a snap that was still running. If it then
   * turns out not to be a sideways gesture at all, the snap it abandoned has
   * to be finished by hand - nothing else is left to do it.
   */
  tookOver: boolean
  /** Whether the strip is far enough open that a release would fetch. */
  armed: boolean
  /**
   * Whether a sideways drag has passed the distance a commit needs. The pull's
   * `armed` above is the same question for the other axis; the two are separate
   * fields because a gesture locks to one axis and never reports on both.
   */
  past: boolean
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
  /** The wrapper the vertical pull translates; never the swipe track itself. */
  pullTrack: RefObject<HTMLElement | null>
  /** The strip's fill rule, scaled per frame while the finger is down. */
  pullFill: RefObject<HTMLElement | null>
  pageNumber: PageNumber
  prev: PageNumber | undefined
  next: PageNumber | undefined
  /** False under prefers-reduced-motion: nothing moves, the page just changes. */
  motion: boolean
  /** True while a fetch the reader asked for is in flight; locks the pull out. */
  refreshing: boolean
  navigate: (pageNumber: PageNumber) => void
  onDragging: (dragging: boolean) => void
  /**
   * The sideways drag has passed - or fallen back inside - the distance a
   * commit needs, so the page number on screen is about to be wrong.
   */
  onArmed: (armed: boolean) => void
  /** Hands the current slot to the neighbour the commit landed on. */
  onSwap: (direction: 'prev' | 'next') => void
  onPullState: (state: PullState) => void
  /** A pull released past the threshold: ask SVT for the page again. */
  onRefresh: () => void
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
  pullTrack,
  pullFill,
  pageNumber,
  prev,
  next,
  motion,
  refreshing,
  navigate,
  onDragging,
  onArmed,
  onSwap,
  onPullState,
  onRefresh,
}: Options): void {
  const gesture = useRef<Gesture | undefined>(undefined)
  const swallowTimer = useRef<number | undefined>(undefined)
  const swallow = useRef<((event: MouseEvent) => void) | undefined>(undefined)
  /** The page change the snap in flight makes when its transition ends. */
  const queued = useRef<{ page: PageNumber; direction: 'prev' | 'next' } | undefined>(undefined)
  /**
   * Which way the swipe that is changing the page went, and the signal that a
   * swipe is what changed it: an ordinary navigation leaves this undefined and
   * the reset below stays out of its way.
   */
  const swapped = useRef<'prev' | 'next' | undefined>(undefined)
  /**
   * The neighbours and navigate change with every page, but re-attaching the
   * listeners on each change would drop a gesture mid-drag; a ref keeps them
   * current instead.
   */
  const latest = useRef({
    pageNumber,
    prev,
    next,
    refreshing,
    navigate,
    onDragging,
    onArmed,
    onSwap,
    onPullState,
    onRefresh,
  })
  // Not written during render, which would break React's purity contract, and
  // not in a passive effect either: those flush asynchronously, so a swipe made
  // right after a page loaded could still read the previous page's neighbours.
  useLayoutEffect(() => {
    latest.current = {
      pageNumber,
      prev,
      next,
      refreshing,
      navigate,
      onDragging,
      onArmed,
      onSwap,
      onPullState,
      onRefresh,
    }
  })

  /**
   * The commit transition ends the gesture; this render ends the commit. The
   * hash is applied a frame or more after `navigate`, so resetting any earlier
   * would paint the outgoing page snapped back to centre first.
   */
  useLayoutEffect(() => {
    const direction = swapped.current
    if (!direction) return
    swapped.current = undefined
    // The rotation always happens: it is what makes the neighbour's own
    // decoded sheet the current one.
    latest.current.onSwap(direction)
    // The reset does not, when a new gesture has already grabbed the track in
    // the frames the hash took to land. Wiping the transform there would
    // snatch the sheet back from under the finger and unmount the neighbours
    // it is dragging toward, with nothing left to mount them again.
    if (gesture.current) return
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
        // Ending it rather than forgetting it: a second finger arriving after
        // the axis locked would otherwise leave the sheet parked wherever the
        // first one left it, with the neighbours still mounted.
        endGesture(true)
        return
      }
      if (!event.isPrimary) return

      const moving = track.current
      let origin = 0
      let tookOver = false
      // A finger down during a snap takes the snap over: the sheet stays where
      // it is and the page change it was going to make is abandoned.
      // A touch in the gutter must not take a snap over: it can never become a
      // sideways gesture, so it would abandon the page change that snap was
      // carrying and put nothing in its place.
      if (motion && moving?.style.transition && !startsInGutter(event.clientX, window.innerWidth)) {
        origin = offsetOf(moving)
        moving.style.transition = ''
        moving.style.transform = `translate3d(${origin}px, 0, 0)`
        queued.current = undefined
        tookOver = true
      }

      const point = { x: event.clientX, y: event.clientY }
      gesture.current = {
        pointerId: event.pointerId,
        start: point,
        last: point,
        axis: undefined,
        // innerWidth, not visualViewport.width: clientX is relative to the
        // layout viewport, and mixing the two would swell the gutter under
        // pinch-zoom. Recorded now and applied at the axis lock, so a pull can
        // still start here.
        startedInGutter: startsInGutter(event.clientX, window.innerWidth),
        pull: false,
        armed: false,
        past: false,
        tookOver,
        origin,
        width: moving?.clientWidth ?? 0,
        velocity: 0,
        lastX: point.x,
        lastAt: event.timeStamp,
      }
    }

    /**
     * Hands the swipe track back when a gesture that took a snap over turns
     * out not to be a sideways one after all.
     *
     * Without this the sheet stays frozen wherever the takeover parked it,
     * with the page change it was carrying already abandoned and no snap left
     * in flight to fire `settle`. Reachable two ways now: a touch in the edge
     * gutter, which used to be refused before it could take anything over, and
     * a downward drag that becomes a pull.
     */
    const releaseTrack = (live: Gesture) => {
      if (!live.tookOver) return
      const moving = track.current
      if (moving) {
        moving.style.transition = motion ? CANCEL_SNAP : ''
        moving.style.transform = CENTRED
      }
      latest.current.onDragging(false)
    }

    /** Puts the strip away, and says so once it has finished going. */
    const closePull = (transition: string) => {
      // The fill promises how close a release is to arming. Once the gesture
      // has been decided there is nothing left to promise, so it goes at the
      // same moment the finger lifts rather than riding the snap back out.
      if (pullFill.current) pullFill.current.style.transform = 'scaleX(0)'
      const strip = pullTrack.current
      if (!strip) {
        latest.current.onPullState('idle')
        return
      }
      strip.style.transition = transition
      strip.style.transform = ''
      // A close with no transition fires no transitionend, so nothing else
      // would ever retire the label.
      if (!transition) latest.current.onPullState('idle')
    }

    const onPointerMove = (event: PointerEvent) => {
      const live = gesture.current
      // Carrying the last point matters on its own: some browsers report a
      // pointerup whose coordinates are stale.
      if (live?.pointerId !== event.pointerId) return
      live.last = { x: event.clientX, y: event.clientY }

      const travel = event.clientX - live.start.x
      const drop = event.clientY - live.start.y
      // The lock runs in both motion modes. It used to sit below the reduced-
      // motion return, which is why a reduced-motion gesture never had an axis
      // at all - harmless while every vertical drag was abandoned, but the pull
      // has to know which gesture it is before it can decide anything.
      if (!live.axis) {
        live.axis = lockAxis(travel, drop)
        if (!live.axis) return
        if (live.axis === 'y') {
          // Downward, from the top of the page, with no reader refresh already
          // running: this one is a pull. Every other vertical gesture is a
          // scroll and is given up before anything has moved a pixel - upward
          // always, and downward when there is page above to scroll back to.
          const sheet = track.current?.querySelector('.swipe-sheet--current')
          const atTop = (sheet?.scrollTop ?? 0) === 0
          if (drop <= 0 || !atTop || latest.current.refreshing) {
            gesture.current = undefined
            releaseTrack(live)
            return
          }
          live.pull = true
          releaseTrack(live)
          latest.current.onPullState('below')
        } else {
          // The gutter is the horizontal axis's problem: it is where the OS
          // arms its own back gesture, and the app cannot cancel that.
          if (live.startedInGutter) {
            gesture.current = undefined
            releaseTrack(live)
            return
          }
          // Only when something is going to move: the neighbouring sheets are
          // mounted to be dragged toward, and under reduced motion the page
          // simply changes. The lock itself still runs, which is new - it is
          // what lets the pull below know which gesture it is in either mode.
          if (motion) latest.current.onDragging(true)
        }
      }

      // Under reduced motion nothing follows the finger; the release still
      // decides, from where the finger actually is.
      if (!motion) return

      if (live.pull) {
        const offset = pullOffset(drop)
        const armed = offset >= PULL_THRESHOLD_PX
        if (pullTrack.current) {
          pullTrack.current.style.transition = ''
          pullTrack.current.style.transform = `translate3d(0, ${offset}px, 0)`
        }
        if (pullFill.current) {
          pullFill.current.style.transform = `scaleX(${pullProgress(offset)})`
        }
        // Only when the label would actually change: a state write per move
        // would re-render every decoded frame on screen, which is the cost the
        // direct writes above exist to avoid.
        if (armed !== live.armed) {
          live.armed = armed
          latest.current.onPullState(armed ? 'armed' : 'below')
        }
        return
      }

      live.velocity = smoothVelocity(
        live.velocity,
        event.clientX - live.lastX,
        event.timeStamp - live.lastAt,
      )
      live.lastX = event.clientX
      live.lastAt = event.timeStamp

      const neighbour = travel < 0 ? latest.current.next : latest.current.prev

      // The distance floor only. `swipeDirection` also commits a short flick,
      // but from a release velocity that does not exist yet, so no mid-drag
      // answer can be exact - and the same state-write-per-move cost the pull's
      // label avoids applies here, which is why this fires only on a crossing.
      //
      // A drag toward a side with no neighbour is going nowhere however far it
      // travels, so the page number it would dim is not about to be wrong. The
      // release distance is what keeps a finger parked on the threshold from
      // crossing it over and over.
      const past =
        !!neighbour &&
        Math.abs(travel) >= (live.past ? SWIPE_MIN_DISTANCE - SWIPE_ARM_RELEASE : SWIPE_MIN_DISTANCE)
      if (past !== live.past) {
        live.past = past
        latest.current.onArmed(past)
      }

      const offset = live.origin + (neighbour ? travel : dampedOffset(travel, live.width))
      if (track.current) track.current.style.transform = `translate3d(${offset}px, 0, 0)`
    }

    /** The snap is over: the page change it was carrying happens now. */
    const settle = () => {
      // Taking a snap over clears its transition, and clearing a running
      // transition fires transitioncancel - this very handler. A gesture is
      // live at that moment, and it owns the track now.
      if (gesture.current) return
      const commit = queued.current
      queued.current = undefined
      if (commit) {
        swapped.current = commit.direction
        latest.current.navigate(commit.page)
        return
      }
      // A commit that already settled owns the track until its render lands:
      // the offset is held on purpose, and clearing it here would paint the
      // outgoing page snapped back to centre.
      if (swapped.current) return
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
      // Whatever ends the gesture - commit, cancel, or an abort from one of the
      // rescue listeners - the page number is no longer about to change.
      if (live.past) latest.current.onArmed(false)

      if (live.pull) {
        // Measured from where the finger ended rather than from what was
        // written per move: under reduced motion nothing was written.
        const offset = pullOffset(live.last.y - live.start.y)
        // An abort is authoritative - the browser or the OS took the gesture -
        // and this is also the path every rescue listener arrives on, which is
        // what keeps the sheet from parking 44px down with nothing to close it.
        if (aborted || offset < PULL_THRESHOLD_PX || latest.current.refreshing) {
          closePull(motion ? PULL_SNAP_BACK : '')
          return
        }
        latest.current.onPullState('fetching')
        const strip = pullTrack.current
        if (strip) {
          strip.style.transition = motion ? PULL_SNAP_IN : ''
          strip.style.transform = `translate3d(0, ${PULL_STRIP_PX}px, 0)`
        }
        latest.current.onRefresh()
        return
      }

      const direction = aborted
        ? undefined
        : swipeDirection(live.start, live.last, window.innerWidth, live.velocity)
      const { prev: back, next: on } = latest.current
      const named = direction && (direction === 'prev' ? back : on)
      // A neighbour can name the page already on screen - the held pair still
      // points at a page the reader swiped onto while it was loading. Treating
      // it as a target would commit to where the sheet already is, navigate
      // would no-op on the matching hash, and the page number would never
      // change, so the effect that resets the track would never run: parked
      // off-centre with nothing left to bring it back.
      const target = named === latest.current.pageNumber ? undefined : named

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

    /**
     * A hidden tab may deliver neither transitionend nor transitioncancel, so
     * whatever was in flight has to be finished by hand rather than left frozen
     * at the commit offset with the page change never made. Blur is no help:
     * the finger has already lifted by then, and endGesture returns.
     */
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') return
      // A snap is in flight exactly when the track carries a transition - the
      // same test a new grab uses. queued alone would miss a cancel snap.
      if (!gesture.current && !track.current?.style.transition) return
      // Together, not alone: a lifted finger makes endGesture a no-op, and a
      // finger still down makes settle refuse the track. The pair turns a live
      // gesture into a cancelled snap and then finishes it.
      endGesture(true)
      settle()
    }

    element.addEventListener('pointerdown', onPointerDown, { passive: true })
    element.addEventListener('pointermove', onPointerMove, { passive: true })
    element.addEventListener('pointerup', onPointerUp, { passive: true })
    element.addEventListener('pointercancel', onPointerCancel, { passive: true })
    // A finger lifted outside .content - over the bar, or off the window
    // entirely - would otherwise leave the sheet parked off centre.
    window.addEventListener('pointerup', onPointerUp, { passive: true })
    window.addEventListener('pointercancel', onPointerCancel, { passive: true })
    window.addEventListener('blur', onBlur, { passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange, { passive: true })
    /**
     * The strip has finished moving. Only a close retires the label - a snap
     * *in* also ends a transition here, and it leaves the strip parked at 44px
     * with a fetch still running, which is the one moment the label matters.
     */
    const pullSettled = () => {
      if (gesture.current) return
      const strip = pullTrack.current
      if (!strip || strip.style.transform) return
      latest.current.onPullState('idle')
    }

    /**
     * Transitions bubble, and the changed-row marks put one inside both of
     * these subtrees for the first time: a mark fading out would otherwise
     * finish a snap that is still running, or retire the strip's label while
     * it is still saying what is being fetched. Only the element the hook
     * itself animates may answer for it.
     */
    const ownTransition = (element: HTMLElement | null, run: () => void) => (event: Event) => {
      if (event.target !== element) return
      run()
    }

    const moving = track.current
    const onTrackTransition = ownTransition(moving, settle)
    moving?.addEventListener('transitionend', onTrackTransition)
    moving?.addEventListener('transitioncancel', onTrackTransition)
    const strip = pullTrack.current
    const onStripTransition = ownTransition(strip, pullSettled)
    strip?.addEventListener('transitionend', onStripTransition)
    strip?.addEventListener('transitioncancel', onStripTransition)
    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      moving?.removeEventListener('transitionend', onTrackTransition)
      moving?.removeEventListener('transitioncancel', onTrackTransition)
      strip?.removeEventListener('transitionend', onStripTransition)
      strip?.removeEventListener('transitioncancel', onStripTransition)
      clearSwallow()
    }
  }, [container, track, pullTrack, pullFill, motion])

  /** What `refreshing` was last render, so its falling edge can be spotted. */
  const wasRefreshing = useRef(refreshing)

  /**
   * The payload landed: put the strip away.
   *
   * Before writing anything it asks who owns the element now. A reader can
   * have started a new gesture in the frames the response took to arrive, and
   * wiping the transform under them would snatch the sheet back mid-drag -
   * the same question `settle` answers on the other axis, for the same reason.
   */
  useLayoutEffect(() => {
    const was = wasRefreshing.current
    wasRefreshing.current = refreshing
    if (!was || refreshing) return
    // Only a pull owns this element. Bailing for *any* live gesture would drop
    // the closing edge for good - a tap on a hotspot is a live gesture, and
    // nothing re-arms this - leaving the strip parked 44px down for the rest of
    // the session. A pull cannot be live here anyway: one is locked out while a
    // refresh runs, and the pull that started this one ended before it asked.
    if (gesture.current?.pull) return
    // Nothing to close: the refresh came from the bar button, which never
    // opened the strip.

    const strip = pullTrack.current
    if (!strip?.style.transform) return
    // `refreshing` already carries its own minimum (see useTextTv), so by the
    // time it falls the strip has been on screen long enough to have been read.
    strip.style.transition = motion ? PULL_CLOSE : ''
    strip.style.transform = ''
    if (!motion) latest.current.onPullState('idle')
  }, [refreshing, motion, pullTrack])
}
