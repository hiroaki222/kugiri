import { useCallback, useEffect, useRef } from 'react'
import { t } from '@/i18n'
import type { Card } from '@/lib/repair'

type Props = {
  cards: Card[]
  paragraphs: { cardStart: number; cardEnd: number }[]
  sourceLength: number
  /** The offset to display, which is not the anchor used to restore position. */
  offset: number
  onSeekOffset: (offset: number) => void
}

/** Drawn on a canvas because Kumo has nothing that fits: Meter cannot be
 *  clicked to seek and cannot show a tick per card. */
export function Progress({ cards, paragraphs, sourceLength, offset, onSeekOffset }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const pct = sourceLength > 0 ? Math.min(1, offset / sourceLength) : 0

  const draw = useCallback(() => {
    const cv = ref.current
    if (!cv || !cards.length) return
    const w = cv.clientWidth
    const h = cv.clientHeight
    if (!w) return
    const dpr = devicePixelRatio || 1
    // Scale the backing store by the device ratio once; everything below is
    // then drawn in CSS pixels.
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

    // A tick per card. Nothing is added to the DOM, so a thousand cards still
    // draw without collapsing.
    if (unit > 2.4) {
      g.fillStyle = panel
      for (let k = 1; k < cards.length; k++) g.fillRect(k * unit, y, 1, bh)
    }
    // Paragraph boundaries run taller, so the shape of the text is readable.
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

  // Hit testing: pointer coordinates are already CSS pixels, so no ratio here.
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
      aria-label={t.reading.progress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
      aria-valuetext={t.reading.progressValue(Math.round(pct * 100))}
      data-hotkeys-off
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        seekAt(e.clientX)
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) seekAt(e.clientX)
      }}
      onKeyDown={(e) => {
        // Space is deliberately absent. The window hotkey fires on the same
        // native event, and two toggles in one press cancel out.
        const map: Record<string, () => void> = {
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
