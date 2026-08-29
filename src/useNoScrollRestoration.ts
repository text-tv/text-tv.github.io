import { useEffect } from 'react'

/**
 * Stops the browser putting back a scroll position when the page is reloaded.
 *
 * The shell is one viewport tall and the sheets start at their first row, so
 * there is never a position worth restoring - but a history entry records one
 * anyway, for the document and, separately, for every scroll container in the
 * page. `scrollRestoration` covers only the first of those, so the sheets are
 * put back by hand.
 */
export function useNoScrollRestoration(): void {
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

    // The restore has already happened by now, so this undoes one as well as
    // preventing the next. pageshow catches the back-forward cache, which
    // restores on the way in rather than at load.
    const toTheTop = () => {
      window.scrollTo(0, 0)
      for (const sheet of document.querySelectorAll('.swipe-sheet')) sheet.scrollTop = 0
    }
    toTheTop()
    window.addEventListener('pageshow', toTheTop)
    return () => {
      window.removeEventListener('pageshow', toTheTop)
      // Back to the default, not to a value captured on the way in: React
      // mounts an effect twice in development, and the second pass would
      // capture the first pass's 'manual' and hand that back as the original.
      if ('scrollRestoration' in history) history.scrollRestoration = 'auto'
    }
  }, [])
}
