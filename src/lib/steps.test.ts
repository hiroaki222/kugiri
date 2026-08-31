import { describe, expect, it } from 'vitest'
import { DEFAULTS } from './settings'
import { dwellMs, reviewDwellMs } from './dwell'
import { buildSteps, progressOffset, summaryDwellMs } from './steps'
import type { Card } from './repair'

const card = (o: Partial<Card> = {}): Card => ({
  text: 'あいうえお',
  sourceStart: 0,
  sourceEnd: 5,
  sentenceId: 0,
  paragraphId: 0,
  isSentenceEnd: false,
  isParagraphEnd: false,
  width: 10,
  measuredPx: 100,
  fit: { mode: 'normal' },
  ...o,
})

describe('dwell', () => {
  it('cpm の定義どおり 60000/cpm で換算する', () => {
    // (BASE 4 + width 14) * (60000/1200) = 18 * 50 = 900ms
    expect(dwellMs({ width: 14, isSentenceEnd: false, isParagraphEnd: false }, 1200)).toBe(900)
  })
  it('文末・段落末は加算で伸ばす', () => {
    const base = dwellMs({ width: 6, isSentenceEnd: false, isParagraphEnd: false }, 1200)
    const sent = dwellMs({ width: 6, isSentenceEnd: true, isParagraphEnd: false }, 1200)
    const para = dwellMs({ width: 6, isSentenceEnd: true, isParagraphEnd: true }, 1200)
    expect(sent - base).toBe(300) // 6 width * 50ms
    expect(para).toBeGreaterThan(sent)
  })
  it('短いカードにも下限がある', () => {
    expect(dwellMs({ width: 1, isSentenceEnd: false, isParagraphEnd: false }, 4000)).toBe(180)
  })
  it('戻ったカードは倍率だけでなく下限も効く', () => {
    expect(reviewDwellMs(400)).toBe(1800)
    expect(reviewDwellMs(1000)).toBe(3000)
  })
  it('戻りの強さを設定で変えられる', () => {
    expect(reviewDwellMs(1000, 0)).toBe(1000) // なし
    expect(reviewDwellMs(1000, 2)).toBe(5000) // 倍
    expect(reviewDwellMs(200, 0.5)).toBe(900) // 下限が効く
  })
})

describe('steps', () => {
  const source = '短い。とても短い。かなり短い。'
  const sentences = [
    { id: 0, start: 0, end: 3 },
    { id: 1, start: 3, end: 9 },
    { id: 2, start: 9, end: 15 },
  ]
  const cards: Card[] = [
    card({ sentenceId: 0, isSentenceEnd: true, sourceEnd: 3 }),
    card({ sentenceId: 1, isSentenceEnd: true, sourceStart: 3, sourceEnd: 9 }),
    card({ sentenceId: 2, isSentenceEnd: true, isParagraphEnd: true, sourceStart: 9, sourceEnd: 15 }),
  ]

  it('全文カードを出さない設定ではカードだけ', () => {
    const steps = buildSteps(source, cards, sentences, {
      showSummary: false,
      summaryRatio: 0.4,
      spanChars: 7,
    })
    expect(steps.every((s) => s.kind === 'card')).toBe(true)
    expect(steps.length).toBe(3)
  })

  it('短い文が続くときはまとめて1枚にする', () => {
    const steps = buildSteps(source, cards, sentences, {
      showSummary: true,
      summaryRatio: 0.4,
      spanChars: 7,
    })
    const sums = steps.filter((s) => s.kind === 'summary')
    expect(sums.length).toBe(1) // 3文で1枚
    expect(sums[0].kind === 'summary' && sums[0].sentenceIds.length).toBe(3)
  })

  it('推定表示量が上限を超える文は出さない', () => {
    const long = 'あ'.repeat(300)
    const steps = buildSteps(
      long,
      [card({ sentenceId: 0, isSentenceEnd: true, isParagraphEnd: true, sourceEnd: 300 })],
      [{ id: 0, start: 0, end: 300 }],
      { showSummary: true, summaryRatio: 0.4, spanChars: 7 },
    )
    expect(steps.filter((s) => s.kind === 'summary').length).toBe(0)
  })

  it('全文カードの長さは予定 dwell の割合', () => {
    const steps = buildSteps(source, cards, sentences, {
      showSummary: true,
      summaryRatio: 0.4,
      spanChars: 7,
    })
    const sum = steps.find((s) => s.kind === 'summary')!
    const ms = summaryDwellMs(sum as never, cards, 1200, 0.4)
    expect(ms).toBeGreaterThanOrEqual(700)
    expect(ms).toBeLessThanOrEqual(12_000)
  })

  it('進捗は sourceEnd を使う (最終カードで 100% になる)', () => {
    const last = { kind: 'card' as const, cardIndex: 2 }
    expect(progressOffset(last, cards, 15)).toBe(15)
  })
})

describe('settings', () => {
  it('既定値が範囲内', () => {
    expect(DEFAULTS.spanChars).toBe(7)
    expect(DEFAULTS.cpm).toBe(1200)
  })
})
