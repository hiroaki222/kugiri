import { normalize, paragraphSpans, type NormalizeOptions } from './normalize'
import { splitSentences, type Span } from './sentences'
import { tokenize, type Token } from './tokenize'
import { pack, type PackMetrics } from './pack'
import { visualWidth, cjkRatio } from './width'

export type DraftCard = {
  tokenStart: number
  tokenEnd: number
  sourceStart: number
  sourceEnd: number
  sentenceId: number
  paragraphId: number
  isSentenceEnd: boolean
  isParagraphEnd: boolean
  width: number
  atomic: boolean
}

export type ProposalMetrics = {
  /** 文ごとに ja/en を選ぶので単一値では持てない (日英混在文書で破綻する) */
  idealPxFor: (sentenceText: string) => number
  hardMaxPx: number
  approxSpan: (start: number, end: number) => number
  /** 知覚スパンの px 換算に使う。span の外の文字列を測る唯一の経路 */
  approxText: (text: string) => number
  spanChars: number
}

export type Proposal = {
  source: string
  tokens: Token[]
  drafts: DraftCard[]
  sentences: (Span & { id: number; paragraphId: number })[]
  paragraphs: (Span & { id: number })[]
  /** 測定回数。ベンチマーク用 */
  measureCalls: number
}

export function prepareSource(raw: string, opts?: NormalizeOptions): string {
  return normalize(raw, opts)
}

/** 同期・DOM layout 非依存。「純粋」とは呼ばない —
 *  approxWidth は canvas とフォント状態に依存するクロージャなので、
 *  同じ引数でも状態次第で結果が変わりうる。 */
export function proposeCards(
  source: string,
  m: ProposalMetrics,
  protectedSpans: Span[] = [],
): Proposal {
  const tokens: Token[] = []
  const drafts: DraftCard[] = []
  const sentences: (Span & { id: number; paragraphId: number })[] = []
  const paragraphs: (Span & { id: number })[] = []
  let calls = 0
  const counted = (a: number, b: number) => {
    calls++
    return m.approxSpan(a, b)
  }

  for (const [pi, para] of paragraphSpans(source).entries()) {
    paragraphs.push({ ...para, id: pi })
    const firstDraft = drafts.length
    for (const sent of splitSentences(source, para, protectedSpans)) {
      const sid = sentences.length
      sentences.push({ ...sent, id: sid, paragraphId: pi })
      const text = source.slice(sent.start, sent.end)
      const idealPx = m.idealPxFor(text)
      const toks = tokenize(source, sent, protectedSpans, m.spanChars * 2)
      const base = tokens.length
      tokens.push(...toks)
      const packed: PackMetrics = {
        idealPx,
        hardMaxPx: m.hardMaxPx,
        approxSpan: counted,
      }
      const groups = pack(source, toks, packed)
      groups.forEach((g, gi) => {
        const s = g[0].start
        const e = g[g.length - 1].end
        const raw = source.slice(s, e)
        const lead = raw.length - raw.trimStart().length
        const trail = raw.length - raw.trimEnd().length
        drafts.push({
          tokenStart: base + toks.indexOf(g[0]),
          tokenEnd: base + toks.indexOf(g[g.length - 1]) + 1,
          sourceStart: s + lead,
          sourceEnd: e - trail,
          sentenceId: sid,
          paragraphId: pi,
          isSentenceEnd: gi === groups.length - 1,
          isParagraphEnd: false,
          width: visualWidth(raw.trim()),
          atomic: g.length === 1 && g[0].atomic,
        })
      })
    }
    if (drafts.length > firstDraft) drafts[drafts.length - 1].isParagraphEnd = true
  }
  return { source, tokens, drafts, sentences, paragraphs, measureCalls: calls }
}

/** 知覚スパン: 日本語 全角7字 / 英語 半角12字 (同定できる範囲 3–4 + 7–8) */
export function makeIdealPxFor(
  approxText: (t: string) => number,
  spanChars: number,
): (text: string) => number {
  const ja = approxText('あ'.repeat(spanChars))
  const en = approxText('n'.repeat(Math.round((spanChars / 7) * 12)))
  return (text: string) => (cjkRatio(text) >= 0.3 ? ja : en)
}
