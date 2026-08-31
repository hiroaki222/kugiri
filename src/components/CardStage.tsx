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
  /** まだ一度も再生していない状態。カードを沈めて始め方を出す。 */
  idle: boolean
  summaryProgress: number | null
  onSummaryFocus: (on: boolean) => void
  onSummaryScroll: (on: boolean) => void
  stageRef: React.RefObject<HTMLDivElement | null>
}

/** 現在の文だけでは「その前に何を読んだか」が分からず、戻る理由の多くを解決できない。
 *  論文では数段落さかのぼらないと話が繋がらないこともあるので広めに取る。
 *  スクロールする領域なので、多く出しても現在の文の見つけやすさは変わらない。 */
const CONTEXT_SENTENCES = 12
/** 前後の文は手がかりなので、長すぎるものは端を落とす。落とすのは現在の文から
 *  遠いほう (前の文は末尾、後ろの文は冒頭が効く)。現在の文だけは切らない。 */
const NEIGHBOUR_MAX = 400

type ContextBlock =
  | { id: number; current: false; text: string }
  | { id: number; current: true; before: string; mark: string; after: string }

function contextBlocks(
  source: string,
  sentences: { start: number; end: number }[],
  card: Card,
  sentenceId: number,
) {
  const lo = Math.max(0, sentenceId - CONTEXT_SENTENCES)
  const hi = Math.min(sentences.length - 1, sentenceId + CONTEXT_SENTENCES)
  const blocks: ContextBlock[] = []
  for (let i = lo; i <= hi; i++) {
    const s = sentences[i]
    if (!s) continue
    if (i === sentenceId) {
      blocks.push({
        id: i,
        current: true,
        before: source.slice(s.start, card.sourceStart),
        mark: source.slice(card.sourceStart, card.sourceEnd),
        after: source.slice(card.sourceEnd, s.end),
      })
      continue
    }
    const text = source.slice(s.start, s.end)
    blocks.push({
      id: i,
      current: false,
      text:
        text.length <= NEIGHBOUR_MAX ? text
        : i < sentenceId ? `…${text.slice(-NEIGHBOUR_MAX)}`
        : `${text.slice(0, NEIGHBOUR_MAX)}…`,
    })
  }
  return { blocks, head: lo > 0, tail: hi < sentences.length - 1 }
}

/** 前後にまだ本文が続いていることの印 */
const Ellipsis = () => (
  <span aria-hidden className="text-center" style={{ color: 'var(--kg-muted)' }}>
    …
  </span>
)

export function CardStage(props: Props) {
  const { step, cards, source, sentences, display, sizePx, letterSpacing, dim, idle } = props
  const currentRef = useRef<HTMLParagraphElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const card =
    step?.kind === 'card' ? cards[step.cardIndex]
    : step?.kind === 'summary' ? cards[step.afterCard]
    : undefined

  useEffect(() => {
    if (display.mode === 'context') currentRef.current?.scrollIntoView({ block: 'center' })
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
        style={{ background: 'var(--kg-guide)' }}
      />

      {step?.kind !== 'summary' && display.mode !== 'context' && (
        // 初版は中央揃え。左寄せアンカーは入れない — 「文字列の特定位置をマーカーに
        // 合わせる」なら総幅の検査では足りず、左右それぞれが収まることを見る必要がある
        // (anchorOffsetPx <= markerX かつ measuredPx - anchorOffsetPx <= 幅 - markerX)。
        // 実際に試すと、総幅は収まっているのに右側がステージ外に出るカードが 34 件出た。
        <div
          className="relative w-full text-center"
          style={
            // 未開始のカードは沈めて、目を「始め方」の案内に向ける。
            idle ? { filter: 'grayscale(1)', opacity: 0.32, transition: 'opacity .25s' } : undefined
          }
        >
          <span aria-hidden className="absolute left-1/2 h-4 w-px" style={{ top: -30, background: 'var(--kg-mark)' }} />
          <span aria-hidden className="absolute left-1/2 h-4 w-px" style={{ bottom: -30, background: 'var(--kg-mark)' }} />
          {card?.fit.mode === 'scroll' ? (
            // 縮小はしない (文字サイズ設定を裏切るため)。収まらないものは
            // 専用の横スクロール領域にする。キーボードからは Shift+←/→ で辿れる。
            <div
              ref={scrollRef}
              tabIndex={0}
              data-hotkeys-off
              aria-label="内容が横幅に収まっていません。Shift キーと左右の矢印キーで横にスクロールできます"
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

      {idle && display.mode === 'card' && step?.kind !== 'summary' && (
        <div
          className="pointer-events-none absolute inset-x-0 grid justify-items-center gap-1.5 px-6 text-center"
          // カードの直下に置く。文字サイズでカードの高さが変わるので、
          // 中央からの距離もそれに追随させる (視点マーカーの下端が 50% + 46px)。
          style={{ top: `calc(50% + ${Math.round(sizePx * 1.2) + 76}px)` }}
        >
          <p className="m-0 text-sm font-medium">
            {'右下の再生ボタンか '}
            <kbd className="rounded-sm border px-1.5 py-0.5 text-xs" style={{ borderColor: 'var(--kg-hair)' }}>
              Space
            </kbd>
            {' で始まります'}
          </p>
          <p className="m-0 text-xs" style={{ color: 'var(--kg-muted)' }}>
            自分のペースで送るなら ← → 、止めると前後の文が出ます
          </p>
        </div>
      )}

      {step?.kind === 'summary' && (
        <div
          className="absolute inset-0 grid place-items-center px-10 pt-10 pb-6"
          style={{ background: 'var(--kg-overlay)' }}
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
            {step.sentenceIds.length > 1 ? `直前の ${step.sentenceIds.length} 文` : 'この文の全体'}
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
          className="absolute inset-0"
          style={{ background: 'var(--kg-overlay)' }}
        >
          {/* 見出しはスクロール領域の外に置く。中に入れると本文と一緒に流れて消える。
              下を透明にした面を敷いて、流れてくる本文と重ならないようにする。 */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-10 pt-3 pb-7 text-center text-[10px] uppercase tracking-[0.14em]"
            style={{
              color: 'var(--kg-muted)',
              background: 'linear-gradient(to bottom, var(--kg-overlay) 55%, transparent)',
            }}
          >
            文脈
          </div>
          <div className="kg-context h-full overflow-y-auto px-11" tabIndex={0} data-hotkeys-off>
            {/* 上下に画面半分ぶんの余白を敷く。これが無いと、文脈が短いときに
                現在の文を中央まで持ってこられない。 */}
            <div className="mx-auto grid max-w-[42em] gap-7 py-[50cqh] text-[17px] leading-[1.95]">
              {(() => {
                const c = contextBlocks(source, sentences, card, card.sentenceId)
                return [
                  c.head ? <Ellipsis key="head" /> : null,
                  ...c.blocks.map((b) =>
                    b.current ? (
                      <p key={b.id} ref={currentRef} className="kg-jp-text m-0" dir="auto">
                        {b.before}
                        <mark
                          style={{
                            background: 'color-mix(in srgb, var(--kg-mark) 22%, transparent)',
                            color: 'var(--kg-ink)',
                            fontWeight: 600,
                          }}
                        >
                          {b.mark}
                        </mark>
                        {b.after}
                      </p>
                    ) : (
                      <p key={b.id} className="kg-jp-text m-0" dir="auto">
                        {b.text}
                      </p>
                    ),
                  ),
                  c.tail ? <Ellipsis key="tail" /> : null,
                ]
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
