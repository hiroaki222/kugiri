import { useEffect, useRef } from 'react'
import { t } from '@/i18n'
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
  /** Nothing has been played yet: the card sinks back and the screen says how
   *  to start. */
  idle: boolean
  /** How many sentences of context to show either side. A paper often needs
   *  several paragraphs back before the argument reconnects. */
  contextSentences: number
  summaryProgress: number | null
  onSummaryFocus: (on: boolean) => void
  onSummaryScroll: (on: boolean) => void
  stageRef: React.RefObject<HTMLDivElement | null>
}

/** Neighbouring sentences are a cue, so an overlong one is trimmed from the end
 *  further from where you are: the tail of what came before leads in, the head
 *  of what follows leads out. The current sentence is never trimmed. */
const NEIGHBOUR_MAX = 400

type ContextBlock =
  | { id: number; current: false; text: string }
  | { id: number; current: true; before: string; mark: string; after: string }

function contextBlocks(
  source: string,
  sentences: { start: number; end: number }[],
  card: Card,
  sentenceId: number,
  span: number,
) {
  const lo = Math.max(0, sentenceId - span)
  const hi = Math.min(sentences.length - 1, sentenceId + span)
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

/** Marks that the text carries on beyond what is shown. */
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
        background: dim ? 'var(--kg-dim)' : 'var(--kg-paper)',
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
        // Centred. Aligning a fixed position within the text to a fixed
        // position on screen would need both sides checked separately rather
        // than the total width, and trying it produced 34 cards whose total
        // width fitted while their right-hand side ran off the stage.
        <div
          className="relative w-full text-center"
          style={
            // An unstarted card sinks back so the eye goes to the instructions.
            // Desaturating is not part of it: on a dark background that turns
            // the card's surface into a grey rectangle floating on the ground,
            // which draws more attention rather than less.
            idle ? { opacity: 'var(--kg-idle-opacity)', transition: 'opacity .25s' } : undefined
          }
        >
          <span aria-hidden className="absolute left-1/2 h-4 w-px" style={{ top: -30, background: 'var(--kg-mark)' }} />
          <span aria-hidden className="absolute left-1/2 h-4 w-px" style={{ bottom: -30, background: 'var(--kg-mark)' }} />
          {card?.fit.mode === 'scroll' ? (
            // Never scaled down, which would ignore the size that was chosen.
            // What does not fit gets its own scrolling region, reachable from
            // the keyboard with Shift and an arrow.
            <div
              ref={scrollRef}
              tabIndex={0}
              data-hotkeys-off
              aria-label={t.reading.overflowCard}
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
          // Sits just under the card. The card's height follows the text size,
          // so the offset from the centre follows it too; the lower gaze mark
          // ends at 50% + 46px.
          style={{ top: `calc(50% + ${Math.round(sizePx * 1.2) + 76}px)` }}
        >
          <p className="m-0 text-sm font-medium">
            {t.reading.startHintBefore}
            <kbd className="rounded-sm border px-1.5 py-0.5 text-xs" style={{ borderColor: 'var(--kg-hair)' }}>
              {t.reading.startHintKey}
            </kbd>
            {t.reading.startHintAfter}
          </p>
          <p className="m-0 text-xs" style={{ color: 'var(--kg-muted)' }}>
            {t.reading.startHintSub}
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
            {step.sentenceIds.length > 1 ?
              t.reading.summaryMany(step.sentenceIds.length)
            : t.reading.summaryOne}
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
            {t.reading.context}
          </div>
          <div className="kg-context h-full overflow-y-auto px-11" tabIndex={0} data-hotkeys-off>
            {/* 上下に画面半分ぶんの余白を敷く。これが無いと、文脈が短いときに
                現在の文を中央まで持ってこられない。 */}
            <div className="mx-auto grid max-w-[42em] gap-7 py-[50cqh] text-[17px] leading-[1.95]">
              {(() => {
                const c = contextBlocks(source, sentences, card, card.sentenceId, props.contextSentences)
                return [
                  c.head ? <Ellipsis key="head" /> : null,
                  ...c.blocks.map((b) =>
                    b.current ? (
                      <p key={b.id} ref={currentRef} className="kg-jp-text m-0" dir="auto">
                        {b.before}
                        <mark
                          style={{
                            background: 'var(--kg-mark-fill)',
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
