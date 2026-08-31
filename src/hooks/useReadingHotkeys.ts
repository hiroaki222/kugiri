import { useHotkeys } from '@/hooks/useHotkeys'
import type { Playback } from '@/hooks/usePlayback'

type Options = {
  playback: Playback
  onSpeedStep: (direction: -1 | 1) => void
  onHelp: () => void
  onSettings: () => void
}

/** Binds the reading keys to the playback API. Kept apart from the view so the
 *  navigation rules read as one list rather than as part of a render tree. */
export function useReadingHotkeys(enabled: boolean, o: Options) {
  const { pb, pbRef, ready, deck, dispatch, seekStep, findStepForCard, currentCardIndex } =
    o.playback

  useHotkeys(enabled, {
    cardStep: (d) => seekStep(pbRef.current.stepIndex + d, 'key-card'),

    sentenceStep: (d) => {
      if (!ready) return
      const index = currentCardIndex()
      const current = ready.cards[index]
      if (!current) return
      if (d === 1) {
        const next = ready.cards.findIndex((c) => c.sentenceId === current.sentenceId + 1)
        return seekStep(findStepForCard(next < 0 ? ready.cards.length - 1 : next), 'key-sentence')
      }
      // Going back lands on the head of the current sentence first, the way a
      // reader re-reads the sentence they are in before leaving it.
      const head = ready.cards.findIndex((c) => c.sentenceId === current.sentenceId)
      if (index > head) return seekStep(findStepForCard(head), 'key-sentence')
      const previous = ready.cards.findIndex((c) => c.sentenceId === current.sentenceId - 1)
      seekStep(findStepForCard(previous < 0 ? 0 : previous), 'key-sentence')
    },

    paragraphStep: (d) => {
      if (!ready) return
      const index = currentCardIndex()
      const at = ready.paragraphs.findIndex((p) => index < p.cardEnd)
      const paragraph = ready.paragraphs[at]
      if (!paragraph) return
      if (d === -1 && index > paragraph.cardStart) {
        return seekStep(findStepForCard(paragraph.cardStart), 'key-paragraph')
      }
      const target = ready.paragraphs[at + d]
      seekStep(
        findStepForCard(target ? target.cardStart : d < 0 ? 0 : ready.cards.length - 1),
        'key-paragraph',
      )
    },

    toEdge: (d) => seekStep(d < 0 ? 0 : deck.steps.length - 1, 'key-card'),
    speedStep: o.onSpeedStep,
    togglePlay: () => dispatch({ type: 'PLAY' }),
    contextDown: () => dispatch({ type: 'CONTEXT_DOWN' }),
    contextUp: () => dispatch({ type: 'CONTEXT_UP' }),
    escape: () => dispatch({ type: 'ESCAPE' }),
    holdStart: () => dispatch({ type: 'HOLD_START' }),
    holdEnd: () => dispatch({ type: 'HOLD_END' }),
    help: o.onHelp,
    settings: o.onSettings,
  })

  return pb
}
