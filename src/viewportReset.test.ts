import { describe, expect, it } from 'vitest'
import { displaced } from './viewportReset'

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
