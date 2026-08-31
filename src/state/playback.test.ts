import { describe, expect, it } from 'vitest'
import { effectivePlaying, initial, reduce, type Deck, type Event, type Playback } from './playback'

const card = (sourceStart: number, isScroll = false) =>
  ({ kind: 'card' as const, sourceStart, isScroll })
const summary = (sourceStart: number) =>
  ({ kind: 'summary' as const, sourceStart, isScroll: false })

/** card x4, summary, card x2 */
const deck: Deck = {
  steps: [card(0), card(10), card(20), card(30), summary(30), card(40), card(50)],
}
const scrollDeck: Deck = { steps: [card(0), card(10, true), card(20)] }

const run = (events: Event[], d: Deck = deck, s: Playback = initial()) =>
  events.reduce((acc, e) => reduce(acc, e, d), s)

/** Fires TIMER for the current generation. */
const tick = (s: Playback, d: Deck = deck) => reduce(s, { type: 'TIMER', gen: s.timerGen }, d)

describe('basics', () => {
  it('the initial state shows no context', () => {
    const s = initial()
    expect(s.display.mode).toBe('card')
    expect(effectivePlaying(s)).toBe(false)
  })

  it('Space starts playback and stops it again', () => {
    const playing = run([{ type: 'PLAY' }])
    expect(effectivePlaying(playing)).toBe(true)
    const paused = reduce(playing, { type: 'PLAY' }, deck)
    expect(paused.intent).toBe('paused')
  })

  it('context appears only on a deliberate stop', () => {
    const s = run([{ type: 'PLAY' }, { type: 'PAUSE_REQUEST' }])
    expect(s.display).toEqual({ mode: 'context', by: 'paused' })
  })

  it('SUSPEND stops without showing context', () => {
    const s = run([{ type: 'PLAY' }, { type: 'SUSPEND' }])
    expect(s.intent).toBe('paused')
    expect(s.display.mode).toBe('card') // unlike PAUSE_REQUEST, no context
    expect(effectivePlaying(s)).toBe(false)
  })

  it('reaching the end and pressing Esc show no context', () => {
    for (const type of ['REACHED_END', 'ESCAPE'] as const) {
      expect(run([{ type: 'PLAY' }, { type }]).display.mode).toBe('card')
    }
  })
})

describe('discards stale timers', () => {
  it('a stale TIMER after SEEK and REBUILD does not advance twice', () => {
    let s = run([{ type: 'PLAY' }])
    const staleGen = s.timerGen
    s = tick(s) // step 1
    s = reduce(s, { type: 'SEEK', target: 3, cause: 'key-card', direction: 1 }, deck)
    s = reduce(s, { type: 'REBUILD', stepIndex: 3 }, deck)
    const before = s.stepIndex
    s = reduce(s, { type: 'TIMER', gen: staleGen }, deck) // stale generation
    expect(s.stepIndex).toBe(before) // did not advance
  })

  it('advances when the generation matches', () => {
    let s = run([{ type: 'PLAY' }])
    s = tick(s)
    expect(s.stepIndex).toBe(1)
  })
})

describe('holding K for context', () => {
  it('the timer holds while the key is down', () => {
    let s = run([{ type: 'PLAY' }, { type: 'CONTEXT_DOWN' }])
    expect(effectivePlaying(s)).toBe(false)
    expect(s.intent).toBe('playing') // intent is untouched
    s = reduce(s, { type: 'CONTEXT_UP' }, deck)
    expect(effectivePlaying(s)).toBe(true)
  })

  it('K down, blur, K up does not leave the context stuck open', () => {
    let s = run([{ type: 'PLAY' }, { type: 'CONTEXT_DOWN' }, { type: 'BLUR' }])
    expect(s.display.mode).toBe('card') // blur releases it
    s = reduce(s, { type: 'CONTEXT_UP' }, deck)
    expect(s.display.mode).toBe('card')
    expect(effectivePlaying(s)).toBe(true)
  })

  it('context from a stop survives both the key release and a blur', () => {
    const paused = run([{ type: 'PLAY' }, { type: 'PAUSE_REQUEST' }])
    expect(reduce(paused, { type: 'CONTEXT_UP' }, deck).display).toEqual({
      mode: 'context',
      by: 'paused',
    })
    expect(reduce(paused, { type: 'BLUR' }, deck).display).toEqual({
      mode: 'context',
      by: 'paused',
    })
  })

  it('no context while a summary is showing', () => {
    const s = run([{ type: 'SEEK', target: 4, cause: 'key-card', direction: 1 }])
    expect(s.display.mode).toBe('summary')
    expect(reduce(s, { type: 'CONTEXT_DOWN' }, deck).display.mode).toBe('summary')
  })
})

