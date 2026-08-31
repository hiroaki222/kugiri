import type { Card } from './repair'
import { dwellMs } from './dwell'
import { visualWidth } from './width'

/** 全文カードは Card ではない。Card は「本文の一区間」を表す型なので、
 *  複数文をまとめて再掲するものを混ぜると source offset の意味が壊れる。 */
export type PlaybackStep =
  | { kind: 'card'; cardIndex: number }
  | { kind: 'summary'; text: string; sentenceIds: number[]; afterCard: number; width: number }

export type StepOptions = {
  showSummary: boolean
  /** 全文カードの長さ。その文を流す予定 dwell の合計に対する割合。 */
  summaryRatio: number
  spanChars: number
}

/** 推定表示量の上限。これを超える全文カードは出さない (出しても読めない)。
 *  高さを実測せず決定的に決めるための代用。 */
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

  // 短い文が続くとき 1文ごとに挟むと鬱陶しいので、累計がこの幅に達するまで溜める
  const groupThreshold = opts.spanChars * 2 * 3
  let ids: number[] = []
  let acc = 0

  const flush = (afterCard: number) => {
    if (!ids.length) return
    const first = sentences[ids[0]]
    const last = sentences[ids[ids.length - 1]]
    const text = source.slice(first.start, last.end).trim()
    const width = visualWidth(text)
    // 確定したグループが上限を超えていたらそのグループだけ出さない。
    // accumulator は通常どおりリセットする — スキップしてもしなくても
    // 同じ位置でリセットするので後続の境界は変わらない。
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

/** 全文カードの滞留時間。実経過時間ではなく「予定 dwell の合計 × 割合」を使う —
 *  実測にすると一時停止・戻る操作・タブのバックグラウンド化で不合理に変わる。 */
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

/** 進捗表示に使うオフセット。位置復元用の sourceAnchor とは別物 —
 *  sourceStart を使うと最終カードでも 100% にならない。 */
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
