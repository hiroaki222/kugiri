import type { Token } from './tokenize'

// 実測: 既定設定のカードは最大3トークン (平均1.6-1.9)。16 は5倍の余裕。
// これで repair の最悪測定回数も O(16²)=256 に収まる。
export const MAX_TOKENS_PER_CARD = 16

export type PackMetrics = {
  /** 知覚スパン由来の目標幅。コスト関数の基準。 */
  idealPx: number
  /** 物理的に超えられない幅。溢れ判定の基準。 */
  hardMaxPx: number
  /** source 上の span の近似幅。DP のループから何万回も呼ばれるので、
   *  文字列の再確保と書記素の再走査を内側に閉じ込める。 */
  approxSpan: (start: number, end: number) => number
}

const PARTICLES = /^(?:は|が|を|に|へ|と|で|も|や|の|から|まで|より)$/
const COMMA_END = /[、，,]\s*$/
const OPEN_END = /[「『（(【]\s*$/
const PUNCT_ONLY = /^[\s、。，．・！？!?…」』）\])：；:;]+$/

type Best = { cost: number; cards: number; lastW: number; from: number }

/**
 * slack² 最小化 DP (Knuth-Plass 型)。
 *
 * 貪欲だと文末が「を」1文節だけのカードになる。全カードに slack² を課すと
 * 等分性が最適に得られる (カード数 k 固定なら Σ(ideal−w)² は w が均等なとき最小)。
 *
 * カードは文境界を跨がない前提 (pack は文ごとに呼ぶ)。その帰結として文末カードは
 * 常に文の最後になるので「文末で切れるなら得」という割引は分割位置に寄与しない。
 */
export function pack(source: string, tokens: Token[], m: PackMetrics): Token[][] {
  const n = tokens.length
  if (n === 0) return []

  const CARD_COST = m.idealPx ** 2 * 0.2 // これが無いと読点の報酬だけで細切れが最適になる
  const BAD = m.idealPx ** 2
  const GOOD = m.idealPx ** 2 * 0.15
  const OVER_K = 3

  const textOf = (i: number, j: number) => source.slice(tokens[i].start, tokens[j - 1].end).trim()

  const cardCost = (i: number, j: number, wPx: number): number => {
    // 幅の項だけを不足/超過で切り替える。固定コストと言語ペナルティは共通部分に置く。
    // 超過側で早期 return すると、幅がちょうど ideal なら 0.2*ideal² なのに
    // 1px 超えると ~0 になり「わずかに超過したカード」を常に強く好んでしまう。
    const slack =
      wPx <= m.idealPx ? (m.idealPx - wPx) ** 2 : OVER_K * (wPx - m.idealPx) ** 2
    let cost = slack + CARD_COST
    const text = textOf(i, j)
    const last = source.slice(tokens[j - 1].start, tokens[j - 1].end)
    if (COMMA_END.test(last)) cost -= GOOD
    if (OPEN_END.test(last)) cost += BAD * 2
    if (PUNCT_ONLY.test(text)) cost += BAD * 2
    else if (PARTICLES.test(text.trim())) cost += BAD
    return cost // 負を許す。max(0,..) で潰すと同点が増えて走査順依存になる
  }

  // 候補の絞り込み: トークン単体幅の累積和で「見込み幅」を出し、明らかに
  // 圏外の候補は measure せずに捨てる。これはヒューリスティックであって
  // 最適解を保つ証明はない (単体幅の和はシェーピングのせいで連結幅の下界ですらない)。
  // 正しさ = 溢れないことは repair が担保するので、ここで落ちるのは品質だけ。
  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i] + m.approxSpan(tokens[i].start, tokens[i].end)
  }

  const best: (Best | null)[] = Array(n + 1).fill(null)
  best[0] = { cost: 0, cards: 0, lastW: 0, from: -1 }

  for (let j = 1; j <= n; j++) {
    const lo = Math.max(0, j - MAX_TOKENS_PER_CARD)
    for (let i = j - 1; i >= lo; i--) {
      const prev = best[i]
      if (!prev) continue
      const est = prefix[j] - prefix[i]
      // 明らかに広すぎる候補は measure しない。単一トークンは常に残す。
      if (est > m.hardMaxPx * 1.2 && j - i > 1) break
      // 明らかに狭すぎる候補も measure しない。ただし文の最終カードは短くなりうる。
      if (est < m.idealPx * 0.3 && j < n) continue
      const wPx = m.approxSpan(tokens[i].start, tokens[j - 1].end)
      // 単一トークンは常に候補に残す (best[j] が未定義にならないように)。
      // hardMaxPx を超えていても repair が scroll に送って確定させる。
      if (wPx > m.hardMaxPx && j - i > 1) continue
      const cost = prev.cost + cardCost(i, j, wPx)
      const cand: Best = { cost, cards: prev.cards + 1, lastW: wPx, from: i }
      const cur = best[j]
      if (
        !cur ||
        cand.cost < cur.cost - 1e-9 ||
        (Math.abs(cand.cost - cur.cost) <= 1e-9 &&
          (cand.cards < cur.cards ||
            (cand.cards === cur.cards && cand.lastW > cur.lastW)))
      ) {
        best[j] = cand
      }
    }
  }

  const out: Token[][] = []
  let j = n
  while (j > 0) {
    const b = best[j]
    if (!b) break // 到達不能 (起きない設計だが安全側)
    out.unshift(tokens.slice(b.from, j))
    j = b.from
  }
  return out
}
