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
      root.style.setProperty('--viewport-offset', `${viewport.offsetTop}px`)
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
