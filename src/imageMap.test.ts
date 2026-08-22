import { parseImageMap } from './imageMap'
import { rawFixture } from './test/fixtures'

const livePage100Map: string = (
  rawFixture('100') as { data: { subPages: { imageMap: string }[] } }
).data.subPages[0].imageMap

describe('parseImageMap', () => {
  it('läser den riktiga, tabbseparerade kartan från sida 100', () => {
    const hotspots = parseImageMap(livePage100Map)
    expect(hotspots.length).toBeGreaterThan(5)
    expect(hotspots[0]).toMatchObject({ href: '100', x1: 39, y1: 0, x2: 78, y2: 16 })
    expect(hotspots.every((h) => /^\d{3}$/.test(h.href))).toBe(true)
  })

  it('räknar om koordinater till procent av 520x400', () => {
    const [hotspot] = parseImageMap('<AREA SHAPE="RECT" COORDS="221,144,260,160" HREF="106">')
    expect(hotspot).toMatchObject({
      href: '106',
      leftPct: (221 / 520) * 100,
      topPct: (144 / 400) * 100,
      widthPct: (39 / 520) * 100,
      heightPct: (16 / 400) * 100,
      centreX: 240.5,
      centreY: 152,
    })
  })

  it('bryr sig inte om versaler i tagg- eller attributnamn', () => {
    const upper = parseImageMap('<AREA SHAPE="RECT" COORDS="0,0,39,16" HREF="123">')
    const lower = parseImageMap('<area shape="rect" coords="0,0,39,16" href="123">')
    expect(lower).toEqual(upper)
  })

  it('bryr sig inte om separatorn mellan poster', () => {
    const area = (href: string) => `<AREA SHAPE="RECT" COORDS="0,0,39,16" HREF="${href}">`
    const tabs = parseImageMap(`<map name="x">\t${area('101')}\t${area('102')}`)
    const spaces = parseImageMap(`<map name="x"> ${area('101')} ${area('102')}`)
    const newlines = parseImageMap(`<map name="x">\n${area('101')}\n${area('102')}`)
    expect(tabs.map((h) => h.href)).toEqual(['101', '102'])
    expect(spaces).toEqual(tabs)
    expect(newlines).toEqual(tabs)
  })

  it('hoppar över poster med för få koordinater', () => {
    expect(parseImageMap('<AREA SHAPE="RECT" COORDS="0,0,39" HREF="123">')).toEqual([])
  })

  it('hoppar över poster med koordinater som inte är tal', () => {
    expect(parseImageMap('<AREA SHAPE="RECT" COORDS="0,0,x,16" HREF="123">')).toEqual([])
  })

  it('hoppar över poster vars HREF inte är ett tresiffrigt sidnummer', () => {
    const map = [
      '<AREA SHAPE="RECT" COORDS="0,0,39,16" HREF="12">',
      '<AREA SHAPE="RECT" COORDS="0,0,39,16" HREF="1234">',
      '<AREA SHAPE="RECT" COORDS="0,0,39,16" HREF="/nyheter">',
      '<AREA SHAPE="RECT" COORDS="0,0,39,16" HREF="104">',
    ].join('\t')
    expect(parseImageMap(map).map((h) => h.href)).toEqual(['104'])
  })

  it('ger en tom lista för en tom sträng', () => {
    expect(parseImageMap('')).toEqual([])
  })

  it('normaliserar omvända koordinatpar', () => {
    const [hotspot] = parseImageMap('<AREA SHAPE="RECT" COORDS="78,16,39,0" HREF="106">')
    expect(hotspot).toMatchObject({ x1: 39, y1: 0, x2: 78, y2: 16 })
  })
})
