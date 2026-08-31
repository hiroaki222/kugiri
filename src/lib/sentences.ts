import { graphemes } from './width'

export type Span = { start: number; end: number }

const TERM = new Set('。．！？!?…')
const OPEN = '「『（(【〔《〈［['
const CLOSE = '」』）)】〕》〉］]'
const PAIR: Record<string, string> = {}
for (let i = 0; i < OPEN.length; i++) PAIR[OPEN[i]] = CLOSE[i]

const CLOSE_SET = new Set(CLOSE + '"”’')
const SKIP_AFTER = new Set([' ', '\t'])

type Frame = { close: string; pending: number | null }

/** Whether an ASCII period ends a sentence. Closing punctuation is skipped
 *  before looking at what follows, which is what `He said "Hi." Then` needs. */
function periodEndsSentence(g: string[], i: number): boolean {
  let k = i + 1
  while (k < g.length && CLOSE_SET.has(g[k])) k++
  // Whitespace or end of text has to follow.
  if (k < g.length && !SKIP_AFTER.has(g[k])) return false
  while (k < g.length && SKIP_AFTER.has(g[k])) k++
  const next = g[k]
  // The next non-space has to be a capital, a CJK character, or nothing.
  if (next !== undefined && !/[A-Z]/.test(next) && !/[぀-ヿ㐀-鿿]/.test(next)) return false
  // Not preceded by a lone capital, which keeps U.S. and J. R. R. intact.
  const prev = g[i - 1]
  const prev2 = g[i - 2]
  if (prev !== undefined && /^[A-Z]$/.test(prev) && (prev2 === undefined || !/[A-Za-z]/.test(prev2)))
    return false
  return true
}

/**
 * A hand-written scanner that tracks bracket depth.
 *
 * Only terminating at depth zero is not enough: in 「はい。」「いいえ。」 and in
 * He said "Hi." the terminator sits inside the quotes, so it never even becomes
 * a candidate — yet 彼は「そうだ。」と言った。 must not be split at the same
 * kind of position. So an inner terminator is remembered on its frame as a
 * pending candidate, and what follows the closing bracket decides whether it
 * becomes a break or is discarded.
 *
 * @param protectedSpans no boundary may fall inside these (URLs, addresses)
 */
export function splitSentences(
  source: string,
  span: Span,
  protectedSpans: Span[] = [],
): Span[] {
  const text = source.slice(span.start, span.end)
  const g = graphemes(text)
  // Grapheme index to source offset.
  const off: number[] = []
  let acc = span.start
  for (const c of g) {
    off.push(acc)
    acc += c.length
  }
  off.push(acc)

  const inProtected = (srcOff: number) =>
    protectedSpans.some((p) => srcOff > p.start && srcOff < p.end)

  const out: Span[] = []
  const stack: Frame[] = []
  let quote = false
  let start = 0

  const cut = (endIdx: number) => {
    const s = off[start]
    const e = off[endIdx]
    if (e > s && source.slice(s, e).trim()) out.push({ start: s, end: e })
    start = endIdx
  }

  for (let i = 0; i < g.length; i++) {
    const c = g[i]
    if (inProtected(off[i])) continue

    if (PAIR[c]) {
      stack.push({ close: PAIR[c], pending: null })
      continue
    }
    if (stack.length && c === stack[stack.length - 1].close) {
      const frame = stack.pop()!
      if (frame.pending !== null && stack.length === 0) {
        // Look past the closing bracket, any spaces and any further closers.
        let k = i + 1
        while (k < g.length && (SKIP_AFTER.has(g[k]) || CLOSE_SET.has(g[k]))) k++
        const next = g[k]
        // Another opening bracket, or the end: a real break. Body text
        // continuing means the quote was embedded, so the candidate is dropped.
        if (next === undefined || PAIR[next]) cut(k < g.length ? k : g.length)
      }
      continue
    }
    if (c === '"') {
      quote = !quote
      continue
    }

    const isTerm = TERM.has(c) || (c === '.' && periodEndsSentence(g, i))
    if (!isTerm) continue

    if (stack.length || quote) {
      // An inner terminator only becomes a candidate.
      if (stack.length) stack[stack.length - 1].pending = i
      continue
    }
    // Swallow runs of terminators (！？, ……) and any closers before cutting.
    let k = i
    while (k + 1 < g.length && (TERM.has(g[k + 1]) || g[k + 1] === '.')) k++
    while (k + 1 < g.length && CLOSE_SET.has(g[k + 1])) k++
    cut(k + 1)
    i = k
  }
  if (start < g.length) cut(g.length)
  return out
}
