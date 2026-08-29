import { useEffect } from 'react'

/**
 * How long after mount to keep re-reading. A URL bar's slide is a fraction of
 * that; the margin costs one extra read.
 */
const SETTLE_MS = 400

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

    /*
     * A reload lands mid-settle. Chrome shows its URL bar again, so the region
     * the first read sees is neither the height nor the offset the page ends
     * up with, and the move is not always announced as a resize or a scroll -
     * which is why a refresh drew the shell a URL bar too high while an
     * in-app navigation, remounting nothing, was fine. Read again over the
     * next frame and once more after the slide could have finished.
     */
    const frame = requestAnimationFrame(publish)
    const settled = setTimeout(publish, SETTLE_MS)

    // Resize covers the keyboard opening and closing; scroll covers the pinch
    // and scroll-into-view shifts that move the visual viewport on its own.
    // pageshow covers a restore from the back-forward cache, where the region
    // may have changed while the page was frozen.
    viewport.addEventListener('resize', publish)
    viewport.addEventListener('scroll', publish)
    window.addEventListener('pageshow', publish)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(settled)
      viewport.removeEventListener('resize', publish)
      viewport.removeEventListener('scroll', publish)
      window.removeEventListener('pageshow', publish)
      document.documentElement.style.removeProperty('--viewport-height')
      document.documentElement.style.removeProperty('--viewport-offset')
    }
  }, [])
}
