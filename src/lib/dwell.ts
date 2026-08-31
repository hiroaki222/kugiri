import type { Card } from './repair'

/** Fixed cost of swapping a card, expressed as visual width. Time strictly
 *  proportional to length makes short cards flash below the perceptual
 *  threshold, so this sets a floor. */
const BASE = 4

/** cpm is visual width per minute, so one unit of width is 60000/cpm ms. */
export function dwellMs(card: Pick<Card, 'width' | 'isSentenceEnd' | 'isParagraphEnd'>, cpm: number): number {
  // The end-of-sentence pause is added, not multiplied. Final cards tend to be
  // short, so multiplying would shorten the very pause it is meant to lengthen.
  const pause = card.isParagraphEnd ? 14 : card.isSentenceEnd ? 6 : 0
  return Math.max(180, (BASE + card.width + pause) * (60000 / cpm))
}

/** Holds the card you stepped back to. A multiplier alone is not felt: from
 *  ~500ms, even 1.6x only adds 300ms, so a floor applies too.
 *  strength 0 disables it, 1 is the default (3x, at least 1.8s), 2 doubles it. */
export function reviewDwellMs(base: number, strength = 1): number {
  if (strength <= 0) return base
  return Math.max(1800 * strength, base * (1 + 2 * strength))
}
