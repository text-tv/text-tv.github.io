import { useEffect } from 'react'

/**
 * Stops the browser putting back a scroll position when the page is reloaded.
 *
 * The shell is fixed and the document never scrolls, so there is no position
 * worth keeping. iOS records one anyway - its address bar collapses by
 * scrolling the page under itself - and restores it on a reload. With nothing
 * to scroll, the offset lands as the whole page sitting a toolbar's height too
 * high: the frame's first rows behind the address bar, and the same height of
 * dead black below the bottom bar. Nothing in the page's own measurements says
 * so, which is what made it hard to see - the shell is exactly where it asked
 * to be, in a viewport the browser has moved.
 *
 * Only a reload shows it, and only of an entry the reader navigated to rather
 * than typed: a typed URL is a new entry and carries no stored offset.
 */
export function useNoScrollRestoration(): void {
  useEffect(() => {
    if (!('scrollRestoration' in history)) return

    history.scrollRestoration = 'manual'
    // The restore has already happened by now, so undo it as well as prevent
    // the next one.
    window.scrollTo(0, 0)
    return () => {
      // Back to the default, not to a value captured on the way in: React
      // mounts an effect twice in development, and the second pass would
      // capture the first pass's 'manual' and hand that back as the original.
      history.scrollRestoration = 'auto'
    }
  }, [])
}
