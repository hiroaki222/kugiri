/**
 * The playback state machine.
 *
 * A single enum cannot express it: holding K while playing, or showing context
 * the moment playback stops, both have to remember whether playback was running
 * underneath. So the state is kept on axes that vary independently.
 */

export type Display =
  | { mode: 'card' }
  | { mode: 'context'; by: 'held' | 'paused' }
  | { mode: 'summary' }

export type Playback = {
  /** What the reader asked for. Unchanged by holding K or by stopping on a
   *  card that does not fit. */
  intent: 'playing' | 'paused'
  display: Display
  /** In the longer hold that follows a step backwards. */
  reviewing: boolean
  /** Playback reached a scrolling card and stopped there on its own. */
  scrollBlocked: boolean
  /** Reading a summary. Focus and scrolling can be true at once, so they are
   *  tracked separately. */
  summaryFocused: boolean
  summaryScrolling: boolean
  /** The current position. Kept here so double advances and summary
   *  transitions can be tested as a sequence of events. */
  stepIndex: number
  /** The anchor a rebuild restores to, updated only when the reader actually
   *  moves. Re-deriving it from the current card each time makes it drift
   *  backwards a little on every round trip. */
  sourceAnchor: number
  /** Bumped by every event that re-arms the timer, so stale callbacks are
   *  discarded rather than firing. */
  timerGen: number
  timerDeadline: number | null
  /** Rewinding under a held key. Marking each repeat as a review would make
   *  the rewind stutter. */
  holding: boolean
}

export type SeekCause = 'key-card' | 'key-sentence' | 'key-paragraph' | 'slider' | 'hold'

export type Event =
  | { type: 'PLAY' }
  | { type: 'PAUSE_REQUEST' }
  /** A stop the reader did not ask for, such as opening the settings. Unlike
   *  PAUSE_REQUEST it shows no context. */
  | { type: 'SUSPEND' }
  | { type: 'TIMER'; gen: number }
  | { type: 'SEEK'; target: number; cause: SeekCause; direction: -1 | 1 }
  | { type: 'HOLD_START' }
  | { type: 'HOLD_END' }
  | { type: 'CONTEXT_DOWN' } // K 押下
  | { type: 'CONTEXT_UP' } // K 離す
  | { type: 'BLUR' }
  | { type: 'ESCAPE' }
  | { type: 'REACHED_END' }
  | { type: 'REBUILD'; stepIndex: number }
  | { type: 'SUMMARY_FOCUS'; on: boolean }
  | { type: 'SUMMARY_SCROLL'; on: boolean }
  | { type: 'SCROLL_UNBLOCK' }

/** What the reducer needs to know about a step. It never sees the cards. */
export type StepInfo = {
  kind: 'card' | 'summary'
  /** Source offset, for progress and for restoring a position. */
  sourceStart: number
  /** A card that has to be scrolled; playback stops when it reaches one. */
  isScroll: boolean
}

export type Deck = {
  steps: StepInfo[]
}

export const initial = (stepIndex = 0, sourceAnchor = 0): Playback => ({
  intent: 'paused',
  display: { mode: 'card' },
  reviewing: false,
  scrollBlocked: false,
  summaryFocused: false,
  summaryScrolling: false,
  stepIndex,
  sourceAnchor,
  timerGen: 0,
  timerDeadline: null,
  holding: false,
})

/**
 * The reasons to hold still are listed positively. Advancing "only on a card"
 * would stall forever on a summary, because a summary is itself a step with a
 * dwell that carries on to the next one.
 */
export function effectivePlaying(s: Playback): boolean {
  const paused =
    s.display.mode === 'context' || s.scrollBlocked || s.summaryFocused || s.summaryScrolling
  return s.intent === 'playing' && !paused
}

const bump = (s: Playback): Playback => ({
  ...s,
  timerGen: s.timerGen + 1,
  timerDeadline: null,
})

const at = (deck: Deck, i: number): StepInfo | undefined => deck.steps[i]

function moveTo(s: Playback, deck: Deck, i: number, cause: SeekCause): Playback {
  const clamped = Math.min(Math.max(0, i), Math.max(0, deck.steps.length - 1))
  const step = at(deck, clamped)
  const next = bump({
    ...s,
    stepIndex: clamped,
    // The anchor only moves when the reader does.
    sourceAnchor: step ? step.sourceStart : s.sourceAnchor,
    // A summary shows no context, held or automatic: there is no single card
    // to highlight, and the whole sentence is already on screen.
    display: step?.kind === 'summary' ? { mode: 'summary' } : { mode: 'card' },
    // A scrolling card only blocks when playback arrives at it. Blocking on a
    // manual arrival would make the next Space skip the card instead of
    // starting playback.
    scrollBlocked: false,
    summaryFocused: false,
    summaryScrolling: false,
  })
  // Only a step backwards gets the longer hold. Moving forward needs no pause,
  // the slider is a position the reader went to deliberately, and a held key is
  // handled when it is released.
  const isBackKey = cause !== 'slider' && cause !== 'hold'
  return { ...next, reviewing: isBackKey && clamped < s.stepIndex }
}

