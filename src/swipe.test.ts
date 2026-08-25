import {
  EDGE_GUTTER,
  SWIPE_AXIS_RATIO,
  SWIPE_MIN_DISTANCE,
  swipeDirection,
  type Point,
} from './swipe'

const WIDTH = 400
const from = (x: number, y: number): Point => ({ x, y })

describe('swipeDirection', () => {
  it('tolkar ett drag från höger till vänster som nästa sida', () => {
    expect(swipeDirection(from(250, 200), from(150, 200), WIDTH)).toBe('next')
  })

  it('tolkar ett drag från vänster till höger som föregående sida', () => {
    expect(swipeDirection(from(150, 200), from(250, 200), WIDTH)).toBe('prev')
  })

  it('kräver att draget är minst så långt som tröskeln', () => {
    expect(swipeDirection(from(200, 200), from(141, 200), WIDTH)).toBeUndefined()
    expect(swipeDirection(from(200, 200), from(140, 200), WIDTH)).toBe('next')
    expect(swipeDirection(from(200, 200), from(259, 200), WIDTH)).toBeUndefined()
    expect(swipeDirection(from(200, 200), from(260, 200), WIDTH)).toBe('prev')
  })

  it('avvisar ett långt drag som lutar för mycket, trots att sträckan räcker', () => {
    expect(swipeDirection(from(250, 200), from(150, 280), WIDTH)).toBeUndefined()
  })

  it('godtar ett drag som lutar men fortfarande går mest i sidled', () => {
    expect(swipeDirection(from(250, 200), from(150, 240), WIDTH)).toBe('next')
  })

  it('struntar i drag som börjar i vänsterkanten, där systemets bakåtgest bor', () => {
    expect(swipeDirection(from(20, 200), from(120, 200), WIDTH)).toBeUndefined()
    expect(swipeDirection(from(44, 200), from(144, 200), WIDTH)).toBe('prev')
  })

  it('mäter högerkanten mot den skickade bredden, inte mot något globalt', () => {
    expect(swipeDirection(from(380, 200), from(280, 200), WIDTH)).toBeUndefined()
    expect(swipeDirection(from(380, 200), from(280, 200), 800)).toBe('next')
  })

  it('ger inget för en beröring som aldrig rörde sig', () => {
    expect(swipeDirection(from(200, 200), from(200, 200), WIDTH)).toBeUndefined()
  })

  it('har tröskelvärdena som gestreglerna är skrivna för', () => {
    expect(SWIPE_MIN_DISTANCE).toBe(60)
    expect(SWIPE_AXIS_RATIO).toBe(1.5)
    expect(EDGE_GUTTER).toBe(44)
  })
})
