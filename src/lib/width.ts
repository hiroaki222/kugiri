/** 書記素クラスタ単位で走査する。コードポイント単位だと結合文字・ZWJ 絵文字・
 *  サロゲートペアを割ってしまう。Intl.Segmenter 未対応環境は対象外とする。 */
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

/** 全角=2 / 半角=1。滞留時間の計算にだけ使う。詰める判断には使わない
 *  (プロポーショナル書体では同じ visual width でも実幅が倍近くずれる)。 */
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

/** 文が主に日本語か。1文字でも CJK なら日本語、は粗すぎる
 *  (長い英文に固有名詞が1つ入っただけで切り替わってしまう)。 */
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
 * source 全体の書記素数の累積索引。
 * letter-spacing の補正には候補ごとの書記素数が要るが、候補のたびに
 * Intl.Segmenter を回すと DP の支配的コストになる (実測で 6倍遅くなった)。
 * 1回だけ走査して O(1) で引けるようにする。
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
