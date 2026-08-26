import { changedRows } from './diff'
import type { DisplayRow, Run } from './resolve'

const text = (col: number, content: string, fg = '#ffffff', bg = '#000000'): Run => ({
  kind: 'text',
  col,
  width: content.length,
  fg,
  bg,
  text: content,
})

const row = (index: number, runs: Run[], doubleHeight = false): DisplayRow => ({
  row: index,
  doubleHeight,
  runs,
})

describe('changedRows', () => {
  it('säger ingenting om två likadana avkodningar', () => {
    const rows = [row(0, [text(0, 'AIK 2')]), row(1, [text(0, 'DIF 1')])]
    expect(changedRows(rows, rows.map((r) => ({ ...r })))).toEqual([])
  })

  it('pekar ut just den rad vars text ändrats', () => {
    const before = [row(0, [text(0, 'AIK 2')]), row(1, [text(0, 'DIF 1')])]
    const after = [row(0, [text(0, 'AIK 2')]), row(1, [text(0, 'DIF 2')])]
    expect(changedRows(before, after)).toEqual([1])
  })

  it('räknar en färgändring som en ändring - teletext säger saker med färg', () => {
    const before = [row(3, [text(0, 'MÅL', '#ffffff')])]
    const after = [row(3, [text(0, 'MÅL', '#ffff00')])]
    expect(changedRows(before, after)).toEqual([3])
  })

  it('rapporterar en rad som bara finns på ena sidan', () => {
    const before = [row(0, [text(0, 'A')])]
    const after = [row(0, [text(0, 'A')]), row(1, [text(0, 'B')])]
    expect(changedRows(before, after)).toEqual([1])
    expect(changedRows(after, before)).toEqual([1])
  })

  it('parar ihop rader efter radnummer, inte efter plats i listan', () => {
    // A double-height row covers the row beneath it, so the same grid row can
    // be present on one side and absent on the other: index 1 in `after` is
    // grid row 4, and comparing by position would call both of them changed.
    const before = [row(0, [text(0, 'X')], true), row(2, [text(0, 'Y')]), row(4, [text(0, 'Z')])]
    const after = [row(0, [text(0, 'X')], true), row(4, [text(0, 'Z')])]
    expect(changedRows(before, after)).toEqual([2])
  })

  it('märker att en rad blivit dubbelhög fast texten är densamma', () => {
    const before = [row(0, [text(0, 'RUBRIK')])]
    const after = [row(0, [text(0, 'RUBRIK')], true)]
    expect(changedRows(before, after)).toEqual([0])
  })

  it('lämnar svaret i radordning', () => {
    const before = [row(0, [text(0, 'A')]), row(1, [text(0, 'B')]), row(2, [text(0, 'C')])]
    const after = [row(1, [text(0, 'b')]), row(2, [text(0, 'c')]), row(0, [text(0, 'a')])]
    expect(changedRows(before, after)).toEqual([0, 1, 2])
  })
})
