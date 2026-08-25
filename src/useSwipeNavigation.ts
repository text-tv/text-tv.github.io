import { useEffect, useRef, type RefObject } from 'react'
import type { PageNumber } from './api.types'
import { CLICK_SWALLOW_MS, swipeDirection, type Point } from './swipe'

interface Gesture {
  pointerId: number
  start: Point
  last: Point
}

/**
 * Turns a sideways finger drag across `container` into a page change.
 *
 * Only touch pointers count: the frame's text is deliberately selectable, so a
 * mouse drag has to stay a selection. Nothing here calls preventDefault - the
 * browser keeps scrolling, pinch-zoom, selection and the OS edge gestures, and
 * `pointercancel` is the app's only notice that it took one of them.
 */
export function useSwipeNavigation(
  container: RefObject<HTMLElement | null>,
  prev: PageNumber | undefined,
  next: PageNumber | undefined,
  navigate: (pageNumber: PageNumber) => void,
): void {
  const gesture = useRef<Gesture | undefined>(undefined)
  const swallowTimer = useRef<number | undefined>(undefined)
  const swallow = useRef<((event: MouseEvent) => void) | undefined>(undefined)
  /**
   * The neighbours and navigate change with every page, but re-attaching the
   * listeners on each change would drop a gesture mid-drag; a ref keeps them
   * current instead.
   */
  const latest = useRef({ prev, next, navigate })
  latest.current = { prev, next, navigate }

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

      const point = { x: event.clientX, y: event.clientY }
      gesture.current = { pointerId: event.pointerId, start: point, last: point }
    }

    // Only here to carry the last point: some browsers report a pointerup
    // whose coordinates are stale.
    const onPointerMove = (event: PointerEvent) => {
      if (gesture.current?.pointerId !== event.pointerId) return
      gesture.current.last = { x: event.clientX, y: event.clientY }
    }

    const onPointerUp = (event: PointerEvent) => {
      const live = gesture.current
      if (live?.pointerId !== event.pointerId) return
      gesture.current = undefined

      // innerWidth, not visualViewport.width: clientX is relative to the layout
      // viewport, and mixing the two would swell the gutter under pinch-zoom.
      const direction = swipeDirection(live.start, live.last, window.innerWidth)
      if (!direction) return

      const target = direction === 'prev' ? latest.current.prev : latest.current.next
      if (!target) return

      armSwallow()
      latest.current.navigate(target)
    }

    // The browser or the OS has taken the gesture over - the app's only notice.
    const onPointerCancel = (event: PointerEvent) => {
      if (gesture.current?.pointerId !== event.pointerId) return
      gesture.current = undefined
    }

    element.addEventListener('pointerdown', onPointerDown, { passive: true })
    element.addEventListener('pointermove', onPointerMove, { passive: true })
    element.addEventListener('pointerup', onPointerUp, { passive: true })
    element.addEventListener('pointercancel', onPointerCancel, { passive: true })
    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerCancel)
      clearSwallow()
    }
  }, [container])
}
