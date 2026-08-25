/**
 * The tunable numbers behind the sideways page gesture.
 *
 * `SWIPE_MIN_DISTANCE` and `SWIPE_AXIS_RATIO` are the whole commit rule: a
 * drag counts once it has travelled far enough and is clearly more sideways
 * than not. Distance is absolute pixels rather than a share of the viewport
 * because a finger's travel does not grow with the screen, and there is no
 * velocity term — it would be the only thing here that depended on time.
 *
 * `EDGE_GUTTER` is dead space along both sides. Neither iOS nor Android lets
 * an installed PWA cancel the system's back gesture, so the only workable
 * answer is to stay out of its way: iOS arms roughly the outer 20-30 pt and
 * Android's inset is 24 dp, adjustable to 40 dp.
 *
 * `CLICK_SWALLOW_MS` covers the synthetic click a browser can still deliver
 * up to ~300 ms after touchend, while staying short enough that a deliberate
 * follow-up tap gets through.
 */
export const SWIPE_MIN_DISTANCE = 60
export const SWIPE_AXIS_RATIO = 1.5
export const EDGE_GUTTER = 44
export const CLICK_SWALLOW_MS = 400

export interface Point {
  x: number
  y: number
}

/**
 * Decides which way a drag from `start` to `end` turns the page.
 *
 * `viewportWidth` is passed in rather than read off `window` so the rule stays
 * pure and the edge test is against the box the gesture actually happened in.
 */
export function swipeDirection(
  start: Point,
  end: Point,
  viewportWidth: number,
): 'prev' | 'next' | undefined {
  if (start.x < EDGE_GUTTER || start.x > viewportWidth - EDGE_GUTTER) return undefined

  const dx = end.x - start.x
  const dy = end.y - start.y
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return undefined
  if (Math.abs(dx) < SWIPE_AXIS_RATIO * Math.abs(dy)) return undefined

  return dx < 0 ? 'next' : 'prev'
}
