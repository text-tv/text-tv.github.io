import { describe, expect, it } from 'vitest'
import { decide, displaced } from './viewportReset'

/*
 * The numbers are the reporter's phone: a 402x874 screen, a 676px slot between
 * Chrome's toolbars, and a viewport that is one or the other.
 */
describe('känner igen det förskjutna läget', () => {
  it('ser att sidan fått hela skärmen men bara visas i springan', () => {
    expect(displaced({ viewport: 874, screen: 874, slot: 676 })).toBe(true)
  })

  it('lämnar det friska läget i fred', () => {
    expect(displaced({ viewport: 676, screen: 874, slot: 676 })).toBe(false)
  })

  /*
   * Both halves are load-bearing. A viewport the size of the screen is
   * ordinary once the toolbars have gone, and a short slot on its own says
   * only that they are on their way out.
   */
  it('tar inte hela skärmen som tecken nog', () => {
    expect(displaced({ viewport: 874, screen: 874, slot: 874 })).toBe(false)
  })

  it('tar inte en kort springa som tecken nog', () => {
    expect(displaced({ viewport: 676, screen: 874, slot: 600 })).toBe(false)
  })

  it('bryr sig inte om en springa som nästan är hela skärmen', () => {
    expect(displaced({ viewport: 874, screen: 874, slot: 840 })).toBe(false)
  })

  // A pixel of rounding either way is still the whole screen.
  it('tål att skärmen och rutan avrundats olika', () => {
    expect(displaced({ viewport: 873.5, screen: 874, slot: 676 })).toBe(true)
  })
})

describe('bestämmer vad som ska göras åt det', () => {
  const displacedPhone = { viewport: 874, screen: 874, slot: 676 }
  const healthyPhone = { viewport: 676, screen: 874, slot: 676 }
  /** An ordinary load in a browser this does not happen to. */
  const calm = { standalone: false, affected: false, reloaded: false, attempts: 0 }

  it('hämtar om sidan när måtten visar att den är förskjuten', () => {
    expect(decide({ ...calm, measurements: displacedPhone })).toBe('renavigate')
  })

  it('låter en frisk sida vara', () => {
    expect(decide({ ...calm, measurements: healthyPhone })).toBe('settle')
  })

  /*
   * The second way the bug shows: every number reads correctly and the page is
   * displaced anyway. There is nothing to measure, so the circumstance is the
   * trigger - Chrome for iOS, out of a reload, which is the case its own reset
   * skips.
   */
  it('hämtar om efter en omladdning i chrome på ios, hur friska måtten än ser ut', () => {
    expect(
      decide({ ...calm, affected: true, reloaded: true, measurements: healthyPhone }),
    ).toBe('renavigate')
  })

  it('rör inte en vanlig navigering i samma webbläsare', () => {
    expect(decide({ ...calm, affected: true, measurements: healthyPhone })).toBe('settle')
  })

  it('rör inte en omladdning i en webbläsare utan felet', () => {
    expect(decide({ ...calm, reloaded: true, measurements: healthyPhone })).toBe('settle')
  })

  /*
   * The guard that matters: a device this does not help must not spend the
   * session reloading itself. Two tries, then it lives with the picture.
   */
  it('ger upp efter två försök i stället för att snurra', () => {
    const broken = { ...calm, affected: true, reloaded: true, measurements: healthyPhone }
    expect(decide({ ...broken, attempts: 1 })).toBe('renavigate')
    expect(decide({ ...broken, attempts: 2 })).toBe('give-up')
    expect(decide({ ...broken, attempts: 9 })).toBe('give-up')
  })

  // An installed copy has no browser toolbars and cannot be in this state.
  it('rör inte en installerad kopia', () => {
    expect(
      decide({ ...calm, standalone: true, affected: true, reloaded: true, measurements: displacedPhone }),
    ).toBe('settle')
  })
})
