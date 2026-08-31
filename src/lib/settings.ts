import { z } from 'zod'

export const BACKGROUNDS = ['hai', 'kinari', 'navy', 'sumi'] as const
export type Background = (typeof BACKGROUNDS)[number]

export const DEFAULTS = {
  v: 1 as const,
  sizePx: 30,
  letterSpacing: 0.02,
  spanChars: 7,
  bg: 'hai' as Background,
  cpm: 1200,
  summaryOn: true,
  summaryRatio: 0.4,
  fixPdfWrap: false,
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
  cpm: clamped(300, 4000, DEFAULTS.cpm),
  summaryOn: z.boolean().catch(DEFAULTS.summaryOn),
  summaryRatio: clamped(0.1, 1.2, DEFAULTS.summaryRatio),
  fixPdfWrap: z.boolean().catch(DEFAULTS.fixPdfWrap),
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
