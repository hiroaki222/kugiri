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

/** A deck is always drawn in the typeface it was measured in: the font class
 *  and the deck are committed in the same update, so the face cannot change
 *  underneath a deck that has already been laid out.
 *
 *  unwrap arrives as an argument rather than through Settings because it is
 *  not persisted; it describes the text that was just pasted. */
export function useDeck(
  raw: string,
  settings: Settings,
  container: HTMLElement | null,
  unwrap: boolean,
) {
  const [state, setState] = useState<DeckState>({ status: 'idle' })
  const genRef = useRef(0)
  const anchorRef = useRef(0)

  const setAnchor = useCallback((offset: number) => {
    anchorRef.current = offset
  }, [])

  const build = useCallback(
    async (resetAnchor: boolean) => {
      if (!container) return
      // Leaving the reading view throws the deck away. Returning early instead
      // would leave the previous deck ready, and its cards would appear when a
      // different text is opened next.
      if (!raw.trim()) {
        genRef.current++
        anchorRef.current = 0
        setState({ status: 'idle' })
        return
      }
      const gen = ++genRef.current
      if (resetAnchor) anchorRef.current = 0
      const anchor = anchorRef.current
      setState({ status: 'building' })

      try {
        const source = prepareSource(raw, { unwrap })
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

        // Restore the position: the card whose span contains the anchor, the
        // next card if the anchor fell in a gap, the last card if it is past
        // the end.
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
    [raw, container, unwrap, settings.sizePx, settings.letterSpacing,
     settings.spanChars, settings.summaryOn, settings.summaryRatio],
  )

  // Only a genuinely different source goes back to the start. Unwrapping adds
  // and removes characters, so an old offset points somewhere else entirely in
  // the new text, and replacing the body text has the same problem. Re-entering
  // the reading view with the same text keeps the position.
  const unwrapRef = useRef(unwrap)
  const builtRawRef = useRef('')
  useEffect(() => {
    const changed =
      unwrapRef.current !== unwrap ||
      (raw.trim() !== '' && builtRawRef.current !== raw)
    unwrapRef.current = unwrap
    if (raw.trim() !== '') builtRawRef.current = raw
    void build(changed)
  }, [build, raw, unwrap])

  return { state, setAnchor, rebuild: build }
}
