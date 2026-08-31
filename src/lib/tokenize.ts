import { loadDefaultJapaneseParser } from 'budoux'
import type { Span } from './sentences'
import { graphemes, hasCJK, visualWidth } from './width'

/** A token is a half-open span over the source, never a string. Joining token
 *  strings drops the trailing space of each one, turning `hello world` into
 *  `helloworld` and breaking the invariant that a card can be restored from
 *  its offsets. */
export type Token = Span & {
  /** A protected span (URL, address) that must never be split. Why it ends up
   *  displayed the way it does is decided later, by repair. */
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
 * Splits a phrase that came out too long. BudouX chunks routinely exceed the
 * perceptual span: in a real paper, 3 of 30 chunks were wider than 14, the
 * longest 23.
 *
 * Only high-confidence boundaries are used: whitespace, punctuation, and the
 * seam between Latin and Japanese. Kanji-to-kana is not one of them. Without a
 * dictionary, the general rule "break after kanji" and the expectation "do not
 * break 取り扱う" cannot both hold, and the general rule is the one to drop.
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
    // Katakana next to hiragana almost always marks the seam between a content
    // word and what attaches to it (ブラックボックス|である), so it is safe.
    // Kanji next to hiragana is not: it breaks 取り扱う and 食べられる.
    const highConfidence =
      a === 's' || b === 's' || a === 'p' || b === 'p' ||
      (a === 'a') !== (b === 'a') || // Latin against Japanese
      (a === 'k' && b === 'h') || (a === 'h' && b === 'k')
    if (highConfidence) cuts.push(i)
  }
  if (!cuts.length) return [tok]

  const out: Span[] = []
  let s = 0
  for (const c of cuts) {
    const head = g.slice(s, c).join('')
    const tail = g.slice(c).join('')
    // Never leave a fragment of nothing but punctuation, which would show up
    // as a card holding a single full stop.
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
 * Turns a sentence into tokens. A protected span becomes one opaque token, and
 * only the text around it is handed to BudouX.
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
    // BudouX returns strings, so spans are recovered with a cursor that only
    // moves forward through the original text. Searching with indexOf breaks
    // as soon as a word repeats.
    let c = from
    for (const chunk of chunks) {
      // English inside a chunk is split again, decided purely by whether the
      // chunk holds whitespace. The pattern has to keep the leading space:
      // BudouX returns chunks like " IAA モデルの", and \S+\s* would drop it,
      // sliding the cursor and swallowing characters.
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
