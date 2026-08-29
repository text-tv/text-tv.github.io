import { useEffect, useState } from 'react'

/**
 * Temporary scaffolding for a bug that only shows on a phone: the numbers the
 * shell is laid out from, painted over the page. Reached with `?diag` in the
 * query - `?diag#300` - so a reader never meets it by accident.
 *
 * Delete this file, its CSS block and its two lines in App once the shell is
 * trusted on iOS. It exists because the interesting moment is a reload on a
 * device with no console attached, and a screenshot is the only way the
 * numbers get out.
 */
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

const read = (probe: HTMLElement): string[] => {
  const viewport = window.visualViewport
  const shell = document.querySelector('.app')?.getBoundingClientRect()
  const root = getComputedStyle(document.documentElement)
  const inset = getComputedStyle(probe)
  return [
    `inner ${window.innerWidth}x${window.innerHeight} scrollY ${round(window.scrollY)}`,
    viewport
      ? `vv ${round(viewport.width)}x${round(viewport.height)} off ${round(viewport.offsetTop)} page ${round(viewport.pageTop)} scale ${viewport.scale}`
      : 'vv saknas',
    `css h ${root.getPropertyValue('--viewport-height') || '-'} off ${root.getPropertyValue('--viewport-offset') || '-'}`,
    `safe t ${inset.paddingTop} b ${inset.paddingBottom}`,
    shell ? `app ${round(shell.top)}..${round(shell.bottom)}` : 'app saknas',
  ]
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
  return <pre className="diagnostics">{['VID START', ...atLoad, '', 'NU', ...now].join('\n')}</pre>
}