describe('summaries', () => {
  it('playback does not stall on a summary', () => {
    let s = run([{ type: 'SEEK', target: 3, cause: 'key-card', direction: 1 }, { type: 'PLAY' }])
    s = tick(s)
    expect(s.stepIndex).toBe(4)
    expect(s.display.mode).toBe('summary')
    expect(effectivePlaying(s)).toBe(true) // does not stall here
    s = tick(s)
    expect(s.stepIndex).toBe(5)
  })

  it('the timer holds while the summary is focused or scrolling', () => {
    let s = run([{ type: 'SEEK', target: 4, cause: 'key-card', direction: 1 }, { type: 'PLAY' }])
    s = reduce(s, { type: 'SUMMARY_FOCUS', on: true }, deck)
    expect(effectivePlaying(s)).toBe(false)
    // still focused, so it stays paused - the reason these are separate flags
    s = reduce(s, { type: 'SUMMARY_SCROLL', on: true }, deck)
    s = reduce(s, { type: 'SUMMARY_SCROLL', on: false }, deck)
    expect(effectivePlaying(s)).toBe(false)
    s = reduce(s, { type: 'SUMMARY_FOCUS', on: false }, deck)
    expect(effectivePlaying(s)).toBe(true)
  })

  it('resuming does not replay the summary', () => {
    let s = run([{ type: 'SEEK', target: 4, cause: 'key-card', direction: 1 }, { type: 'PLAY' }])
    s = reduce(s, { type: 'PAUSE_REQUEST' }, deck)
    expect(s.display.mode).toBe('summary') // stops on the summary itself
    s = reduce(s, { type: 'PLAY' }, deck)
    s = tick(s)
    expect(s.stepIndex).toBe(5) // moves on rather than replaying it
  })
})

describe('cards that must be scrolled', () => {
  it('playback stops on arrival', () => {
    let s = run([{ type: 'PLAY' }], scrollDeck)
    s = tick(s, scrollDeck)
    expect(s.stepIndex).toBe(1)
    expect(s.scrollBlocked).toBe(true)
    expect(effectivePlaying(s)).toBe(false)
    expect(s.intent).toBe('playing') // playback intent survives
  })

  it('arriving by hand does not block', () => {
    const s = run([{ type: 'SEEK', target: 1, cause: 'key-card', direction: 1 }], scrollDeck)
    expect(s.scrollBlocked).toBe(false)
  })

  it('Space on a blocked card releases and advances rather than toggling', () => {
    let s = run([{ type: 'PLAY' }], scrollDeck)
    s = tick(s, scrollDeck)
    s = reduce(s, { type: 'PLAY' }, scrollDeck)
    expect(s.scrollBlocked).toBe(false)
    expect(s.stepIndex).toBe(2)
    expect(s.intent).toBe('playing')
  })

  it('coming back to it blocks again', () => {
    let s = run([{ type: 'PLAY' }], scrollDeck)
    s = tick(s, scrollDeck)
    s = reduce(s, { type: 'SEEK', target: 0, cause: 'key-card', direction: -1 }, scrollDeck)
    expect(s.scrollBlocked).toBe(false)
    s = tick(s, scrollDeck)
    expect(s.scrollBlocked).toBe(true)
  })
})

describe('stepping backwards', () => {
  it('stepping back keeps playback running and counts as a review', () => {
    let s = run([{ type: 'PLAY' }])
    s = tick(s)
    s = tick(s)
    s = reduce(s, { type: 'SEEK', target: 1, cause: 'key-card', direction: -1 }, deck)
    expect(s.intent).toBe('playing')
    expect(s.reviewing).toBe(true)
    expect(effectivePlaying(s)).toBe(true)
  })

  it('seeking forward is not a review', () => {
    const s = run([{ type: 'PLAY' }, { type: 'SEEK', target: 3, cause: 'key-card', direction: 1 }])
    expect(s.reviewing).toBe(false)
  })

  it('seeking with the slider is not a review', () => {
    let s = run([{ type: 'PLAY' }])
    s = tick(s)
    s = tick(s)
    s = reduce(s, { type: 'SEEK', target: 0, cause: 'slider', direction: -1 }, deck)
    expect(s.reviewing).toBe(false)
  })

  it('a held key reviews on release, not on every repeat', () => {
    let s = run([{ type: 'PLAY' }])
    s = tick(s)
    s = tick(s)
    s = reduce(s, { type: 'HOLD_START' }, deck)
    s = reduce(s, { type: 'SEEK', target: 1, cause: 'hold', direction: -1 }, deck)
    expect(s.reviewing).toBe(false) // no long hold on every repeat
    s = reduce(s, { type: 'HOLD_END' }, deck)
    expect(s.reviewing).toBe(true)
  })
})

describe('the position anchor', () => {
  it('moves only when the reader does', () => {
    let s = run([{ type: 'SEEK', target: 2, cause: 'key-card', direction: 1 }])
    expect(s.sourceAnchor).toBe(20)
    const before = s.sourceAnchor
    s = reduce(s, { type: 'CONTEXT_DOWN' }, deck)
    s = reduce(s, { type: 'SUMMARY_FOCUS', on: true }, deck)
    expect(s.sourceAnchor).toBe(before) // a change of display does not move it
  })
})
