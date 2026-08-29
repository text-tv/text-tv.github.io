import { useEffect, useState } from 'react'

/**
 * Temporary scaffolding for a bug that only shows on a phone: the numbers the
 * shell is laid out from, painted over the page, and a row of buttons that
 * each try one remedy on the spot. Reached with `?diag` in the query -
 * `?diag#300` - so a reader never meets it by accident.
 *
 * The buttons are the point. Every measurement the page can take says the
 * shell is where it asked to be, so the question is no longer what is wrong
 * but what puts it right: whichever button fixes the picture names the cause.
 *
 * Delete this file, its CSS block and its two lines in App once the shell is
 * trusted on iOS.
 */
/** The commit this bundle was built from; see the define in vite.config.ts. */
declare const __BUILD__: string

export const diagnosticsWanted = () => new URLSearchParams(window.location.search).has('diag')

/** How often the live half is re-read, in ms. Slow enough to stay readable. */
const TICK = 250

/** env() only resolves in CSS, so the insets are read off a probe element. */
const insetProbe = () => {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
  document.body.append(probe)
  return probe
}

const round = (value: number) => Math.round(value * 10) / 10

/** The page's own viewport declaration, which the remedies below rewrite. */
const viewportMeta = () => document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null

const read = (probe: HTMLElement): string[] => {
  const viewport = window.visualViewport
  const shell = document.querySelector('.app')?.getBoundingClientRect()
  const html = document.documentElement.getBoundingClientRect()
  const root = getComputedStyle(document.documentElement)
  const inset = getComputedStyle(probe)
  const scroller = document.scrollingElement
  const worker = navigator.serviceWorker?.controller ? 'sw styr' : 'ingen sw'
  return [
    `bygge ${typeof __BUILD__ === 'string' ? __BUILD__ : '-'} ${worker}`,
    `inner ${window.innerWidth}x${window.innerHeight} outer ${window.outerHeight}`,
    viewport
      ? `vv ${round(viewport.width)}x${round(viewport.height)} off ${round(viewport.offsetTop)} page ${round(viewport.pageTop)} scale ${viewport.scale}`
      : 'vv saknas',
    `css h ${root.getPropertyValue('--viewport-height') || '-'} off ${root.getPropertyValue('--viewport-offset') || '-'}`,
    `safe t ${inset.paddingTop} b ${inset.paddingBottom} screenY ${round(window.screenY)}`,
    `skarm ${screen.width}x${screen.height} ${matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'flik'}`,
    `meta ${viewportMeta()?.content ?? '-'}`,
    `skal ${document.documentElement.className || 'av'}`,
    // The one that separates a moved viewport from a scrolled document: html
    // is not fixed, so a scrolled document drags its top negative while the
    // shell's own top stays at zero.
    `html ${round(html.top)}..${round(html.bottom)} scroll ${round(scroller?.scrollTop ?? -1)}/${round(window.scrollY)}`,
    shell ? `app ${round(shell.top)}..${round(shell.bottom)}` : 'app saknas',
  ]
}

/**
 * One candidate cause each, as something the reader can tap. Whichever one
 * puts the page right is the answer; if none does, the shell is not what is
 * displaced and the search moves to the browser's own chrome.
 */
/**
 * Candidate shells, each a class on the root element and a block of CSS in
 * index.css. The bug lives in where the browser rests a page whose layout
 * viewport is taller than the slot it shows, so these vary how the shell
 * relates to that layout viewport: filling it, anchored to its bottom, or
 * sized to the dynamic viewport so nothing overflows and there is no travel
 * to rest at the wrong end of. Whichever lands the page correctly is the fix.
 */
const SHELLS = ['AV', 'DVH', 'FLOW', 'BOTTEN', 'FYLL'] as const

const applyShell = (shell: string) => {
  const root = document.documentElement
  root.classList.remove('diag-dvh', 'diag-flow', 'diag-botten', 'diag-fyll')
  if (shell !== 'AV') root.classList.add(`diag-${shell.toLowerCase()}`)
}

export function Diagnostics() {
  /*
   * Two readings: the one the page loaded with, and the one it has now. The
   * first is the interesting one and is gone by the time a screenshot is
   * taken, so it is kept rather than re-read.
   */
  const [atLoad, setAtLoad] = useState<string[]>([])
  const [now, setNow] = useState<string[]>([])

  useEffect(() => {
    const probe = insetProbe()
    setAtLoad(read(probe))
    setNow(read(probe))
    const tick = setInterval(() => setNow(read(probe)), TICK)
    return () => {
      clearInterval(tick)
      probe.remove()
    }
  }, [])

  // Centred, not pinned to an edge: the shell it reports on may itself be
  // drawn off the top of the screen, and so would a readout stuck to it.
  return (
    <div className="diagnostics">
      <pre className="diagnostics__numbers">
        {['VID START', ...atLoad, '', 'NU', ...now].join('\n')}
      </pre>
      <div className="diagnostics__remedies">
        {SHELLS.map((shell) => (
          <button
            key={shell}
            type="button"
            className="diagnostics__remedy"
            onClick={() => applyShell(shell)}
          >
            {shell}
          </button>
        ))}
      </div>
    </div>
  )
}
