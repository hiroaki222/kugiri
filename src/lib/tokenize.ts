import { loadDefaultJapaneseParser } from 'budoux'
import type { Span } from './sentences'
import { graphemes, hasCJK, visualWidth } from './width'

/** トークンは「文字列」ではなく source 上の half-open span として持つ。
 *  文字列を join('') するとトークン末尾の空白が落ちて `hello world` が
 *  `helloworld` になり、復元の不変条件を破る。 */
export type Token = Span & {
  /** 保護区間 (URL/メール)。分割してはいけない。表示理由は repair が決める。 */
  atomic: boolean
}

let parser: ReturnType<typeof loadDefaultJapaneseParser> | null = null
const getParser = () => (parser ??= loadDefaultJapaneseParser())

const PUNCT = /[、。，．・！？!?…「」『』（）()［］[\]｛｝〈〉《》：；:;]/
const ONLY_PUNCT = /^[\s、。，．・！？!?…」』）\])：；:;]*$/

type Kind = 'p' | 's' | 'j' | 'h' | 'k' | 'a' | 'o'
const kindOf = (c: string): Kind =>
  PUNCT.test(c) ? 'p'
  : /\s/.test(c) ? 's'
  : /[一-鿿々〆]/.test(c) ? 'j'
  : /[ぁ-ゖ]/.test(c) ? 'h'
  : /[ァ-ヺーｦ-ﾟ]/.test(c) ? 'k'
  : /[A-Za-z0-9]/.test(c) ? 'a'
  : 'o'

/**
 * 長すぎる文節を二次分割する。BudouX の chunk は知覚スパンを普通に超える
 * (実際の論文で 30 chunk 中 3 個が幅14超、最大23)。
 *
 * ただし割ってよいのは高信頼な境界だけ: 空白 / 約物 / ラテン・CJK の境目。
 * かな・漢字・カタカナの間では割らない — 辞書が無い以上「漢字→ひらがなで
 * 切る」という一般規則と「取り扱う を割らない」は両立しないので、
 * 一般規則のほうを捨てる。
 */
function subsplit(source: string, tok: Span, maxWidth: number): Span[] {
  const text = source.slice(tok.start, tok.end)
  if (visualWidth(text) <= maxWidth) return [tok]
  const g = graphemes(text)
  const offs: number[] = []
  let acc = tok.start
  for (const c of g) {
    offs.push(acc)
    acc += c.length
  }
  offs.push(acc)

  const cuts: number[] = []
  for (let i = 1; i < g.length; i++) {
    const a = kindOf(g[i - 1])
    const b = kindOf(g[i])
    if (a === b) continue
    // カタカナ ⇄ ひらがな は自立語→付属語の境目とほぼ一致するので割ってよい
    // (ブラックボックス|である)。漢字 ⇄ ひらがな は割らない — 取り扱う 食べられる が壊れる。
    const highConfidence =
      a === 's' || b === 's' || a === 'p' || b === 'p' ||
      (a === 'a') !== (b === 'a') ||   // ラテン ⇄ 和文
      (a === 'k' && b === 'h') || (a === 'h' && b === 'k')
    if (highConfidence) cuts.push(i)
  }
  if (!cuts.length) return [tok]

  const out: Span[] = []
  let s = 0
  for (const c of cuts) {
    const head = g.slice(s, c).join('')
    const tail = g.slice(c).join('')
    // 記号だけの断片を作らない (句点1文字のカードが生まれる)
    if (visualWidth(head) > 0 && !ONLY_PUNCT.test(tail) && visualWidth(head) >= maxWidth * 0.5) {
      out.push({ start: offs[s], end: offs[c] })
      s = c
    }
  }
  const rest = { start: offs[s], end: tok.end }
  if (rest.end > rest.start) {
    if (out.length && ONLY_PUNCT.test(source.slice(rest.start, rest.end))) {
      out[out.length - 1].end = rest.end
    } else out.push(rest)
  }
  return out.length ? out : [tok]
}

/**
 * 文をトークン列にする。
 * 保護区間は不透明な1トークンとして扱い、その前後だけを BudouX に渡す。
 */
export function tokenize(
  source: string,
  sentence: Span,
  protectedSpans: Span[],
  maxWidth: number,
): Token[] {
  const inside = protectedSpans
    .filter((p) => p.start < sentence.end && p.end > sentence.start)
    .toSorted((a, b) => a.start - b.start)

  const out: Token[] = []
  let cursor = sentence.start

  const runTokens = (from: number, to: number) => {
    if (to <= from) return
    const text = source.slice(from, to)
    const chunks = hasCJK(text) ? getParser().parse(text) : [text]
    // BudouX は文字列しか返さないので、返却順に単調に進むカーソルで
    // 元テキストに突き合わせて span を復元する。indexOf は同じ語の反復で壊れる。
    let c = from
    for (const chunk of chunks) {
      // 英語句の再分割: chunk が空白を含むかだけで判定する
      // \S+\s* だと先頭の空白を落とす。BudouX は " IAA モデルの" のように
      // 先頭空白を保持して返すので、カーソルがずれて文字が欠ける。
      const parts = /\s/.test(chunk) ? (chunk.match(/\s*\S+\s*/g) ?? [chunk]) : [chunk]
      for (const part of parts) {
        const span = { start: c, end: c + part.length }
        for (const sub of subsplit(source, span, maxWidth)) {
          if (source.slice(sub.start, sub.end).trim()) out.push({ ...sub, atomic: false })
        }
        c += part.length
      }
    }
  }

  for (const p of inside) {
    runTokens(cursor, Math.max(cursor, p.start))
    out.push({ start: Math.max(p.start, sentence.start), end: Math.min(p.end, sentence.end), atomic: true })
    cursor = Math.max(cursor, p.end)
  }
  runTokens(cursor, sentence.end)
  return out
}
