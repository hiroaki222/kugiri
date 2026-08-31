import type { Card } from './repair'

/** カード切替の固定コスト (visual width 相当)。
 *  完全比例だと短いカードが知覚閾値以下で点滅するので下限を作る。 */
const BASE = 4

/** cpm は「visual width / 分」。1 width あたり 60000/cpm ミリ秒。 */
export function dwellMs(card: Pick<Card, 'width' | 'isSentenceEnd' | 'isParagraphEnd'>, cpm: number): number {
  // 文末は乗算でなく加算。文末カードは短いことが多く、乗算だと
  // 欲しいのと逆に間が短くなる。
  const pause = card.isParagraphEnd ? 14 : card.isSentenceEnd ? 6 : 0
  return Math.max(180, (BASE + card.width + pause) * (60000 / cpm))
}

/** 戻ったカードを長めに出す。倍率だけでは体感できない
 *  (元が ~500ms なので 1.6倍でも +300ms にしかならない) ので、下限も効かせる。
 *  strength 0 で無効、1 で既定 (3倍 / 最低 1.8 秒)、2 で倍。 */
export function reviewDwellMs(base: number, strength = 1): number {
  if (strength <= 0) return base
  return Math.max(1800 * strength, base * (1 + 2 * strength))
}
