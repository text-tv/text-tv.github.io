import { describe, expect, it } from 'vitest'
import { captureConsole, format, log, record, subscribe } from './log'

describe('loggen på telefonen', () => {
  // The buffer is module state and there is no reset: each test reads only
  // the lines it wrote, off the end.

  it('behåller det som skrivits, i ordning', () => {
    record('log', 'först')
    record('warn', 'sedan')

    const texts = log().map((line) => line.text)
    expect(texts.slice(-2)).toEqual(['först', 'sedan'])
    expect(log().at(-1)?.level).toBe('warn')
  })

  it('sätter ihop flera argument och klarar objekt', () => {
    record('log', 'sida', { page: '100' })

    expect(log().at(-1)?.text).toBe('sida {"page":"100"}')
  })

  it('säger till den som lyssnar', () => {
    let told = 0
    const stop = subscribe(() => (told += 1))

    record('log', 'något')
    expect(told).toBe(1)

    stop()
    record('log', 'något mer')
    expect(told).toBe(1)
  })

  /* The readout re-renders on identity, so a new line has to mean a new list. */
  it('byter ut listan i stället för att ändra i den', () => {
    const before = log()
    record('log', 'ny rad')

    expect(log()).not.toBe(before)
  })

  it('skriver tiden i sekunder och utelämnar den vanliga nivån', () => {
    expect(format({ at: 12340, level: 'log', text: 'hej' })).toBe('12.3s hej')
    expect(format({ at: 900, level: 'error', text: 'trasig' })).toBe('0.9s error trasig')
  })

  it('speglar konsolen utan att tysta den', () => {
    const original = console.log
    captureConsole()
    captureConsole()

    console.log('via konsolen')

    expect(log().at(-1)?.text).toBe('via konsolen')
    expect(console.log).not.toBe(original)
  })
})
