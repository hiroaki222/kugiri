/** Everything is scanned by grapheme cluster. Walking code points splits
 *  combining marks, ZWJ emoji and surrogate pairs. Environments without
 *  Intl.Segmenter are out of scope rather than served by a broken fallback. */
const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' })

export function graphemes(text: string): string[] {
  const out: string[] = []
  for (const { segment } of segmenter.segment(text)) out.push(segment)
  return out
}

export function graphemeCount(text: string): number {
  let n = 0
  for (const _ of segmenter.segment(text)) n++
  return n
}

const WIDE =
  /[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-｠￠-￦]/
const EMOJI = /\p{Extended_Pictographic}/u

/** Full width counts 2, half width 1. Used only to time a card, never to
 *  decide what fits: in a proportional face two strings of equal visual width
 *  can differ in real width by almost double. */
export function visualWidth(text: string): number {
  let w = 0
  for (const g of segmenter.segment(text)) {
    const c = g.segment
    w += WIDE.test(c) || EMOJI.test(c) ? 2 : 1
  }
  return w
}

const CJK = /[぀-ヿ㐀-䶿一-鿿]/

export function hasCJK(text: string): boolean {
  return CJK.test(text)
}

/** How Japanese a sentence is. "Any CJK character means Japanese" is too
 *  coarse: one proper noun would flip a long English sentence. */
export function cjkRatio(text: string): number {
  const total = visualWidth(text)
  if (total === 0) return 0
  let cjk = 0
  for (const { segment } of segmenter.segment(text)) {
    if (CJK.test(segment)) cjk += 2
  }
  return cjk / total
}

/**
 * Prefix index of grapheme counts over the whole source.
 * Correcting for letter-spacing needs the grapheme count of every candidate,
 * and running Intl.Segmenter per candidate dominates the packing cost — six
 * times slower when measured. One pass here makes each lookup O(1).
 */
export function buildGraphemeIndex(source: string): (start: number, end: number) => number {
  const cum = new Uint32Array(source.length + 1)
  let off = 0
  let n = 0
  for (const { segment } of segmenter.segment(source)) {
    for (let k = 0; k < segment.length; k++) cum[off + k] = n
    off += segment.length
    n++
  }
  cum[source.length] = n
  return (start, end) => cum[Math.min(end, source.length)] - cum[Math.min(start, source.length)]
}
