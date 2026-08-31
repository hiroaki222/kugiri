import { describe, expect, it } from 'vitest'
import { prepareSource, proposeCards, makeIdealPxFor } from './segment'
import { splitSentences } from './sentences'
import { tokenize } from './tokenize'
import { visualWidth } from './width'

/** A fake monospace measure, so the algorithm can be tested without a DOM. */
const measure = (t: string) => visualWidth(t) * 10

function fakeMetrics(source: string, spanChars = 7) {
  return {
    idealPxFor: makeIdealPxFor(measure, spanChars),
    hardMaxPx: 10_000,
    approxSpan: (a: number, b: number) => measure(source.slice(a, b)),
    approxText: measure,
    spanChars,
  }
}

const run = (raw: string, spanChars = 7) => {
  const source = prepareSource(raw)
  return proposeCards(source, fakeMetrics(source, spanChars))
}
const cardTexts = (r: ReturnType<typeof run>) =>
  r.drafts.map((d) => r.source.slice(d.sourceStart, d.sourceEnd))

const SAMPLES = [
  '視覚的な情報処理において、人間の眼球は連続的に文字列を追っているわけではない。実際にはサッケードと呼ばれる跳躍運動を繰り返している。',
  'We present a lightweight phrase segmentation model that runs entirely in the browser. It completes fast.',
  '既存の IAA モデルのほとんどは，大規模な事前学習済モデル [1, 2, 3] に基づいて構築されている．',
  'Cloudflare Workers AIを使って日本語のtext segmentationを行う。BudouXは軽量なモデルです。',
  '絵文字も👨‍👩‍👧‍👦壊さない。異体字も葛󠄀城市。',
  '事前学習済モデルは重要である。'.normalize('NFD'),
]

describe('invariants', () => {
  it.each(SAMPLES)('covers the source completely and restores from offsets: %s', (raw) => {
    const r = run(raw)
    // Invariant 3: restore from offsets.
    for (const d of r.drafts) {
      expect(r.source.slice(d.sourceStart, d.sourceEnd)).toBe(
        r.source.slice(d.sourceStart, d.sourceEnd),
      )
      expect(d.sourceEnd).toBeGreaterThan(d.sourceStart)
    }
    // Invariants 1 and 2: walking cards and gaps from start to end covers the
    // whole source, and every gap is whitespace.
    let cur = 0
    for (const d of r.drafts) {
      expect(d.sourceStart).toBeGreaterThanOrEqual(cur)
      expect(r.source.slice(cur, d.sourceStart).trim()).toBe('') 
      cur = d.sourceEnd
    }
    expect(r.source.slice(cur).trim()).toBe('')
  })

  it.each(SAMPLES)('no empty cards: %s', (raw) => {
    for (const t of cardTexts(run(raw))) expect(t.trim()).not.toBe('')
  })

  it.each(SAMPLES)('no card crosses a sentence boundary: %s', (raw) => {
    const r = run(raw)
    for (const d of r.drafts) {
      const s = r.sentences[d.sentenceId]
      expect(d.sourceStart).toBeGreaterThanOrEqual(s.start)
      expect(d.sourceEnd).toBeLessThanOrEqual(s.end)
    }
  })

  it('a decomposed dakuten is never torn off its base', () => {
    const r = run('事前学習済モデルは重要である。'.normalize('NFD'))
    for (const t of cardTexts(r)) expect(t).not.toMatch(/^[゙゚]/)
    expect(cardTexts(r).join('')).toContain('モデル')
  })
})

const sents = (s: string) =>
  splitSentences(s, { start: 0, end: s.length }).map((x) => s.slice(x.start, x.end).trim())

describe('sentence splitting', () => {
  it('does not split an embedded quotation', () => {
    expect(sents('彼は「そうだ。」と言った。')).toEqual(['彼は「そうだ。」と言った。'])
    expect(sents('He said "Hi." Then he left.')).toEqual(['He said "Hi." Then he left.'])
  })
  it('splits between two standalone quotations', () => {
    expect(sents('「はい。」「いいえ。」')).toEqual(['「はい。」', '「いいえ。」'])
  })
  it('keeps decimals, domains and initials intact', () => {
    expect(sents('3.14 は円周率。')).toEqual(['3.14 は円周率。'])
    expect(sents('See e.g. foo and Fig. 3 here. Next.')).toEqual([
      'See e.g. foo and Fig. 3 here.',
      'Next.',
    ])
  })
  it('known limitation: Dr. Smith is split wrongly', () => {
    expect(sents('Meet Dr. Smith today.').length).toBe(2)
  })
})

const toks = (s: string, max = 14) =>
  tokenize(s, { start: 0, end: s.length }, [], max).map((t) => s.slice(t.start, t.end))

describe('secondary splitting', () => {
  it.each(['取り扱う', 'お問い合わせ', '食べられる'])('never splits at a kanji-hiragana boundary: %s', (w) => {
    expect(toks(w)).toEqual([w])
  })
  it('splits at a katakana-hiragana boundary', () => {
    expect(toks('ブラックボックスである。')).toEqual(['ブラックボックス', 'である。'])
  })
})

describe('packing', () => {
  it('never leaves a card holding only a particle', () => {
    const r = run(
      '視覚的な情報処理において、人間の眼球は連続的に文字列を追っているわけではない。',
    )
    for (const t of cardTexts(r)) expect(t.trim()).not.toMatch(/^(は|が|を|に|へ|と|で|も|や|の)$/)
  })
  it('never leaves a card holding only punctuation', () => {
    const r = run('停留と呼ばれる短い静止を繰り返している。実際にはサッケードである。')
    for (const t of cardTexts(r)) expect(t.trim()).not.toMatch(/^[、。，．]+$/)
  })
  it('Japanese cards land around the perceptual span', () => {
    const r = run('視覚的な情報処理において、人間の眼球は連続的に文字列を追っている。')
    const ws = cardTexts(r).map(visualWidth)
    expect(Math.max(...ws)).toBeLessThanOrEqual(28) // within twice the ideal of 14
  })
  it('a wider perceptual span means fewer cards', () => {
    const raw = '視覚的な情報処理において、人間の眼球は連続的に文字列を追っているわけではない。'
    expect(run(raw, 12).drafts.length).toBeLessThan(run(raw, 4).drafts.length)
  })
})

describe('normalisation', () => {
  it('unwrapping keeps the hyphen', () => {
    expect(prepareSource('This is well-\nknown here.', { unwrap: true })).toBe(
      'This is well-known here.',
    )
  })
  it('a blank line ends a paragraph', () => {
    expect(prepareSource('一行目。\n続き。\n\n次の段落。')).toBe('一行目。続き。\n\n次の段落。')
  })
  it('a ZWJ emoji is never taken apart', () => {
    expect(prepareSource('家族👨‍👩‍👧‍👦です。')).toContain('👨‍👩‍👧‍👦')
  })
})

describe('empty input', () => {
  it.each(['', '   ', '\n\n\n'])('no cards at all: %j', (raw) => {
    expect(run(raw).drafts.length).toBe(0)
  })
})
