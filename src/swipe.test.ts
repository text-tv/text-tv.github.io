import {
  dampedOffset,
  EDGE_GUTTER,
  PULL_CEILING_PX,
  PULL_RESISTANCE,
  PULL_STRIP_PX,
  PULL_THRESHOLD_PX,
  pullOffset,
  pullProgress,
  lockAxis,
  smoothVelocity,
  startsInGutter,
  translationOf,
  SWIPE_AXIS_LOCK,
  SWIPE_AXIS_RATIO,
  SWIPE_DAMP_CEILING,
  SWIPE_DAMP_RATIO,
  SWIPE_FLICK_MIN_DISTANCE,
  SWIPE_FLICK_VELOCITY,
  SWIPE_GUTTER_PX,
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

describe('startsInGutter', () => {
  // R14
  it('räknar de yttersta pixlarna vid båda kanterna som kantzon', () => {
    expect(startsInGutter(43, WIDTH)).toBe(true)
    expect(startsInGutter(44, WIDTH)).toBe(false)
    expect(startsInGutter(357, WIDTH)).toBe(true)
    expect(startsInGutter(356, WIDTH)).toBe(false)
  })
})

describe('lockAxis', () => {
  // R6
  it('låser ingen axel förrän fingret rört sig tillräckligt', () => {
    expect(lockAxis(3, 3)).toBeUndefined()
    expect(lockAxis(0, 0)).toBeUndefined()
  })

  it('låser i sidled när draget tydligt går i sidled', () => {
    expect(lockAxis(10, 2)).toBe('x')
    expect(lockAxis(-10, 2)).toBe('x')
  })

  it('låser i höjdled när sidled inte dominerar', () => {
    expect(lockAxis(2, 10)).toBe('y')
    expect(lockAxis(10, 8)).toBe('y')
  })
})

describe('smoothVelocity', () => {
  // R7
  it('väger det nya provet till 0,6 och det bortburna till 0,4', () => {
    expect(smoothVelocity(0, 10, 10)).toBe(0.6)
    expect(smoothVelocity(1, 0, 10)).toBe(0.4)
  })

  it('delar inte med noll när två händelser kommer samma millisekund', () => {
    const v = smoothVelocity(0, 10, 0)
    expect(Number.isFinite(v)).toBe(true)
    expect(v).toBe(0.75)
  })
})

describe('dampedOffset', () => {
  // R5
  it('släpar efter fingret med sin andel innan taket tar', () => {
    expect(dampedOffset(100, 390)).toBe(42)
  })

  it('stannar vid taket, mätt mot spårets bredd', () => {
    expect(dampedOffset(300, 390)).toBe(62.4)
  })

  it('behåller riktningen', () => {
    expect(dampedOffset(-100, 390)).toBe(-42)
    expect(dampedOffset(0, 390)).toBe(0)
  })
})

describe('swipeDirection med fart', () => {
  // R7
  it('godtar en kort snärt som är snabb nog', () => {
    expect(swipeDirection(from(200, 200), from(180, 200), WIDTH, -0.8)).toBe('next')
    expect(swipeDirection(from(200, 200), from(220, 200), WIDTH, 0.8)).toBe('prev')
  })

  it('godtar inte en kort rörelse som är för långsam', () => {
    expect(swipeDirection(from(200, 200), from(180, 200), WIDTH, -0.4)).toBeUndefined()
  })

  it('godtar inte en snärt vars fart pekar åt andra hållet än sträckan', () => {
    expect(swipeDirection(from(200, 200), from(180, 200), WIDTH, 0.8)).toBeUndefined()
  })

  it('kräver att snärten hunnit en bit, hur snabb den än är', () => {
    expect(swipeDirection(from(200, 200), from(189, 200), WIDTH, -0.8)).toBeUndefined()
    expect(swipeDirection(from(200, 200), from(188, 200), WIDTH, -0.8)).toBe('next')
  })

  it('struntar i en snärt som börjar i kantzonen, hur snabb den än är', () => {
    expect(swipeDirection(from(20, 200), from(120, 200), WIDTH, 2)).toBeUndefined()
  })

  it('har tröskelvärdena som snärten är skriven för', () => {
    expect(SWIPE_FLICK_VELOCITY).toBe(0.5)
    expect(SWIPE_FLICK_MIN_DISTANCE).toBe(12)
    expect(SWIPE_AXIS_LOCK).toBe(6)
    expect(SWIPE_GUTTER_PX).toBe(14)
    expect(SWIPE_DAMP_RATIO).toBe(0.42)
    expect(SWIPE_DAMP_CEILING).toBe(0.16)
  })
})

describe('läsa av var arket står', () => {
  // R17
  it('läser den upplösta matrisen en webbläsare rapporterar mitt i en övergång', () => {
    expect(translationOf('matrix(1, 0, 0, 1, -40, 0)')).toBe(-40)
  })

  // R17
  it('läser matrix3d, som är formen en translate3d faktiskt rapporteras i', () => {
    expect(translationOf('matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, -40,0,0,1)')).toBe(-40)
  })

  // R17
  it('läser det som skrivits, innan någon övergång hunnit lösa upp det', () => {
    expect(translationOf('translate3d(-40px, 0, 0)')).toBe(-40)
  })

  /**
   * The calc() commit target is the one form that cannot be resolved without a
   * layout. Saying "no offset" rather than "zero" is what lets the caller fall
   * back to the written value instead of believing the sheet is centred.
   */
  it('vet skillnaden mellan noll och inget svar', () => {
    expect(translationOf('translate3d(0px, 0, 0)')).toBe(0)
    expect(translationOf('translate3d(calc(-100% - 14px), 0, 0)')).toBeUndefined()
    expect(translationOf('none')).toBeUndefined()
    expect(translationOf('')).toBeUndefined()
  })
})

describe('pullOffset', () => {
  it('följer fingret rakt av tills remsan är öppen', () => {
    expect(pullOffset(10)).toBe(10)
    expect(pullOffset(PULL_STRIP_PX)).toBe(PULL_STRIP_PX)
  })

  it('tröskeln nås innan motståndet börjar, så armeringen känns som en öppen remsa', () => {
    expect(PULL_THRESHOLD_PX).toBeLessThan(PULL_STRIP_PX)
    expect(pullOffset(PULL_THRESHOLD_PX)).toBe(PULL_THRESHOLD_PX)
  })

  it('bromsar bortom remsan i stället för att följa med', () => {
    const past = pullOffset(PULL_STRIP_PX + 100)
    expect(past).toBeGreaterThan(PULL_STRIP_PX)
    expect(past).toBeLessThan(PULL_STRIP_PX + 100 * PULL_RESISTANCE + 1)
    expect(pullOffset(PULL_STRIP_PX + 20)).toBeCloseTo(PULL_STRIP_PX + 20 * PULL_RESISTANCE)
  })

  it('går aldrig längre än taket', () => {
    expect(pullOffset(10000)).toBe(PULL_CEILING_PX)
  })

  it('lyfter aldrig arket uppåt', () => {
    expect(pullOffset(0)).toBe(0)
    expect(pullOffset(-50)).toBe(0)
  })
})

describe('pullProgress', () => {
  it('är full vid tröskeln och stannar där', () => {
    expect(pullProgress(PULL_THRESHOLD_PX)).toBe(1)
    expect(pullProgress(PULL_CEILING_PX)).toBe(1)
  })

  it('räknar upp jämnt fram till tröskeln', () => {
    expect(pullProgress(PULL_THRESHOLD_PX / 2)).toBeCloseTo(0.5)
    expect(pullProgress(0)).toBe(0)
  })
})
