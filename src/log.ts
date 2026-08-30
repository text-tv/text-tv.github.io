/**
 * A log the phone can show you.
 *
 * Most of what goes wrong here only goes wrong on a phone, where there is no
 * console to open. So every line the app writes is kept in memory from boot,
 * and the `?diag` readout can paint the last of them on the screen.
 *
 * Capture starts before the app renders, not when the readout mounts: the
 * interesting lines are the ones from the load that went wrong.
 */

/** Lines kept. A few hundred covers a boot and a handful of navigations. */
const LIMIT = 300

export type Level = 'log' | 'warn' | 'error'

export type Line = {
  /** Milliseconds since the page was opened, which is what a phone bug is timed in. */
  at: number
  level: Level
  text: string
}

/*
 * Replaced rather than mutated on every line: the readout subscribes with
 * useSyncExternalStore, which re-renders only when the snapshot's identity
 * changes. A few hundred short strings is nothing to copy.
 */
let lines: readonly Line[] = []
const listeners = new Set<() => void>()
const started = performance.now()

/** One argument as text, without throwing on a circular object. */
const asText = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function record(level: Level, ...args: unknown[]): void {
  const line = { at: performance.now() - started, level, text: args.map(asText).join(' ') }
  const next = [...lines, line]
  lines = next.length > LIMIT ? next.slice(next.length - LIMIT) : next
  for (const listener of listeners) listener()
}

export const log = (): readonly Line[] => lines

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** `12.3s  warn  something happened` */
export const format = (line: Line): string =>
  `${(line.at / 1000).toFixed(1)}s ${line.level === 'log' ? '' : `${line.level} `}${line.text}`

let capturing = false

/**
 * Mirrors the console into the buffer, and catches what never reaches it: a
 * thrown error and a rejected promise nobody handled. The console still
 * prints, so a desktop session is unaffected.
 */
export function captureConsole(): void {
  if (capturing) return
  capturing = true

  for (const level of ['log', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      record(level, ...args)
      original(...args)
    }
  }

  window.addEventListener('error', (event) => record('error', event.message))
  window.addEventListener('unhandledrejection', (event) => record('error', asText(event.reason)))
}
