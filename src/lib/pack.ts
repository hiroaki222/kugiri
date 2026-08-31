import type { Token } from './tokenize'

// Measured: at the default settings a card holds at most 3 tokens, 1.6-1.9 on
// average. 16 is five times that, and it caps repair's worst case at O(16²).
export const MAX_TOKENS_PER_CARD = 16

export type PackMetrics = {
  /** Target width, from the perceptual span. What the cost function aims at. */
  idealPx: number
  /** Width that cannot be exceeded physically. What overflow is judged against. */
  hardMaxPx: number
  /** Approximate width of a span. Called tens of thousands of times from the
   *  inner loop, so slicing and re-scanning stay inside it. */
  approxSpan: (start: number, end: number) => number
}

const PARTICLES = /^(?:は|が|を|に|へ|と|で|も|や|の|から|まで|より)$/
const COMMA_END = /[、，,]\s*$/
const OPEN_END = /[「『（(【]\s*$/
const PUNCT_ONLY = /^[\s、。，．・！？!?…」』）\])：；:;]+$/

type Best = { cost: number; cards: number; lastW: number; from: number }

/**
 * Knuth-Plass style dynamic programming, minimising squared slack.
 *
 * Filling greedily leaves a sentence ending on a card holding one particle.
 * Charging squared slack to every card makes evenness fall out for free: with
 * the card count fixed, the sum of (ideal − w)² is smallest when the widths
 * are equal.
 *
 * Cards never cross a sentence boundary, because pack is called per sentence.
 * That makes the last card of a sentence the last card by construction, so a
 * bonus for "ends a sentence" would not affect where anything is cut.
 */
export function pack(source: string, tokens: Token[], m: PackMetrics): Token[][] {
  const n = tokens.length
  if (n === 0) return []

  // Without a per-card cost, the comma bonus alone makes shredding optimal.
  const CARD_COST = m.idealPx ** 2 * 0.2
  const BAD = m.idealPx ** 2
  const GOOD = m.idealPx ** 2 * 0.15
  const OVER_K = 3

  const textOf = (i: number, j: number) => source.slice(tokens[i].start, tokens[j - 1].end).trim()

  const cardCost = (i: number, j: number, wPx: number): number => {
    // Only the width term branches on under versus over. Returning early on
    // the over side would price a card at 0.2*ideal² when it is exactly ideal
    // and at almost nothing one pixel past it, which makes slightly-too-wide
    // cards look like the best option every time.
    const slack =
      wPx <= m.idealPx ? (m.idealPx - wPx) ** 2 : OVER_K * (wPx - m.idealPx) ** 2
    let cost = slack + CARD_COST
    const text = textOf(i, j)
    const last = source.slice(tokens[j - 1].start, tokens[j - 1].end)
    if (COMMA_END.test(last)) cost -= GOOD
    if (OPEN_END.test(last)) cost += BAD * 2
    if (PUNCT_ONLY.test(text)) cost += BAD * 2
    else if (PARTICLES.test(text.trim())) cost += BAD
    // Negative costs are allowed. Clamping at zero creates ties, and ties make
    // the result depend on the order candidates happen to be visited in.
    return cost
  }

  // Candidate pruning: a prefix sum of individual token widths gives a rough
  // width, and candidates far outside the range are dropped without measuring.
  // This is a heuristic with no proof that it preserves the optimum — because
  // of shaping, the sum of token widths is not even a lower bound on the width
  // of their concatenation. Correctness, meaning nothing overflows, is repair's
  // job, so all that can be lost here is quality.
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
      // Obviously too wide: skip the measurement, but never the single-token case.
      if (est > m.hardMaxPx * 1.2 && j - i > 1) break
      // Obviously too narrow, except at the end where a short card is expected.
      if (est < m.idealPx * 0.3 && j < n) continue
      const wPx = m.approxSpan(tokens[i].start, tokens[j - 1].end)
      // The single-token candidate always survives so best[j] is never left
      // undefined. If it is wider than hardMaxPx, repair sends it to a
      // scrolling card rather than leaving the packing without an answer.
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
    if (!b) break // Unreachable by construction; bail rather than loop.
    out.unshift(tokens.slice(b.from, j))
    j = b.from
  }
  return out
}
