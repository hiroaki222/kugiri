import { z } from 'zod'

export const BACKGROUNDS = ['light', 'cream', 'navy', 'black'] as const
export type Background = (typeof BACKGROUNDS)[number]

/** Backgrounds dark enough that Kumo has to run in its dark mode. */
export const DARK_BACKGROUNDS: readonly Background[] = ['navy', 'black']

export const CPM_MIN = 300
export const CPM_MAX = 4000
export const clampCpm = (v: number) => Math.min(CPM_MAX, Math.max(CPM_MIN, v))

export const DEFAULTS = {
  v: 1 as const,
  sizePx: 30,
  letterSpacing: 0.02,
  spanChars: 7,
  bg: 'light' as Background,
  cpm: 1200,
  summaryOn: false,
  summaryRatio: 0.4,
  reviewStrength: 1,
  contextSentences: 20,
  dimSurround: false,
}
export type Settings = typeof DEFAULTS

/** .min()/.max() は範囲外を reject するだけでクランプはしない。
 *  1項目の破損で設定全体が飛ばないよう、項目ごとに .catch() で既定へ戻す。 */
const clamped = (lo: number, hi: number, fallback: number) =>
  z.coerce.number().finite().min(lo).max(hi).catch(fallback)

const schema = z.object({
  v: z.literal(1),
  sizePx: clamped(18, 64, DEFAULTS.sizePx),
  letterSpacing: clamped(0, 0.3, DEFAULTS.letterSpacing),
  spanChars: clamped(4, 14, DEFAULTS.spanChars),
  bg: z.enum(BACKGROUNDS).catch(DEFAULTS.bg),
  cpm: clamped(CPM_MIN, CPM_MAX, DEFAULTS.cpm),
  summaryOn: z.boolean().catch(DEFAULTS.summaryOn),
  summaryRatio: clamped(0.1, 1.2, DEFAULTS.summaryRatio),
  reviewStrength: clamped(0, 2, DEFAULTS.reviewStrength),
  contextSentences: clamped(2, 40, DEFAULTS.contextSentences),
  dimSurround: z.boolean().catch(DEFAULTS.dimSurround),
})

const KEY = 'kugiri.settings'

export function loadSettings(): Settings {
  // localStorage は例外を投げうる (プライベートウィンドウ, サイトデータのブロック)
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = schema.safeParse(JSON.parse(raw))
    // v が未知なら全体を既定に戻す
    return parsed.success ? parsed.data : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* 保存できなくても動作は続ける */
  }
}
