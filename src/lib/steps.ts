import type { Card } from './repair'
import { dwellMs } from './dwell'
import { visualWidth } from './width'

/** A summary is not a Card. Card means "one span of the body text", so mixing
 *  in something that restates several sentences would break what its source
 *  offsets mean. */
export type PlaybackStep =
  | { kind: 'card'; cardIndex: number }
  | { kind: 'summary'; text: string; sentenceIds: number[]; afterCard: number; width: number }

export type StepOptions = {
  showSummary: boolean
  /** Summary length, as a share of the planned dwell of the sentences it covers. */
  summaryRatio: number
  spanChars: number
}

/** Upper bound on how much text a summary may hold. Standing in for measuring
 *  its height, which would be another async layout pass; past this there is
 *  nothing readable to show anyway. */
const MAX_SUMMARY_WIDTH = 400

export function buildSteps(
  source: string,
  cards: Card[],
  sentences: { id: number; start: number; end: number }[],
  opts: StepOptions,
): PlaybackStep[] {
  const steps: PlaybackStep[] = []
  if (!opts.showSummary) {
    cards.forEach((_, i) => steps.push({ kind: 'card', cardIndex: i }))
    return steps
  }

  // Short sentences in a row would interrupt on every one, so they accumulate
  // until they are worth a card together.
  const groupThreshold = opts.spanChars * 2 * 3
  let ids: number[] = []
  let acc = 0

  const flush = (afterCard: number) => {
    if (!ids.length) return
    const first = sentences[ids[0]]
    const last = sentences[ids[ids.length - 1]]
    const text = source.slice(first.start, last.end).trim()
    const width = visualWidth(text)
    // An oversized group is dropped, but the accumulator resets either way:
    // skipping and not skipping reset at the same place, so the boundaries
    // that follow do not shift.
    if (width <= MAX_SUMMARY_WIDTH) {
      steps.push({ kind: 'summary', text, sentenceIds: [...ids], afterCard, width })
    }
    ids = []
    acc = 0
  }

  cards.forEach((c, i) => {
    steps.push({ kind: 'card', cardIndex: i })
    if (!c.isSentenceEnd) return
    if (!ids.includes(c.sentenceId)) {
      ids.push(c.sentenceId)
      const s = sentences[c.sentenceId]
      acc += visualWidth(source.slice(s.start, s.end).trim())
    }
    if (acc >= groupThreshold || c.isParagraphEnd) flush(i)
  })
  flush(cards.length - 1)
  return steps
}

/** How long a summary is held. Derived from planned dwell rather than elapsed
 *  time: measuring the real thing would make the summary's length swing with
 *  pauses, steps backwards and a backgrounded tab. */
export function summaryDwellMs(
  step: Extract<PlaybackStep, { kind: 'summary' }>,
  cards: Card[],
  cpm: number,
  ratio: number,
): number {
  const planned = cards
    .filter((c) => step.sentenceIds.includes(c.sentenceId))
    .reduce((sum, c) => sum + dwellMs(c, cpm), 0)
  return Math.min(12_000, Math.max(700, planned * ratio))
}

/** The offset the progress bar reports, which is not the anchor used to
 *  restore a position: sourceStart would never reach 100% on the last card. */
export function progressOffset(
  step: PlaybackStep | undefined,
  cards: Card[],
  sourceLength: number,
): number {
  if (!step) return 0
  const idx = step.kind === 'card' ? step.cardIndex : step.afterCard
  const c = cards[idx]
  if (!c) return sourceLength
  return c.sourceEnd
}
