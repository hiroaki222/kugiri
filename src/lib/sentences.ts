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

/** 半角ピリオドの終端判定。約物を読み飛ばしてから次の文字を見る。
 *  `He said "Hi." Then` を扱うために必要。 */
function periodEndsSentence(g: string[], i: number): boolean {
  let k = i + 1
  while (k < g.length && CLOSE_SET.has(g[k])) k++
  // 直後が空白か文末
  if (k < g.length && !SKIP_AFTER.has(g[k])) return false
  while (k < g.length && SKIP_AFTER.has(g[k])) k++
  const next = g[k]
  // その次の非空白が 大文字 / CJK / 文末
  if (next !== undefined && !/[A-Z]/.test(next) && !/[぀-ヿ㐀-鿿]/.test(next)) return false
  // 「単独の大文字」の直後ではない: U.S. / J. R. R. を守る
  const prev = g[i - 1]
  const prev2 = g[i - 2]
  if (prev !== undefined && /^[A-Z]$/.test(prev) && (prev2 === undefined || !/[A-Za-z]/.test(prev2)))
    return false
  return true
}

/**
 * 括弧の深さを見る手書きスキャナ。
 *
 * 素朴な「depth === 0 のときだけ終端判定」では要求を満たせない —
 * 「はい。」「いいえ。」も He said "Hi." も終端記号が括弧の内側にあるので
 * 候補にすらならない。一方 彼は「そうだ。」と言った。 では切ってはいけない。
 * よって内側の終端は「保留候補」としてフレームに覚え、閉じ括弧まで読んでから
 * 「次に何が来るか」で確定/破棄を決める。
 *
 * @param protectedSpans この内側には境界を置かない (URL・メール)
 */
export function splitSentences(
  source: string,
  span: Span,
  protectedSpans: Span[] = [],
): Span[] {
  const text = source.slice(span.start, span.end)
  const g = graphemes(text)
  // 書記素 index -> source offset
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
        // 閉じ括弧の後、空白と連続する閉じ括弧を読み飛ばして次を見る
        let k = i + 1
        while (k < g.length && (SKIP_AFTER.has(g[k]) || CLOSE_SET.has(g[k]))) k++
        const next = g[k]
        // 別の開き括弧 or 段落の終端 → 確定。本文が続く → 破棄。
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
      // 内側の終端は保留にする
      if (stack.length) stack[stack.length - 1].pending = i
      continue
    }
    // 連続する終端記号 (！？ ……) と後続の閉じ括弧を飲んでから切る
    let k = i
    while (k + 1 < g.length && (TERM.has(g[k + 1]) || g[k + 1] === '.')) k++
    while (k + 1 < g.length && CLOSE_SET.has(g[k + 1])) k++
    cut(k + 1)
    i = k
  }
  if (start < g.length) cut(g.length)
  return out
}
