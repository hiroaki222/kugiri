import { buildGraphemeIndex, visualWidth } from './width'
import type { ProposalMetrics } from './segment'

export type FontMode = 'noto' | 'fallback'

const NOTO_STACK = '"Noto Sans JP", system-ui, sans-serif'
const FALLBACK_STACK = 'system-ui, -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif'

export type MetricsOpts = {
  /** ★必須。unicode-range のサブセットは本文を渡さないとロードされない。
   *  代表文字だけロードして測定は同期、は成立しない — 測定用 span に本文を入れた
   *  瞬間に別レンジが非同期ロードされ始め、同期の測定はそれを待てない。 */
  source: string
  container: HTMLElement
  sizePx: number
  letterSpacing: number
  spanChars: number
  signal?: AbortSignal
  /** テスト用。既定は 3000ms */
  timeoutMs?: number
}

export type LayoutMetrics = ProposalMetrics & {
  fontMode: FontMode
  fontFamily: string
  /** 確定したカードだけを測る。512件バッチ。 */
  exactWidth: (texts: string[]) => number[]
  dispose: () => void
}

/** 書体を確定してから metrics を返す。Noto が来なければ fallback stack に固定する。
 *  返る fontMode が「その deck を測った書体」を表す。 */
export async function resolveMetrics(opts: MetricsOpts): Promise<LayoutMetrics> {
  const { source, container, sizePx, letterSpacing, spanChars } = opts
  const spec = `400 ${sizePx}px "Noto Sans JP"`
  let mode: FontMode = 'fallback'

  try {
    const load = document.fonts.load(spec, source)
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), opts.timeoutMs ?? 3000))
    const won = await Promise.race([load.then(() => 'ok' as const), timeout])
    // load と check の両方に本文を渡す。代表文字だけでは本文に必要な
    // サブセットの確認にならない。
    if (won === 'ok' && document.fonts.check(spec, source)) mode = 'noto'
  } catch {
    mode = 'fallback'
  }
  if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError')

  // 失敗したら Noto を含まない stack を当てる。CSS に残したままだと遅れて
  // 利用可能になった時点でブラウザが自動で切り替えて測定結果が古くなる。
  const fontFamily = mode === 'noto' ? NOTO_STACK : FALLBACK_STACK

  // 測定要素は実カードとタイポグラフィを揃えつつ、自然幅が測れるよう
  // max-width / flex の制約と padding / border を明示的に外す。
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

  // letter-spacing の補正には候補ごとの書記素数が要る。候補のたびに
  // Intl.Segmenter を回すと DP の支配的コストになる (実測で6倍)。
  // source を1回走査して O(1) で引く。
  const gcount = buildGraphemeIndex(source)
  const lsPx = letterSpacing * sizePx

  const approxSpan = (a: number, b: number) =>
    ctx.measureText(source.slice(a, b)).width + lsPx * Math.max(0, gcount(a, b) - 1)
  const approxText = (t: string) =>
    ctx.measureText(t).width + lsPx * Math.max(0, visualWidth(t) / 2 - 1)

  const exactWidth = (texts: string[]): number[] => {
    // 書き込み → 1回レイアウト → 一括読み取り。交互にやるとカードごとに
    // 強制レイアウトが走る。
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

  // hardMaxPx はカード内側の content width。padding とマーカー余白は
  // コンテナ寸法を出すときに一度だけ引く (測定値にも入れると二重控除)。
  const style = getComputedStyle(container)
  const pad = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
  const hardMaxPx = Math.max(0, container.clientWidth - pad - sizePx * 1.2)

  return {
    fontMode: mode,
    fontFamily,
    idealPxFor: (text: string) => {
      // 「1文字でも CJK なら日本語」は粗すぎる (英文に固有名詞が1つ入っただけで切り替わる)
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
