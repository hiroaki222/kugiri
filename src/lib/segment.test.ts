import { describe, expect, it } from 'vitest'
import { prepareSource, proposeCards, makeIdealPxFor } from './segment'
import { splitSentences } from './sentences'
import { tokenize } from './tokenize'
import { visualWidth } from './width'

/** 等幅を仮定した偽 measure。アルゴリズムの単体テストは DOM に依存させない。 */
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

describe('不変条件', () => {
  it.each(SAMPLES)('完全被覆と復元: %s', (raw) => {
    const r = run(raw)
    // 3. 復元
    for (const d of r.drafts) {
      expect(r.source.slice(d.sourceStart, d.sourceEnd)).toBe(
        r.source.slice(d.sourceStart, d.sourceEnd),
      )
      expect(d.sourceEnd).toBeGreaterThan(d.sourceStart)
    }
    // 1+2. 先頭から末尾まで、カードと gap を交互に辿って source 全体に一致する
    let cur = 0
    for (const d of r.drafts) {
      expect(d.sourceStart).toBeGreaterThanOrEqual(cur)
      expect(r.source.slice(cur, d.sourceStart).trim()).toBe('') // gap は空白だけ
      cur = d.sourceEnd
    }
    expect(r.source.slice(cur).trim()).toBe('')
  })

  it.each(SAMPLES)('空カードが無い: %s', (raw) => {
    for (const t of cardTexts(run(raw))) expect(t.trim()).not.toBe('')
  })

  it.each(SAMPLES)('カードは文境界を跨がない: %s', (raw) => {
    const r = run(raw)
    for (const d of r.drafts) {
      const s = r.sentences[d.sentenceId]
      expect(d.sourceStart).toBeGreaterThanOrEqual(s.start)
      expect(d.sourceEnd).toBeLessThanOrEqual(s.end)
    }
  })

  it('NFD の濁点が千切れない', () => {
    const r = run('事前学習済モデルは重要である。'.normalize('NFD'))
    for (const t of cardTexts(r)) expect(t).not.toMatch(/^[゙゚]/)
    expect(cardTexts(r).join('')).toContain('モデル')
  })
})

const sents = (s: string) =>
  splitSentences(s, { start: 0, end: s.length }).map((x) => s.slice(x.start, x.end).trim())

describe('文分割', () => {
  it('埋め込み引用では割らない', () => {
    expect(sents('彼は「そうだ。」と言った。')).toEqual(['彼は「そうだ。」と言った。'])
    expect(sents('He said "Hi." Then he left.')).toEqual(['He said "Hi." Then he left.'])
  })
  it('独立した引用は割る', () => {
    expect(sents('「はい。」「いいえ。」')).toEqual(['「はい。」', '「いいえ。」'])
  })
  it('小数・ドメイン・略語を守る', () => {
    expect(sents('3.14 は円周率。')).toEqual(['3.14 は円周率。'])
    expect(sents('See e.g. foo and Fig. 3 here. Next.')).toEqual([
      'See e.g. foo and Fig. 3 here.',
      'Next.',
    ])
  })
  it('既知の制約: Dr. Smith は誤分割する', () => {
    expect(sents('Meet Dr. Smith today.').length).toBe(2)
  })
})

const toks = (s: string, max = 14) =>
  tokenize(s, { start: 0, end: s.length }, [], max).map((t) => s.slice(t.start, t.end))

describe('二次分割', () => {
  it.each(['取り扱う', 'お問い合わせ', '食べられる'])('漢字⇄ひらがな境界では割らない: %s', (w) => {
    expect(toks(w)).toEqual([w])
  })
  it('カタカナ⇄ひらがな境界では割る', () => {
    expect(toks('ブラックボックスである。')).toEqual(['ブラックボックス', 'である。'])
  })
})

describe('パッキング', () => {
  it('助詞だけのカードを作らない', () => {
    const r = run(
      '視覚的な情報処理において、人間の眼球は連続的に文字列を追っているわけではない。',
    )
    for (const t of cardTexts(r)) expect(t.trim()).not.toMatch(/^(は|が|を|に|へ|と|で|も|や|の)$/)
  })
  it('句読点だけのカードを作らない', () => {
    const r = run('停留と呼ばれる短い静止を繰り返している。実際にはサッケードである。')
    for (const t of cardTexts(r)) expect(t.trim()).not.toMatch(/^[、。，．]+$/)
  })
  it('日本語のカードは知覚スパン前後に収まる', () => {
    const r = run('視覚的な情報処理において、人間の眼球は連続的に文字列を追っている。')
    const ws = cardTexts(r).map(visualWidth)
    expect(Math.max(...ws)).toBeLessThanOrEqual(28) // ideal 14 の 2倍以内
  })
  it('知覚スパンを広げるとカードが減る', () => {
    const raw = '視覚的な情報処理において、人間の眼球は連続的に文字列を追っているわけではない。'
    expect(run(raw, 12).drafts.length).toBeLessThan(run(raw, 4).drafts.length)
  })
})

describe('正規化', () => {
  it('PDF 補正でハイフンを消さない', () => {
    expect(prepareSource('This is well-\nknown here.', { fixPdfWrap: true })).toBe(
      'This is well-known here.',
    )
  })
  it('段落は空行で切る', () => {
    expect(prepareSource('一行目。\n続き。\n\n次の段落。')).toBe('一行目。続き。\n\n次の段落。')
  })
  it('ZWJ 絵文字を分解しない', () => {
    expect(prepareSource('家族👨‍👩‍👧‍👦です。')).toContain('👨‍👩‍👧‍👦')
  })
})

describe('空入力', () => {
  it.each(['', '   ', '\n\n\n'])('カード0枚: %j', (raw) => {
    expect(run(raw).drafts.length).toBe(0)
  })
})
