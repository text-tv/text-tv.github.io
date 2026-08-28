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
/*
 * How far back inside the commit distance a drag has to come before it stops
 * reporting itself as armed. Without it a finger resting on the threshold
 * crosses it repeatedly, and each crossing is a state write that re-renders
 * every decoded frame on screen - the cost the per-frame direct writes exist to
 * avoid. A thumb's resting jitter is a few pixels; this is comfortably past it.
 */
export const SWIPE_ARM_RELEASE = 12
export const SWIPE_AXIS_RATIO = 1.5
export const SWIPE_FLICK_VELOCITY = 0.5
export const SWIPE_FLICK_MIN_DISTANCE = 12
export const SWIPE_AXIS_LOCK = 6
export const EDGE_GUTTER = 44
export const SWIPE_GUTTER_PX = 14
export const SWIPE_DAMP_RATIO = 0.42
export const SWIPE_DAMP_CEILING = 0.16
export const CLICK_SWALLOW_MS = 400

/**
 * The downward pull that asks SVT for the page again.
 *
 * `PULL_STRIP_PX` is both the height of the revealed strip and where the track
 * parks for the duration of the fetch, so the strip is exactly full when it is
 * doing something. `PULL_THRESHOLD_PX` sits below it on purpose: the arming
 * point lands inside the 1:1 region, so the reader feels it as "the strip is
 * fully open" rather than as a distance they have to estimate.
 *
 * `PULL_RESISTANCE` and `PULL_CEILING_PX` are the same acknowledge-and-decline
 * shape as `SWIPE_DAMP_*` on the other axis: past the strip the sheet still
 * moves, at a third of the finger's travel, and stops at twice the strip.
 */
export const PULL_STRIP_PX = 44
export const PULL_THRESHOLD_PX = 40
export const PULL_CEILING_PX = 88
export const PULL_RESISTANCE = 0.34

/**
 * How far the strip has travelled for a finger that has moved `dy` down.
 *
 * Upward travel is not a pull and never moves it, so the floor is zero rather
 * than a negative offset - a gesture that crosses back above its origin closes
 * the strip instead of lifting the sheet off the top of the screen.
 */
export function pullOffset(dy: number): number {
  if (dy <= 0) return 0
  if (dy <= PULL_STRIP_PX) return dy
  return Math.min(PULL_CEILING_PX, PULL_STRIP_PX + (dy - PULL_STRIP_PX) * PULL_RESISTANCE)
}

/** How far along the strip's fill rule is, 0 to 1. */
export function pullProgress(offset: number): number {
  return Math.min(1, Math.max(0, offset / PULL_THRESHOLD_PX))
}

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
 * The horizontal translation a CSS transform carries, or undefined when it
 * carries none this can resolve.
 *
 * DOMMatrix reads `matrix()`, `matrix3d()` and `translate3d()` alike, which
 * matters because a browser reports a 3D transform as the 3D matrix - matching
 * one shape by hand would miss the very form the track is written in. A
 * `calc()` target it cannot resolve is undefined rather than zero, so the
 * caller can fall back rather than believe the sheet is centred.
 */
export function translationOf(transform: string): number | undefined {
  if (!transform || transform === 'none') return undefined
  // A percentage or calc() resolves only against a layout box, which a matrix
  // has none of. Engines disagree on what they do with one - some throw, some
  // quietly answer zero - and zero is the one wrong answer here, because it
  // reads as "centred" for a sheet that is nowhere near centred.
  if (/%|calc\(/.test(transform)) return undefined
  try {
    return new DOMMatrixReadOnly(transform).m41
  } catch {
    return undefined
  }
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
