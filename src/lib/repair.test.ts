import { describe, expect, it } from 'vitest'
import { prepareSource, proposeCards, makeIdealPxFor } from './segment'
import { paragraphRanges, repair } from './repair'
import { visualWidth } from './width'

const measure = (t: string) => visualWidth(t) * 10

const propose = (raw: string, spanChars = 7, hardMaxPx = 10_000) => {
  const source = prepareSource(raw)
  return proposeCards(source, {
    idealPxFor: makeIdealPxFor(measure, spanChars),
    hardMaxPx,
    approxSpan: (a, b) => measure(source.slice(a, b)),
    approxText: measure,
    spanChars,
  })
}

const run = (raw: string, hardMaxPx: number, spanChars = 7) => {
  const p = propose(raw, spanChars, hardMaxPx)
  return repair(p, {
    hardMaxPx,
    exactWidth: (texts) => texts.map(measure),
    isCurrent: () => true,
    batchSize: 4,
    yieldTo: async () => {},
  }).then((cards) => ({ p, cards: cards! }))
}

const JA = '視覚的な情報処理において、人間の眼球は連続的に文字列を追っているわけではない。実際にはサッケードと呼ばれる跳躍運動を繰り返している。'

describe('repair', () => {
  it('通常カードは必ず hardMaxPx に収まる', async () => {
    const { cards } = await run(JA, 300)
    for (const c of cards) {
      if (c.fit.mode === 'normal') expect(c.measuredPx).toBeLessThanOrEqual(300)
    }
    expect(cards.length).toBeGreaterThan(0)
  })

  it('狭くすると分割が増え、それでも全部収まる', async () => {
    const wide = await run(JA, 400)
    const narrow = await run(JA, 120)
    expect(narrow.cards.length).toBeGreaterThan(wide.cards.length)
    for (const c of narrow.cards) {
      if (c.fit.mode === 'normal') expect(c.measuredPx).toBeLessThanOrEqual(120)
    }
  })

  it('単一トークンが超過したら scroll に落ちる', async () => {
    // 幅40 の1トークンを hardMax 30 に入れる
    const { cards } = await run('ブラックボックス', 30)
    const scrolls = cards.filter((c) => c.fit.mode === 'scroll')
    expect(scrolls.length).toBeGreaterThan(0)
  })

  it('URL は atomic として scroll になる', async () => {
    const source = prepareSource('参照 https://example.com/very/long/path/that/never/ends です。')
    const url = source.indexOf('https://')
    const spans = [{ start: url, end: source.indexOf(' ', url) }]
    const p = proposeCards(
      source,
      {
        idealPxFor: makeIdealPxFor(measure, 7),
        hardMaxPx: 200,
        approxSpan: (a, b) => measure(source.slice(a, b)),
        approxText: measure,
        spanChars: 7,
      },
      spans,
    )
    const cards = (await repair(p, {
      hardMaxPx: 200,
      exactWidth: (t) => t.map(measure),
      isCurrent: () => true,
    }))!
    const atomic = cards.find((c) => c.fit.mode === 'scroll' && c.fit.reason === 'atomic')
    expect(atomic?.text).toContain('https://')
  })

  it('終端フラグは最後の分割片だけが持つ', async () => {
    const { cards } = await run(JA, 100)
    // 文末フラグの数 = 文の数
    const p = propose(JA, 7, 100)
    expect(cards.filter((c) => c.isSentenceEnd).length).toBe(p.sentences.length)
    expect(cards.filter((c) => c.isParagraphEnd).length).toBe(p.paragraphs.length)
  })

  it('完全被覆が repair の後も保たれる', async () => {
    const { p, cards } = await run(JA, 100)
    let cur = 0
    for (const c of cards) {
      expect(p.source.slice(cur, c.sourceStart).trim()).toBe('')
      expect(p.source.slice(c.sourceStart, c.sourceEnd)).toBe(c.text)
      cur = c.sourceEnd
    }
    expect(p.source.slice(cur).trim()).toBe('')
  })

  it('世代が変わったら null を返して打ち切る', async () => {
    const p = propose(JA, 7, 100)
    const cards = await repair(p, {
      hardMaxPx: 100,
      exactWidth: (t) => t.map(measure),
      isCurrent: () => false,
    })
    expect(cards).toBeNull()
  })

  it('バッチ境界で譲る', async () => {
    let yields = 0
    const p = propose(JA, 7, 300)
    await repair(p, {
      hardMaxPx: 300,
      exactWidth: (t) => t.map(measure),
      isCurrent: () => true,
      batchSize: 2,
      yieldTo: async () => {
        yields++
      },
    })
    expect(yields).toBeGreaterThan(0)
  })

  it('段落のカード範囲を後から再計算する', async () => {
    const { p, cards } = await run('一つ目の段落です。\n\n二つ目の段落です。', 300)
    const ranges = paragraphRanges(cards, p.paragraphs.length)
    expect(ranges.length).toBe(2)
    expect(ranges[0].cardEnd).toBe(ranges[1].cardStart)
    expect(ranges[1].cardEnd).toBe(cards.length)
  })
})
