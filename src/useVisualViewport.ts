import { useEffect } from 'react'

/**
 * How much shorter than the window the visible region has to get before it is
 * a keyboard rather than a browser's own chrome. A toolbar band is around a
 * hundred and twenty; a keyboard is several times that.
 */
const KEYBOARD_MIN_PX = 100

/**
 * Pins the shell to the visible region while the keyboard is up.
 *
 * The rest of the time it publishes nothing and takes nothing back, so the
 * shell stays a flow box one `svh` tall - the shape that cannot be displaced
 * by a browser holding a scroll position the page cannot read. Only the
 * keyboard shrinks the visible region without shrinking the page, and only
 * then is the shell told in pixels where that region is.
 *
 * Without visualViewport nothing is written and the CSS stands on its own.
 */
export function useVisualViewport(): void {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const root = document.documentElement
    const standDown = () => {
      delete root.dataset.keyboard
      root.style.removeProperty('--viewport-height')
      root.style.removeProperty('--viewport-offset')
    }

    const publish = () => {
      if (window.innerHeight - viewport.height <= KEYBOARD_MIN_PX) {
        standDown()
        return
      }
      root.dataset.keyboard = ''
      root.style.setProperty('--viewport-height', `${viewport.height}px`)
      root.style.setProperty('--viewport-offset', `${viewport.offsetTop}px`)
    }
    publish()

    // Resize covers the keyboard opening and closing; scroll covers the shifts
    // it causes on its own as the field is brought into view.
    viewport.addEventListener('resize', publish)
    viewport.addEventListener('scroll', publish)
    return () => {
      viewport.removeEventListener('resize', publish)
      viewport.removeEventListener('scroll', publish)
      standDown()
    }
  }, [])
}
