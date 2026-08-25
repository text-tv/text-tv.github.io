/**
 * The tunable numbers behind the sideways page gesture.
 *
 * `SWIPE_MIN_DISTANCE` and `SWIPE_AXIS_RATIO` are the slow half of the commit
 * rule: a drag counts once it has travelled far enough and is clearly more
 * sideways than not. Distance is absolute pixels rather than a share of the
 * viewport because a finger's travel does not grow with the screen.
 *
 * `SWIPE_FLICK_VELOCITY` and `SWIPE_FLICK_MIN_DISTANCE` are the fast half: a
 * short quick throw reads as intent even when it never reaches 60px. The
 * distance floor keeps a jittery tap from committing at a high sampled speed.
 *
 * `SWIPE_AXIS_LOCK` is how far a finger moves before the gesture decides which
 * way it is going. Below it nothing is committed either way, so a touch that
 * has barely moved does not steal the scroll.
 *
 * `EDGE_GUTTER` is dead space along both sides. Neither iOS nor Android lets
 * an installed PWA cancel the system's back gesture, so the only workable
 * answer is to stay out of its way: iOS arms roughly the outer 20-30 pt and
 * Android's inset is 24 dp, adjustable to 40 dp.
 *
 * `SWIPE_GUTTER_PX` is the black gap between two sheets, and the single source
 * for that number — the stylesheet reads it through a custom property.
 *
 * `SWIPE_DAMP_RATIO` and `SWIPE_DAMP_CEILING` shape the end of the run: past
 * the last page the sheet still moves, at under half the finger's travel and
 * never further than a sixth of the track. It acknowledges the gesture and
 * declines it.
 *
 * `CLICK_SWALLOW_MS` covers the synthetic click a browser can still deliver
 * up to ~300 ms after touchend, while staying short enough that a deliberate
 * follow-up tap gets through.
 */
export const SWIPE_MIN_DISTANCE = 60
export const SWIPE_AXIS_RATIO = 1.5
export const SWIPE_FLICK_VELOCITY = 0.5
export const SWIPE_FLICK_MIN_DISTANCE = 12
export const SWIPE_AXIS_LOCK = 6
export const EDGE_GUTTER = 44
export const SWIPE_GUTTER_PX = 14
export const SWIPE_DAMP_RATIO = 0.42
export const SWIPE_DAMP_CEILING = 0.16
export const CLICK_SWALLOW_MS = 400

export interface Point {
  x: number
  y: number
}

/**
 * Whether a touch landed in the dead space along either side, where the
 * system's own back gesture lives.
 */
export function startsInGutter(x: number, viewportWidth: number): boolean {
  return x < EDGE_GUTTER || x > viewportWidth - EDGE_GUTTER
}

/**
 * Which way a drag is going, once it has moved far enough to say.
 *
 * `undefined` means it has not moved far enough yet; the caller keeps asking.
 */
export function lockAxis(dx: number, dy: number): 'x' | 'y' | undefined {
  if (Math.abs(dx) < SWIPE_AXIS_LOCK && Math.abs(dy) < SWIPE_AXIS_LOCK) return undefined
  return Math.abs(dx) >= SWIPE_AXIS_RATIO * Math.abs(dy) ? 'x' : 'y'
}

/**
 * Carries a running horizontal speed in px/ms, weighted towards the newest
 * sample so a flick at the very end of a slow drag still registers.
 *
 * The floor on `dtSample` keeps the division safe where two events share a
 * millisecond — which is every event in a test environment.
 */
export function smoothVelocity(previous: number, dxSample: number, dtSample: number): number {
  return previous * 0.4 + (dxSample / Math.max(8, dtSample)) * 0.6
}

/**
 * How far the sheet moves when there is no page to move to: the same
 * direction as the finger, at a fraction of its travel, up to a ceiling
 * measured against the track's own box rather than the window's.
 */
export function dampedOffset(travel: number, trackWidth: number): number {
  return Math.sign(travel) * Math.min(trackWidth * SWIPE_DAMP_CEILING, Math.abs(travel) * SWIPE_DAMP_RATIO)
}

/**
 * Decides which way a drag from `start` to `end` turns the page.
 *
 * `viewportWidth` is passed in rather than read off `window` so the rule stays
 * pure and the edge test is against the box the gesture actually happened in.
 * `velocity` is optional: without it only the distance threshold commits.
 */
export function swipeDirection(
  start: Point,
  end: Point,
  viewportWidth: number,
  velocity?: number,
): 'prev' | 'next' | undefined {
  if (startsInGutter(start.x, viewportWidth)) return undefined

  const dx = end.x - start.x
  const dy = end.y - start.y
  const flick =
    velocity !== undefined &&
    Math.abs(velocity) >= SWIPE_FLICK_VELOCITY &&
    Math.abs(dx) >= SWIPE_FLICK_MIN_DISTANCE &&
    Math.sign(velocity) === Math.sign(dx)
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE && !flick) return undefined
  if (Math.abs(dx) < SWIPE_AXIS_RATIO * Math.abs(dy)) return undefined

  return dx < 0 ? 'next' : 'prev'
}