export function reduce(s: Playback, e: Event, deck: Deck): Playback {
  switch (e.type) {
    case 'PLAY': {
      if (s.scrollBlocked) {
        // While blocked, Space releases and moves on rather than toggling.
        return moveTo({ ...s, scrollBlocked: false }, deck, s.stepIndex + 1, 'key-card')
      }
      if (s.intent === 'playing') return reduce(s, { type: 'PAUSE_REQUEST' }, deck)
      const atEnd = s.stepIndex >= deck.steps.length - 1
      const from = atEnd ? 0 : s.stepIndex
      return {
        ...bump(s),
        intent: 'playing',
        stepIndex: from,
        display: at(deck, from)?.kind === 'summary' ? { mode: 'summary' } : { mode: 'card' },
      }
    }

    case 'PAUSE_REQUEST': {
      // The only event that shows context on its own. Keying it off a paused
      // intent instead would show context the instant the reading view opens,
      // since it starts paused.
      const cur = at(deck, s.stepIndex)
      return {
        ...bump(s),
        intent: 'paused',
        reviewing: false,
        display:
          cur?.kind === 'summary' ? { mode: 'summary' } : { mode: 'context', by: 'paused' },
      }
    }

    case 'SUSPEND':
      return { ...bump(s), intent: 'paused', reviewing: false }

    case 'TIMER': {
      if (e.gen !== s.timerGen) return s // 古い世代は捨てる
      if (!effectivePlaying(s)) return s
      if (s.stepIndex >= deck.steps.length - 1) return reduce(s, { type: 'REACHED_END' }, deck)
      const next = s.stepIndex + 1
      const step = at(deck, next)
      // Reaching a scrolling card while playing stops there.
      if (step?.isScroll) {
        return {
          ...bump(s),
          stepIndex: next,
          sourceAnchor: step.sourceStart,
          display: { mode: 'card' },
          reviewing: false,
          scrollBlocked: true,
        }
      }
      return {
        ...bump(s),
        stepIndex: next,
        sourceAnchor: step ? step.sourceStart : s.sourceAnchor,
        display: step?.kind === 'summary' ? { mode: 'summary' } : { mode: 'card' },
        reviewing: false,
      }
    }

    case 'SEEK':
      return moveTo(s, deck, e.target, e.cause)

    case 'HOLD_START':
      return { ...bump(s), holding: true, reviewing: false }

    case 'HOLD_END':
      // Only where the held key was released counts as a review.
      return { ...bump(s), holding: false, reviewing: true }

    case 'CONTEXT_DOWN': {
      // No context while a summary is up.
      if (s.display.mode === 'summary') return s
      return { ...bump(s), display: { mode: 'context', by: 'held' } }
    }

    case 'CONTEXT_UP': {
      // Context that came from stopping outlives the key being released.
      if (s.display.mode !== 'context' || s.display.by !== 'held') return s
      return { ...bump(s), display: { mode: 'card' } }
    }

    case 'BLUR': {
      // Clearing the held-key state and changing what is displayed are separate
      // things. Losing focus with K down never delivers a keyup, so this event
      // has to exist.
      const held = s.display.mode === 'context' && s.display.by === 'held'
      return {
        ...bump(s),
        holding: false,
        summaryScrolling: false,
        display: held ? { mode: 'card' } : s.display,
      }
    }

    case 'ESCAPE':
      return { ...bump(s), intent: 'paused', display: { mode: 'card' }, reviewing: false }

    case 'REACHED_END':
      return { ...bump(s), intent: 'paused', display: { mode: 'card' }, reviewing: false }

    case 'REBUILD': {
      const step = at(deck, e.stepIndex)
      return {
        ...bump(s),
        stepIndex: e.stepIndex,
        display: step?.kind === 'summary' ? { mode: 'summary' } : { mode: 'card' },
        reviewing: false,
        scrollBlocked: false,
        summaryFocused: false,
        summaryScrolling: false,
      }
    }

    case 'SUMMARY_FOCUS':
      return { ...bump(s), summaryFocused: e.on }

    case 'SUMMARY_SCROLL':
      return { ...bump(s), summaryScrolling: e.on }

    case 'SCROLL_UNBLOCK':
      return { ...bump(s), scrollBlocked: false }
  }
}
