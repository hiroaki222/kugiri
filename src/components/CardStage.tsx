import { useEffect, useRef } from 'react'
import type { Card } from '@/lib/repair'
import type { PlaybackStep } from '@/lib/steps'
import type { Display } from '@/state/playback'

type Props = {
  step: PlaybackStep | undefined
  cards: Card[]
  source: string
  sentences: { id: number; start: number; end: number }[]
  display: Display
  sizePx: number
  letterSpacing: number
  dim: boolean
  summaryProgress: number | null
  onSummaryFocus: (on: boolean) => void
  onSummaryScroll: (on: boolean) => void
  stageRef: React.RefObject<HTMLDivElement | null>
}

/** 文脈は現在カードを中心に前後を抜粋する。先頭からの抜粋だと文の後半にいるとき
 *  現在カードが含まれず、読み返しという目的を失う。 */
function contextParts(source: string, sentence: { start: number; end: number }, card: Card) {
  const MAX = 600
  let s = sentence.start
  let e = sentence.end
  if (e - s > MAX) {
    const half = Math.floor((MAX - (card.sourceEnd - card.sourceStart)) / 2)
    s = Math.max(sentence.start, card.sourceStart - half)
    e = Math.min(sentence.end, card.sourceEnd + half)
  }
  return {
    head: s > sentence.start,
    before: source.slice(s, card.sourceStart),
    mark: source.slice(card.sourceStart, card.sourceEnd),
    after: source.slice(card.sourceEnd, e),
    tail: e < sentence.end,
  }
}

export function CardStage(props: Props) {
  const { step, cards, source, sentences, display, sizePx, letterSpacing, dim } = props
  const markRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const card =
    step?.kind === 'card' ? cards[step.cardIndex]
    : step?.kind === 'summary' ? cards[step.afterCard]
    : undefined

  useEffect(() => {
    if (display.mode === 'context') markRef.current?.scrollIntoView({ block: 'center' })
  }, [display.mode, step])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0
  }, [step])

  const typeStyle = { fontSize: sizePx, letterSpacing: `${letterSpacing}em` }

  return (
    <div
      ref={props.stageRef}
      className="kg-type relative flex flex-1 items-center overflow-hidden"
      style={{
        background: dim ? 'color-mix(in srgb, var(--kg-paper) 86%, #000)' : 'var(--kg-paper)',
        transition: 'background-color .25s',
      }}
    >
      {/* 視点の高さを示す一本の線。カードがそれを断ち切る。 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-px"
        style={{ background: 'var(--kg-hair)' }}
      />

      {step?.kind !== 'summary' && display.mode !== 'context' && (
        // 初版は中央揃え。左寄せアンカーは入れない — 「文字列の特定位置をマーカーに
        // 合わせる」なら総幅の検査では足りず、左右それぞれが収まることを見る必要がある
        // (anchorOffsetPx <= markerX かつ measuredPx - anchorOffsetPx <= 幅 - markerX)。
        // 実際に試すと、総幅は収まっているのに右側がステージ外に出るカードが 34 件出た。
        <div className="relative w-full text-center">
          <span aria-hidden className="absolute left-1/2 h-4 w-px" style={{ top: -30, background: 'var(--kg-mark)' }} />
          <span aria-hidden className="absolute left-1/2 h-4 w-px" style={{ bottom: -30, background: 'var(--kg-mark)' }} />
          {card?.fit.mode === 'scroll' ? (
            // 縮小はしない (文字サイズ設定を裏切るため)。収まらないものは
            // 専用の横スクロール領域にする。キーボードからは Shift+←/→ で辿れる。
            <div
              ref={scrollRef}
              tabIndex={0}
              data-hotkeys-off
              aria-label="長いカード。Shift と左右キーでスクロールできます"
              className="mx-3 overflow-x-auto"
              style={{ overscrollBehaviorX: 'contain' }}
              onKeyDown={(e) => {
                if (!e.shiftKey) return
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault()
                  e.currentTarget.scrollLeft += (e.key === 'ArrowRight' ? 1 : -1) * 120
                }
              }}
            >
              <span className="kg-card" style={typeStyle} dir="auto">
                {card.text}
              </span>
            </div>
          ) : (
            <span className="kg-card" style={typeStyle} dir="auto">
              {card?.text ?? ''}
            </span>
          )}
        </div>
      )}

      {step?.kind === 'summary' && (
        <div
          className="absolute inset-0 grid place-items-center px-10 pt-10 pb-6"
          style={{ background: 'color-mix(in srgb, var(--kg-paper) 96%, #000)' }}
          tabIndex={0}
          onFocus={() => props.onSummaryFocus(true)}
          onBlur={() => props.onSummaryFocus(false)}
          onScroll={() => props.onSummaryScroll(true)}
          data-hotkeys-off
        >
          <div
            className="absolute inset-x-0 top-0 h-[3px]"
            style={{ background: 'color-mix(in srgb, var(--kg-mark) 16%, transparent)' }}
          >
            <div
              className="h-full"
              style={{ width: `${(props.summaryProgress ?? 0) * 100}%`, background: 'var(--kg-mark)' }}
            />
          </div>
          <div
            className="absolute inset-x-0 top-3 text-center text-[10px] uppercase tracking-[0.14em]"
            style={{ color: 'var(--kg-muted)' }}
          >
            {step.sentenceIds.length > 1 ? `ここまでの ${step.sentenceIds.length} 文` : 'この文の全文'}
          </div>
          <p
            className="max-h-full max-w-[42em] overflow-y-auto text-[17px] leading-[2.05]"
            style={{ overflowWrap: 'anywhere' }}
            dir="auto"
          >
            {step.text}
          </p>
        </div>
      )}

      {display.mode === 'context' && card && (
        <div
          className="absolute inset-0 grid place-items-center px-11 py-10"
          style={{ background: 'color-mix(in srgb, var(--kg-paper) 96%, #000)' }}
          tabIndex={0}
          data-hotkeys-off
        >
          <div
            className="absolute inset-x-0 top-3 text-center text-[10px] uppercase tracking-[0.14em]"
            style={{ color: 'var(--kg-muted)' }}
          >
            文脈
          </div>
          <p
            className="max-h-full max-w-[42em] overflow-y-auto text-[17px] leading-[2.05]"
            style={{ overflowWrap: 'anywhere', color: 'var(--kg-muted)' }}
            dir="auto"
          >
            {(() => {
              const s = sentences[card.sentenceId]
              if (!s) return card.text
              const p = contextParts(source, s, card)
              return (
                <>
                  {p.head && '… '}
                  {p.before}
                  <mark
                    ref={markRef}
                    style={{
                      background: 'color-mix(in srgb, var(--kg-mark) 20%, transparent)',
                      color: 'var(--kg-ink)',
                      fontWeight: 500,
                    }}
                  >
                    {p.mark}
                  </mark>
                  {p.after}
                  {p.tail && ' …'}
                </>
              )
            })()}
          </p>
        </div>
      )}
    </div>
  )
}
