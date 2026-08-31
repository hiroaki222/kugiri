import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Deck, DeckState } from '@/hooks/useDeck'
import { dwellMs, reviewDwellMs } from '@/lib/dwell'
import type { Settings } from '@/lib/settings'
import { progressOffset, summaryDwellMs } from '@/lib/steps'
import {
  effectivePlaying,
  initial,
  reduce,
  type Deck as ReducerDeck,
  type Event,
  type SeekCause,
} from '@/state/playback'

export type Playback = ReturnType<typeof usePlayback>

/** Where we are in the deck and whether we are moving: reducer state, the timer
 *  that advances it, and the seek helpers the UI and the hotkeys share. */
export function usePlayback(
  state: DeckState,
  settings: Settings,
  setAnchor: (offset: number) => void,
) {
  const [pb, setPb] = useState(initial)
  const pbRef = useRef(pb)
  pbRef.current = pb
  const [summaryProgress, setSummaryProgress] = useState<number | null>(null)
  // "Not started yet" is held per text. A rebuild from a settings change keeps
  // the same source, so the start hint never comes back mid-read.
  const [startedFor, setStartedFor] = useState<string | null>(null)

  const ready = state.status === 'ready' ? state.deck : null

  // The reducer only needs to know each step's kind, position and whether it is
  // a card that has to be scrolled, so it never sees the whole deck.
  const deck: ReducerDeck = useMemo(() => {
    if (!ready) return { steps: [] }
    return {
      steps: ready.steps.map((s) => {
        const card = s.kind === 'card' ? ready.cards[s.cardIndex] : ready.cards[s.afterCard]
        return {
          kind: s.kind,
          sourceStart: card?.sourceStart ?? 0,
          isScroll: s.kind === 'card' && card?.fit.mode === 'scroll',
        }
      }),
    }
  }, [ready])

  const dispatch = useCallback((e: Event) => setPb((s) => reduce(s, e, deck)), [deck])

  // Restore the position once a rebuild lands.
  useEffect(() => {
    if (state.status === 'ready') dispatch({ type: 'REBUILD', stepIndex: state.restoreStep })
  }, [state, dispatch])

  useEffect(() => {
    if (ready && effectivePlaying(pb)) setStartedFor(ready.source)
  }, [ready, pb])

  const step = ready?.steps[pb.stepIndex]
  const offset = ready ? progressOffset(step, ready.cards, ready.source.length) : 0

  // Hand the current position to useDeck, which only updates it when the reader
  // actually moves.
  useEffect(() => {
    if (ready) setAnchor(pb.sourceAnchor)
  }, [ready, pb.sourceAnchor, setAnchor])

  // The playback loop, re-armed whenever timerGen changes.
  useEffect(() => {
    if (!ready || !effectivePlaying(pb)) {
      setSummaryProgress(null)
      return
    }
    const s = ready.steps[pb.stepIndex]
    if (!s) return
    const base =
      s.kind === 'summary'
        ? summaryDwellMs(s, ready.cards, settings.cpm, settings.summaryRatio)
        : dwellMs(ready.cards[s.cardIndex], settings.cpm)
    const ms = pb.reviewing ? reviewDwellMs(base, settings.reviewStrength) : base
    const gen = pb.timerGen
    const timer = setTimeout(() => dispatch({ type: 'TIMER', gen }), ms)

    if (s.kind === 'summary') {
      const start = performance.now()
      let raf = 0
      const tick = () => {
        setSummaryProgress(Math.min(1, (performance.now() - start) / ms))
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => {
        clearTimeout(timer)
        cancelAnimationFrame(raf)
      }
    }
    setSummaryProgress(null)
    return () => clearTimeout(timer)
  }, [
    ready,
    pb.timerGen,
    pb.stepIndex,
    pb.reviewing,
    settings.cpm,
    settings.summaryRatio,
    settings.reviewStrength,
    dispatch,
  ])

  const seekStep = useCallback(
    (target: number, cause: SeekCause) => {
      const direction: -1 | 1 = target < pbRef.current.stepIndex ? -1 : 1
      dispatch({ type: 'SEEK', target, cause, direction })
    },
    [dispatch],
  )

  const findStepForCard = useCallback(
    (cardIndex: number) => {
      if (!ready) return 0
      const i = ready.steps.findIndex((s) => s.kind === 'card' && s.cardIndex === cardIndex)
      return i < 0 ? 0 : i
    },
    [ready],
  )

  const currentCardIndex = useCallback(() => {
    const s = ready?.steps[pbRef.current.stepIndex]
    return s ? (s.kind === 'card' ? s.cardIndex : s.afterCard) : 0
  }, [ready])

  // Opening the settings pauses playback without the reader asking to stop, so
  // no context is shown; closing puts it back the way it was.
  const wasPlayingRef = useRef(false)
  const setSuspended = useCallback(
    (on: boolean) => {
      if (on) {
        wasPlayingRef.current = effectivePlaying(pbRef.current)
        dispatch({ type: 'SUSPEND' })
      } else if (wasPlayingRef.current) {
        wasPlayingRef.current = false
        dispatch({ type: 'PLAY' })
      }
    },
    [dispatch],
  )

  return {
    pb,
    pbRef,
    ready,
    deck,
    step,
    offset,
    pct: ready && ready.source.length ? Math.round((offset / ready.source.length) * 100) : 0,
    playing: effectivePlaying(pb),
    started: !!ready && startedFor === ready.source,
    summaryProgress,
    dispatch,
    seekStep,
    findStepForCard,
    currentCardIndex,
    setSuspended,
    /** Forget that this text was ever played, so the start hint comes back. */
    forgetStart: useCallback(() => setStartedFor(null), []),
  }
}

export type { Deck }
