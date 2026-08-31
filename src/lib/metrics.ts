import { buildGraphemeIndex, visualWidth } from './width'
import type { ProposalMetrics } from './segment'

export type FontMode = 'noto' | 'fallback'

const NOTO_STACK = '"Noto Sans JP", system-ui, sans-serif'
const FALLBACK_STACK = 'system-ui, -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif'

export type MetricsOpts = {
  /** Required. The unicode-range subsets only load for characters actually
   *  asked for, so the body text has to be passed. Loading a few sample
   *  characters and measuring synchronously does not work: putting the real
   *  text into the ruler starts loading further ranges, and a synchronous
   *  measurement cannot wait for them. */
  source: string
  container: HTMLElement
  sizePx: number
  letterSpacing: number
  spanChars: number
  signal?: AbortSignal
  /** For tests. Defaults to 3000ms. */
  timeoutMs?: number
}

export type LayoutMetrics = ProposalMetrics & {
  fontMode: FontMode
  fontFamily: string
  /** Measures settled cards, in batches of 512. */
  exactWidth: (texts: string[]) => number[]
  dispose: () => void
}

/** Settles on a typeface before returning any metrics, pinning the fallback
 *  stack if Noto does not arrive. The fontMode it returns is the face the deck
 *  was measured in, and the deck must be displayed in that same face. */
export async function resolveMetrics(opts: MetricsOpts): Promise<LayoutMetrics> {
  const { source, container, sizePx, letterSpacing, spanChars } = opts
  const spec = `400 ${sizePx}px "Noto Sans JP"`
  let mode: FontMode = 'fallback'

  try {
    const load = document.fonts.load(spec, source)
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), opts.timeoutMs ?? 3000))
    const won = await Promise.race([load.then(() => 'ok' as const), timeout])
    // Both load and check take the body text. Sample characters would only
    // confirm the subsets they happen to fall in.
    if (won === 'ok' && document.fonts.check(spec, source)) mode = 'noto'
  } catch {
    mode = 'fallback'
  }
  if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError')

  // On failure the stack must not mention Noto at all. Leaving it in the CSS
  // lets the browser switch the moment it becomes available, which silently
  // invalidates every measurement already taken.
  const fontFamily = mode === 'noto' ? NOTO_STACK : FALLBACK_STACK

  // The ruler shares its typography with the real cards but drops the
  // max-width, the flex sizing, the padding and the border, so what it reports
  // is the natural width of the text.
  const ruler = document.createElement('div')
  ruler.setAttribute('aria-hidden', 'true')
  ruler.style.cssText =
    'position:absolute;visibility:hidden;top:-9999px;left:-9999px;' +
    'display:block;width:max-content;max-width:none;flex:none;padding:0;border:0;' +
    'contain:layout style;'
  container.appendChild(ruler)

  const typography =
    `font: 400 ${sizePx}px/1.5 ${fontFamily};` +
    `letter-spacing:${letterSpacing}em;font-feature-settings:"palt";` +
    'white-space:nowrap;'

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = `400 ${sizePx}px ${fontFamily}`

  // Correcting for letter-spacing needs a grapheme count per candidate, and
  // running Intl.Segmenter per candidate dominates the packing — six times
  // slower when measured. One pass over the source makes it O(1).
  const gcount = buildGraphemeIndex(source)
  const lsPx = letterSpacing * sizePx

  const approxSpan = (a: number, b: number) =>
    ctx.measureText(source.slice(a, b)).width + lsPx * Math.max(0, gcount(a, b) - 1)
  const approxText = (t: string) =>
    ctx.measureText(t).width + lsPx * Math.max(0, visualWidth(t) / 2 - 1)

  const exactWidth = (texts: string[]): number[] => {
    // Write everything, lay out once, then read everything. Interleaving the
    // two forces a layout per card.
    const spans = texts.map((t) => {
      const el = document.createElement('span')
      el.style.cssText = `${typography}display:inline-block;width:max-content;max-width:none;padding:0;border:0;`
      el.textContent = t
      ruler.appendChild(el)
      return el
    })
    const out = spans.map((el) => el.getBoundingClientRect().width)
    ruler.replaceChildren()
    return out
  }

  const ja = approxText('あ'.repeat(spanChars))
  const en = approxText('n'.repeat(Math.round((spanChars / 7) * 12)))

  // hardMaxPx is the content width inside a card. Padding and the room the
  // gaze marks need come off once here; taking them off the measurements too
  // would subtract them twice.
  const style = getComputedStyle(container)
  const pad = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
  const hardMaxPx = Math.max(0, container.clientWidth - pad - sizePx * 1.2)

  return {
    fontMode: mode,
    fontFamily,
    idealPxFor: (text: string) => {
      // "Any CJK character means Japanese" is too coarse: one proper noun in an
      // English sentence would flip it.
      const total = visualWidth(text)
      if (total === 0) return ja
      let cjk = 0
      for (const c of text) if (/[぀-ヿ㐀-鿿]/.test(c)) cjk += 2
      return cjk / total >= 0.3 ? ja : en
    },
    hardMaxPx,
    approxSpan,
    approxText,
    spanChars,
    exactWidth,
    dispose: () => ruler.remove(),
  }
}
