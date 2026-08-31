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
  it('converts at 60000/cpm, as the unit says', () => {
    // (BASE 4 + width 14) * (60000/1200) = 18 * 50 = 900ms
    expect(dwellMs({ width: 14, isSentenceEnd: false, isParagraphEnd: false }, 1200)).toBe(900)
  })
  it('sentence and paragraph endings add time rather than multiply it', () => {
    const base = dwellMs({ width: 6, isSentenceEnd: false, isParagraphEnd: false }, 1200)
    const sent = dwellMs({ width: 6, isSentenceEnd: true, isParagraphEnd: false }, 1200)
    const para = dwellMs({ width: 6, isSentenceEnd: true, isParagraphEnd: true }, 1200)
    expect(sent - base).toBe(300) // 6 width * 50ms
    expect(para).toBeGreaterThan(sent)
  })
  it('even a short card has a floor', () => {
    expect(dwellMs({ width: 1, isSentenceEnd: false, isParagraphEnd: false }, 4000)).toBe(180)
  })
  it('a card stepped back to gets both the multiplier and the floor', () => {
    expect(reviewDwellMs(400)).toBe(1800)
    expect(reviewDwellMs(1000)).toBe(3000)
  })
  it('the strength of that pause is adjustable', () => {
    expect(reviewDwellMs(1000, 0)).toBe(1000) // off
    expect(reviewDwellMs(1000, 2)).toBe(5000) // doubled
    expect(reviewDwellMs(200, 0.5)).toBe(900) // floor applies
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

  it('with summaries off, only cards', () => {
    const steps = buildSteps(source, cards, sentences, {
      showSummary: false,
      summaryRatio: 0.4,
      spanChars: 7,
    })
    expect(steps.every((s) => s.kind === 'card')).toBe(true)
    expect(steps.length).toBe(3)
  })

  it('short sentences in a row share one summary', () => {
    const steps = buildSteps(source, cards, sentences, {
      showSummary: true,
      summaryRatio: 0.4,
      spanChars: 7,
    })
    const sums = steps.filter((s) => s.kind === 'summary')
    expect(sums.length).toBe(1) // three sentences, one summary
    expect(sums[0].kind === 'summary' && sums[0].sentenceIds.length).toBe(3)
  })

  it('a sentence past the size limit gets no summary', () => {
    const long = 'あ'.repeat(300)
    const steps = buildSteps(
      long,
      [card({ sentenceId: 0, isSentenceEnd: true, isParagraphEnd: true, sourceEnd: 300 })],
      [{ id: 0, start: 0, end: 300 }],
      { showSummary: true, summaryRatio: 0.4, spanChars: 7 },
    )
    expect(steps.filter((s) => s.kind === 'summary').length).toBe(0)
  })

  it('a summary lasts a share of the planned dwell', () => {
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

  it('progress uses sourceEnd, so the last card reaches 100%', () => {
    const last = { kind: 'card' as const, cardIndex: 2 }
    expect(progressOffset(last, cards, 15)).toBe(15)
  })
})

describe('settings', () => {
  it('the defaults are inside their own ranges', () => {
    expect(DEFAULTS.spanChars).toBe(7)
    expect(DEFAULTS.cpm).toBe(1200)
  })
})
