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
  /** Visual width, used only to time the card. */
  width: number
  measuredPx: number
  fit: CardFit
}

export type RepairDeps = {
  hardMaxPx: number
  exactWidth: (texts: string[]) => number[]
  /** Asked at every batch boundary; false abandons the work and returns null.
   *  A predicate rather than a generation number, because a number passed in
   *  cannot tell us what the current generation has since become. */
  isCurrent: () => boolean
  /** For tests. Defaults to 512. */
  batchSize?: number
  /** Yields at a batch boundary. Defaults to a frame. */
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
  /** Last of the pieces a card was split into; only it carries the end flags. */
  isLast: boolean
}

function trimmedSpan(source: string, a: number, b: number) {
  const raw = source.slice(a, b)
  const lead = raw.length - raw.trimStart().length
  const trail = raw.length - raw.trimEnd().length
  return { start: a + lead, end: b - trail }
}

/**
 * Re-measures the packing against hidden DOM and fixes any card wider than
 * hardMaxPx. Its only responsibility is that nothing overflows; quality is the
 * packing's business.
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
      // End flags move to the last piece only. Copying them onto every piece
      // would make cards mid-sentence behave like sentence endings, throwing
      // off both their timing and where summaries appear.
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
      // Too wide: measure every prefix of it in one batch. The pass above only
      // measured whole draft cards, so no prefix has been measured yet.
      let i = draft.tokenStart
      const end = draft.tokenEnd
      const parts: { s: number; e: number; px: number; fit: CardFit }[] = []
      while (i < end) {
        const cands: number[] = []
        for (let j = i + 1; j <= end; j++) cands.push(j)
        const texts = cands.map((j) => spanText(i, j))
        const ws = d.exactWidth(texts)
        // Take the longest prefix that fits. If none does, the first token
        // alone becomes a scrolling card: a single token wider than the
        // stage means no fitting candidate exists at all.
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

/** Card ranges per paragraph, recomputed once repair has finished splitting. */
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
