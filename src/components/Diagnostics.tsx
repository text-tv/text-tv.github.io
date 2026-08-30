import { useEffect, useState, useSyncExternalStore } from 'react'
import { format, log, record, subscribe } from '../log'

/**
 * The app's console, for the machine that has none.
 *
 * Reached with `?diag` in the query - `?diag#300` - so a reader never meets it
 * by accident. It paints the build it is running, the viewport the browser has
 * given the page and where the shell sits inside it, with everything
 * measurable behind MER and the log behind LOGG.
 *
 * It is kept because the bugs worth chasing here only happen on a phone, and
 * because a snapshot of an already-broken page is no use: every number in one
 * agrees with every other. What is worth having is the sequence, which is why
 * the log takes a reading at intervals after boot and on every event that
 * could move the page. `src/viewportReset.ts` is the bug that proved it.
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

/** What `100svh` resolves to: the slot, which no property reports. */
const slot = (): number => {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden'
  document.body.append(probe)
  const height = probe.getBoundingClientRect().height
  probe.remove()
  return height
}

/** The page's own viewport declaration, as the browser was given it. */
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
    // The two the workaround decides on, and what it has done about them.
    `springa ${round(slot())} forsok ${sessionStorage.getItem('texttv:omritad') ?? 0}${new URLSearchParams(window.location.search).has('nofix') ? ' NOFIX' : ''}`,
    `rull ${document.scrollingElement ? document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight : -1} tangentbord ${document.documentElement.dataset.keyboard === undefined ? 'nej' : 'ja'}`,
    // What the workaround's blunt trigger reads: the browser, and how this
    // document was arrived at.
    `nav ${(performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? '-'} ${/CriOS/.test(navigator.userAgent) ? 'crios' : 'annan'}`,
    // The one that separates a moved viewport from a scrolled document: html
    // is not fixed, so a scrolled document drags its top negative while the
    // shell's own top stays at zero.
    `html ${round(html.top)}..${round(html.bottom)} scroll ${round(scroller?.scrollTop ?? -1)}/${round(window.scrollY)}`,
    shell ? `app ${round(shell.top)}..${round(shell.bottom)}` : 'app saknas',
  ]
}

/** When the numbers are taken, in ms after the readout mounts. */
const SAMPLES = [0, 100, 300, 1000, 3000]

/**
 * The numbers over time rather than once they have settled.
 *
 * Every reading so far has been a snapshot of an already-broken page, and they
 * all said the same correct thing. What has never been seen is the sequence: a
 * restored offset that arrives late, or a scroll the page does not think it
 * has. Every event that could move the page writes a line too, so a drag that
 * puts the picture right is in the log next to the scroll it produced.
 */
const traced = (probe: HTMLElement, why: string) => record('log', why, read(probe).join(' | '))

function useTrace(probe: HTMLElement | null) {
  useEffect(() => {
    if (!probe) return

    const timers = SAMPLES.map((at) => setTimeout(() => traced(probe, `+${at}ms`), at))
    const events = ['scroll', 'resize', 'pageshow', 'visibilitychange', 'touchend', 'orientationchange']
    // A drag fires scroll by the frame, and three hundred lines of it would
    // push the boot off the top of the log.
    let last = 0
    const note = (event: Event) => {
      const now = performance.now()
      if (event.type === 'scroll' && now - last < 120) return
      last = now
      traced(probe, event.type)
    }
    for (const event of events) window.addEventListener(event, note, { passive: true })
    return () => {
      for (const timer of timers) clearTimeout(timer)
      for (const event of events) window.removeEventListener(event, note)
    }
  }, [probe])
}

/**
 * The log, painted on the phone. Copying is the point: a screenshot of forty
 * lines is unreadable, and the clipboard survives being pasted into a message.
 */
function Log({ onClose }: { onClose: () => void }) {
  const lines = useSyncExternalStore(subscribe, log)
  const text = lines.map(format).join('\n')

  return (
    <div className="diagnostics__log">
      <pre className="diagnostics__lines">{text || 'inget loggat'}</pre>
      <div className="diagnostics__buttons">
        <button
          type="button"
          className="diagnostics__button"
          onClick={() => void navigator.clipboard?.writeText(text)}
        >
          KOPIERA
        </button>
        <button type="button" className="diagnostics__button" onClick={onClose}>
          STÄNG
        </button>
      </div>
    </div>
  )
}

/*
 * Three lines at a glance: which build is running, the viewport - the number
 * the bug lives in - and where the shell sits inside it. The rest on request.
 */
const brief = (lines: string[]) => [lines[0], lines[1], lines[lines.length - 1]]

export function Diagnostics() {
  /*
   * Two readings: the one the page loaded with, and the one it has now. The
   * first is the interesting one and is gone by the time a screenshot is
   * taken, so it is kept rather than re-read.
   */
  const [atLoad, setAtLoad] = useState<string[]>([])
  const [now, setNow] = useState<string[]>([])
  const [showing, setShowing] = useState(false)
  const [full, setFull] = useState(false)
  const [probe, setProbe] = useState<HTMLElement | null>(null)
  useTrace(probe)

  useEffect(() => {
    const probe = insetProbe()
    setProbe(probe)
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
    <div className={`diagnostics${showing ? ' diagnostics--logging' : ''}`}>
      <pre className="diagnostics__numbers">
        {(full ? ['VID START', ...atLoad, '', 'NU', ...now] : brief(now)).join('\n')}
      </pre>
      <div className="diagnostics__buttons">
        <button
          type="button"
          className="diagnostics__button"
          onClick={() => setFull((full) => !full)}
        >
          {full ? 'MINDRE' : 'MER'}
        </button>
        <button
          type="button"
          className="diagnostics__button"
          onClick={() => setShowing((showing) => !showing)}
        >
          LOGG
        </button>
      </div>
      {showing && <Log onClose={() => setShowing(false)} />}
    </div>
  )
}
