import { useEffect } from 'react'

/**
 * Publishes the visible region as --viewport-height and --viewport-offset on
 * the document element, so the shell can end where the keyboard begins.
 *
 * Without visualViewport nothing is written and the CSS fallbacks stand.
 */
export function useVisualViewport(): void {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const publish = () => {
      const root = document.documentElement
      root.style.setProperty('--viewport-height', `${viewport.height}px`)
      /*
       * Never negative. iOS reports the visual viewport as sitting *above* the
       * layout viewport while the browser's bars are expanding - which is the
       * state a reload lands in - and translating the shell by that lifts it
       * off the top of the screen, clipping the frame's first rows and leaving
       * the same height of black under the bar. The offset this compensates
       * for is the keyboard's and the scroll-into-view's, and both are
       * downward; an upward one has nothing to correct.
       */
      root.style.setProperty('--viewport-offset', `${Math.max(0, viewport.offsetTop)}px`)
    }
    publish()

    // Resize covers the keyboard opening and closing; scroll covers the pinch
    // and scroll-into-view shifts that move the visual viewport on its own.
    viewport.addEventListener('resize', publish)
    viewport.addEventListener('scroll', publish)
    return () => {
      viewport.removeEventListener('resize', publish)
      viewport.removeEventListener('scroll', publish)
      document.documentElement.style.removeProperty('--viewport-height')
      document.documentElement.style.removeProperty('--viewport-offset')
    }
  }, [])
}
