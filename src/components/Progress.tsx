import { useCallback, useEffect, useRef } from 'react'
import type { Card } from '@/lib/repair'

type Props = {
  cards: Card[]
  paragraphs: { cardStart: number; cardEnd: number }[]
  sourceLength: number
  /** 進捗表示用のオフセット。位置復元用の anchor とは別物。 */
  offset: number
  onSeekOffset: (offset: number) => void
  /** バーにフォーカスがあるときも Space で再生を切り替えられるようにする。
   *  data-hotkeys-off でグローバルのキー処理から外しているため、ここで受ける。 */
  onTogglePlay: () => void
}

/** Kumo に該当コンポーネントが無いので canvas で自前描画する。
 *  Meter はクリックで移動できず、カード単位の区切りも描けない。 */
export function Progress({ cards, paragraphs, sourceLength, offset, onSeekOffset, onTogglePlay }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const pct = sourceLength > 0 ? Math.min(1, offset / sourceLength) : 0

  const draw = useCallback(() => {
    const cv = ref.current
    if (!cv || !cards.length) return
    const w = cv.clientWidth
    const h = cv.clientHeight
    if (!w) return
    const dpr = devicePixelRatio || 1
    // 描画: backing store を dpr 倍にして scale。以後は CSS ピクセルで描く。
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(h * dpr)
    const g = cv.getContext('2d')
    if (!g) return
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, h)

    const css = getComputedStyle(cv)
    const mark = css.getPropertyValue('--kg-mark').trim() || '#14479b'
    const hair = css.getPropertyValue('--kg-hair').trim() || '#c7cec8'
    const panel = css.getPropertyValue('--kg-panel').trim() || '#fff'
    const y = 6
    const bh = h - 12
    const unit = w / cards.length

    g.fillStyle = hair
    g.globalAlpha = 0.5
    g.fillRect(0, y, w, bh)
    g.globalAlpha = 1

    g.fillStyle = mark
    g.globalAlpha = 0.3
    g.fillRect(0, y, w * pct, bh)
    g.globalAlpha = 1

    // カード1枚ごとの区切り。DOM が増えないので 1,000枚超でも潰れない。
    if (unit > 2.4) {
      g.fillStyle = panel
      for (let k = 1; k < cards.length; k++) g.fillRect(k * unit, y, 1, bh)
    }
    // 段落の境目は背を高くして構造が読めるようにする
    g.fillStyle = mark
    g.globalAlpha = 0.75
    for (const p of paragraphs) if (p.cardStart > 0) g.fillRect(p.cardStart * unit, 1, 1, h - 2)
    g.globalAlpha = 1
  }, [cards, paragraphs, pct])

  useEffect(() => {
    draw()
    const cv = ref.current
    if (!cv) return
    const ro = new ResizeObserver(draw)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [draw])

  // hit test: PointerEvent の座標はすでに CSS ピクセルなので DPR は掛けない
  const seekAt = (clientX: number) => {
    const cv = ref.current
    if (!cv) return
    const r = cv.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    onSeekOffset(Math.round(ratio * sourceLength))
  }

  const step = (d: number) => onSeekOffset(Math.round(offset + d * sourceLength * 0.02))

  return (
    <canvas
      ref={ref}
      className="block h-5 w-full cursor-pointer rounded-sm"
      tabIndex={0}
      role="slider"
      aria-label="読書の進み具合"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
      aria-valuetext={`本文の${Math.round(pct * 100)}%`}
      data-hotkeys-off
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        seekAt(e.clientX)
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) seekAt(e.clientX)
      }}
      onKeyDown={(e) => {
        const map: Record<string, () => void> = {
          ' ': onTogglePlay,
          ArrowLeft: () => step(-1),
          ArrowRight: () => step(1),
          PageDown: () => step(5),
          PageUp: () => step(-5),
          Home: () => onSeekOffset(0),
          End: () => onSeekOffset(sourceLength),
        }
        const fn = map[e.key]
        if (fn) {
          e.preventDefault()
          fn()
        }
      }}
    />
  )
}
