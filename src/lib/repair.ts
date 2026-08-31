import type { DraftCard, Proposal } from './segment'
import type { Token } from './tokenize'
import { visualWidth } from './width'

export type FitReason = 'atomic' | 'no-good-split'
export type CardFit = { mode: 'normal' } | { mode: 'scroll'; reason: FitReason }

export type Card = {
  text: string
  sourceStart: number
  sourceEnd: number
  sentenceId: number
  paragraphId: number
  isSentenceEnd: boolean
  isParagraphEnd: boolean
  /** visual width。滞留時間の計算専用。 */
  width: number
  measuredPx: number
  fit: CardFit
}

export type RepairDeps = {
  hardMaxPx: number
  exactWidth: (texts: string[]) => number[]
  /** バッチ境界で呼ぶ。false なら打ち切って null を返す。
   *  gen を数値で渡しても「今の世代」を観測できないので述語を渡す。 */
  isCurrent: () => boolean
  /** テスト用。既定は 512 */
  batchSize?: number
  /** バッチ境界で譲る。既定は requestAnimationFrame 相当 */
  yieldTo?: () => Promise<void>
}

const defaultYield = () =>
  new Promise<void>((r) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => r())
    else setTimeout(r, 0)
  })

type Piece = {
  tokenStart: number
  tokenEnd: number
  draft: DraftCard
  /** 分割で生まれた片のうち最後か (終端フラグを持つのは最後だけ) */
  isLast: boolean
}

function trimmedSpan(source: string, a: number, b: number) {
  const raw = source.slice(a, b)
  const lead = raw.length - raw.trimStart().length
  const trail = raw.length - raw.trimEnd().length
  return { start: a + lead, end: b - trail }
}

/**
 * DP の結果を隠し DOM で測り直し、hardMaxPx を超えたカードを直す。
 * 責務は「絶対に収まる」ことだけで、品質の最適化は DP に任せる。
 */
export async function repair(p: Proposal, d: RepairDeps): Promise<Card[] | null> {
  const { source, tokens, drafts } = p
  const batch = d.batchSize ?? 512
  const yieldTo = d.yieldTo ?? defaultYield

  const spanText = (a: number, b: number) => {
    const t = trimmedSpan(source, tokens[a].start, tokens[b - 1].end)
    return source.slice(t.start, t.end)
  }

  const out: Card[] = []

  const emit = (piece: Piece, px: number, fit: CardFit) => {
    const t = trimmedSpan(source, tokens[piece.tokenStart].start, tokens[piece.tokenEnd - 1].end)
    const text = source.slice(t.start, t.end)
    out.push({
      text,
      sourceStart: t.start,
      sourceEnd: t.end,
      sentenceId: piece.draft.sentenceId,
      paragraphId: piece.draft.paragraphId,
      // 終端フラグは最後の分割片にだけ移す。全片にコピーすると途中カードまで
      // 文末扱いになり、滞留時間と全文カードの位置が壊れる。
      isSentenceEnd: piece.isLast && piece.draft.isSentenceEnd,
      isParagraphEnd: piece.isLast && piece.draft.isParagraphEnd,
      width: visualWidth(text),
      measuredPx: px,
      fit,
    })
  }

  const reasonOf = (tokenStart: number, tokenEnd: number): FitReason =>
    tokenEnd - tokenStart === 1 && tokens[tokenStart].atomic ? 'atomic' : 'no-good-split'

  for (let start = 0; start < drafts.length; start += batch) {
    if (!d.isCurrent()) return null
    const slice = drafts.slice(start, start + batch)
    const widths = d.exactWidth(slice.map((c) => spanText(c.tokenStart, c.tokenEnd)))

    for (const [k, draft] of slice.entries()) {
      const px = widths[k]
      if (px <= d.hardMaxPx) {
        emit({ tokenStart: draft.tokenStart, tokenEnd: draft.tokenEnd, draft, isLast: true }, px, {
          mode: 'normal',
        })
        continue
      }
      // 違反カード: 全 prefix を1回のバッチでまとめて実測する。
      // 初回バッチで測ってあるのは DraftCard 全体だけで、prefix は未測定。
      let i = draft.tokenStart
      const end = draft.tokenEnd
      const parts: { s: number; e: number; px: number; fit: CardFit }[] = []
      while (i < end) {
        const cands: number[] = []
        for (let j = i + 1; j <= end; j++) cands.push(j)
        const texts = cands.map((j) => spanText(i, j))
        const ws = d.exactWidth(texts)
        // 収まる prefix が1つ以上あれば最大の k を選ぶ。
        // 1つも無いなら先頭トークンだけを scroll として確定する
        // (単一トークンが超過しているなら「収まる候補」は存在しない)。
        let best = -1
        for (let n = 0; n < cands.length; n++) if (ws[n] <= d.hardMaxPx) best = n
        if (best >= 0) {
          parts.push({ s: i, e: cands[best], px: ws[best], fit: { mode: 'normal' } })
          i = cands[best]
        } else {
          parts.push({
            s: i,
            e: i + 1,
            px: ws[0],
            fit: { mode: 'scroll', reason: reasonOf(i, i + 1) },
          })
          i = i + 1
        }
      }
      parts.forEach((part, n) =>
        emit(
          { tokenStart: part.s, tokenEnd: part.e, draft, isLast: n === parts.length - 1 },
          part.px,
          part.fit,
        ),
      )
    }
    if (start + batch < drafts.length) {
      await yieldTo()
      if (!d.isCurrent()) return null
    }
  }
  return out
}

/** 段落のカード範囲は repair が全部終わってから再計算する。 */
export function paragraphRanges(cards: Card[], count: number) {
  const out = Array.from({ length: count }, (_, id) => ({ id, cardStart: -1, cardEnd: -1 }))
  cards.forEach((c, i) => {
    const p = out[c.paragraphId]
    if (!p) return
    if (p.cardStart < 0) p.cardStart = i
    p.cardEnd = i + 1
  })
  return out.filter((p) => p.cardStart >= 0)
}

export type { Token }
