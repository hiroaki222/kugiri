import { useCallback, useEffect, useRef, useState } from 'react'
import { prepareSource, proposeCards } from '@/lib/segment'
import { resolveMetrics, type FontMode } from '@/lib/metrics'
import { paragraphRanges, repair, type Card } from '@/lib/repair'
import { buildSteps, type PlaybackStep } from '@/lib/steps'
import type { Settings } from '@/lib/settings'

export type Deck = {
  source: string
  cards: Card[]
  steps: PlaybackStep[]
  sentences: { id: number; start: number; end: number }[]
  paragraphs: { id: number; cardStart: number; cardEnd: number }[]
  fontMode: FontMode
}

export type DeckState =
  | { status: 'idle' }
  | { status: 'building' }
  | { status: 'ready'; deck: Deck; restoreStep: number }
  | { status: 'error'; message: string }

/** 表示中の deck は常に「その deck を測ったときの書体」で描かれる。
 *  書体クラスの切り替えと新しい deck の commit を同一の更新で行うので、
 *  途中で書体が変わることが原理的に起きない。 */
export function useDeck(raw: string, settings: Settings, container: HTMLElement | null) {
  const [state, setState] = useState<DeckState>({ status: 'idle' })
  const genRef = useRef(0)
  const anchorRef = useRef(0)

  const setAnchor = useCallback((offset: number) => {
    anchorRef.current = offset
  }, [])

  const build = useCallback(
    async (resetAnchor: boolean) => {
      if (!raw.trim() || !container) return
      const gen = ++genRef.current
      if (resetAnchor) anchorRef.current = 0
      const anchor = anchorRef.current
      setState({ status: 'building' })

      try {
        const source = prepareSource(raw, { fixPdfWrap: settings.fixPdfWrap })
        if (!source.trim()) {
          setState({ status: 'idle' })
          return
        }
        const metrics = await resolveMetrics({
          source,
          container,
          sizePx: settings.sizePx,
          letterSpacing: settings.letterSpacing,
          spanChars: settings.spanChars,
        })
        if (gen !== genRef.current) return metrics.dispose()

        const proposal = proposeCards(source, metrics)
        const cards = await repair(proposal, {
          hardMaxPx: metrics.hardMaxPx,
          exactWidth: metrics.exactWidth,
          isCurrent: () => gen === genRef.current,
        })
        metrics.dispose()
        if (!cards || gen !== genRef.current) return

        const sentences = proposal.sentences.map((s) => ({ id: s.id, start: s.start, end: s.end }))
        const steps = buildSteps(source, cards, sentences, {
          showSummary: settings.summaryOn,
          summaryRatio: settings.summaryRatio,
          spanChars: settings.spanChars,
        })

        // 位置の復元。card.sourceStart <= anchor < card.sourceEnd のカードへ。
        // gap に落ちたら次のカード、文書末を超えたら最終カード。
        let cardIndex = cards.findIndex((c) => anchor >= c.sourceStart && anchor < c.sourceEnd)
        if (cardIndex < 0) cardIndex = cards.findIndex((c) => c.sourceStart >= anchor)
        if (cardIndex < 0) cardIndex = cards.length - 1
        const restoreStep = Math.max(
          0,
          steps.findIndex((s) => s.kind === 'card' && s.cardIndex === cardIndex),
        )

        setState({
          status: 'ready',
          deck: {
            source,
            cards,
            steps,
            sentences,
            paragraphs: paragraphRanges(cards, proposal.paragraphs.length),
            fontMode: metrics.fontMode,
          },
          restoreStep,
        })
      } catch (err) {
        if (gen !== genRef.current) return
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : '分割に失敗しました。',
        })
      }
    },
    [raw, container, settings.fixPdfWrap, settings.sizePx, settings.letterSpacing,
     settings.spanChars, settings.summaryOn, settings.summaryRatio],
  )

  // PDF 補正は source そのものを変えるので、旧 offset を新 source に当てても
  // 同じ内容を指さない。切り替えたときは先頭に戻す。
  const pdfRef = useRef(settings.fixPdfWrap)
  useEffect(() => {
    const changed = pdfRef.current !== settings.fixPdfWrap
    pdfRef.current = settings.fixPdfWrap
    void build(changed)
  }, [build, settings.fixPdfWrap])

  return { state, setAnchor, rebuild: build }
}
