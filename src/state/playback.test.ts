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

/** 現在の世代で TIMER を撃つ */
const tick = (s: Playback, d: Deck = deck) => reduce(s, { type: 'TIMER', gen: s.timerGen }, d)

describe('基本', () => {
  it('初期状態では文脈を出さない', () => {
    const s = initial()
    expect(s.display.mode).toBe('card')
    expect(effectivePlaying(s)).toBe(false)
  })

  it('Space で再生開始、もう一度で停止', () => {
    const playing = run([{ type: 'PLAY' }])
    expect(effectivePlaying(playing)).toBe(true)
    const paused = reduce(playing, { type: 'PLAY' }, deck)
    expect(paused.intent).toBe('paused')
  })

  it('停止したときだけ文脈が出る', () => {
    const s = run([{ type: 'PLAY' }, { type: 'PAUSE_REQUEST' }])
    expect(s.display).toEqual({ mode: 'context', by: 'paused' })
  })

  it('SUSPEND は文脈を出さずに止める (設定を開いたとき)', () => {
    const s = run([{ type: 'PLAY' }, { type: 'SUSPEND' }])
    expect(s.intent).toBe('paused')
    expect(s.display.mode).toBe('card') // PAUSE_REQUEST と違って文脈を出さない
    expect(effectivePlaying(s)).toBe(false)
  })

  it('末尾到達と Esc では文脈を出さない', () => {
    for (const type of ['REACHED_END', 'ESCAPE'] as const) {
      expect(run([{ type: 'PLAY' }, { type }]).display.mode).toBe('card')
    }
  })
})

describe('古いタイマーを捨てる', () => {
  it('TIMER → SEEK → REBUILD → 古い TIMER が発火しても二重送りしない', () => {
    let s = run([{ type: 'PLAY' }])
    const staleGen = s.timerGen
    s = tick(s) // step 1
    s = reduce(s, { type: 'SEEK', target: 3, cause: 'key-card', direction: 1 }, deck)
    s = reduce(s, { type: 'REBUILD', stepIndex: 3 }, deck)
    const before = s.stepIndex
    s = reduce(s, { type: 'TIMER', gen: staleGen }, deck) // 古い世代
    expect(s.stepIndex).toBe(before) // 進まない
  })

  it('世代が合えば進む', () => {
    let s = run([{ type: 'PLAY' }])
    s = tick(s)
    expect(s.stepIndex).toBe(1)
  })
})

describe('K (文脈) の押下', () => {
  it('押している間はタイマーが止まる', () => {
    let s = run([{ type: 'PLAY' }, { type: 'CONTEXT_DOWN' }])
    expect(effectivePlaying(s)).toBe(false)
    expect(s.intent).toBe('playing') // 再生意図は変わらない
    s = reduce(s, { type: 'CONTEXT_UP' }, deck)
    expect(effectivePlaying(s)).toBe(true)
  })

  it('K down → blur → K up で文脈に貼り付かない', () => {
    let s = run([{ type: 'PLAY' }, { type: 'CONTEXT_DOWN' }, { type: 'BLUR' }])
    expect(s.display.mode).toBe('card') // blur で解除される
    s = reduce(s, { type: 'CONTEXT_UP' }, deck)
    expect(s.display.mode).toBe('card')
    expect(effectivePlaying(s)).toBe(true)
  })

  it('停止して出ている文脈は K を離しても blur でも消えない', () => {
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

  it('全文カードの表示中は文脈に遷移しない', () => {
    const s = run([{ type: 'SEEK', target: 4, cause: 'key-card', direction: 1 }])
    expect(s.display.mode).toBe('summary')
    expect(reduce(s, { type: 'CONTEXT_DOWN' }, deck).display.mode).toBe('summary')
  })
})

describe('全文カード', () => {
  it('自動再生は全文カードで止まらない', () => {
    let s = run([{ type: 'SEEK', target: 3, cause: 'key-card', direction: 1 }, { type: 'PLAY' }])
    s = tick(s)
    expect(s.stepIndex).toBe(4)
    expect(s.display.mode).toBe('summary')
    expect(effectivePlaying(s)).toBe(true) // ← 永久停止しない
    s = tick(s)
    expect(s.stepIndex).toBe(5)
  })

  it('読んでいる最中 (focus / scroll) はタイマーが止まる', () => {
    let s = run([{ type: 'SEEK', target: 4, cause: 'key-card', direction: 1 }, { type: 'PLAY' }])
    s = reduce(s, { type: 'SUMMARY_FOCUS', on: true }, deck)
    expect(effectivePlaying(s)).toBe(false)
    // フォーカスしたままスクロールを止めても再開しない (直交状態にした理由)
    s = reduce(s, { type: 'SUMMARY_SCROLL', on: true }, deck)
    s = reduce(s, { type: 'SUMMARY_SCROLL', on: false }, deck)
    expect(effectivePlaying(s)).toBe(false)
    s = reduce(s, { type: 'SUMMARY_FOCUS', on: false }, deck)
    expect(effectivePlaying(s)).toBe(true)
  })

  it('停止して再開したときに再掲しない', () => {
    let s = run([{ type: 'SEEK', target: 4, cause: 'key-card', direction: 1 }, { type: 'PLAY' }])
    s = reduce(s, { type: 'PAUSE_REQUEST' }, deck)
    expect(s.display.mode).toBe('summary') // summary のまま止まる
    s = reduce(s, { type: 'PLAY' }, deck)
    s = tick(s)
    expect(s.stepIndex).toBe(5) // 同じ summary をもう一度出さずに次へ
  })
})

describe('scroll カード', () => {
  it('再生中に到達したら止まる', () => {
    let s = run([{ type: 'PLAY' }], scrollDeck)
    s = tick(s, scrollDeck)
    expect(s.stepIndex).toBe(1)
    expect(s.scrollBlocked).toBe(true)
    expect(effectivePlaying(s)).toBe(false)
    expect(s.intent).toBe('playing') // 再生意図は保たれる
  })

  it('手動で来たときは止まらない', () => {
    const s = run([{ type: 'SEEK', target: 1, cause: 'key-card', direction: 1 }], scrollDeck)
    expect(s.scrollBlocked).toBe(false)
  })

  it('blocked 中の Space は解除して次へ進む (トグルではない)', () => {
    let s = run([{ type: 'PLAY' }], scrollDeck)
    s = tick(s, scrollDeck)
    s = reduce(s, { type: 'PLAY' }, scrollDeck)
    expect(s.scrollBlocked).toBe(false)
    expect(s.stepIndex).toBe(2)
    expect(s.intent).toBe('playing')
  })

  it('戻ってまた来たら再び止まる', () => {
    let s = run([{ type: 'PLAY' }], scrollDeck)
    s = tick(s, scrollDeck)
    s = reduce(s, { type: 'SEEK', target: 0, cause: 'key-card', direction: -1 }, scrollDeck)
    expect(s.scrollBlocked).toBe(false)
    s = tick(s, scrollDeck)
    expect(s.scrollBlocked).toBe(true)
  })
})

describe('戻る操作', () => {
  it('戻っても再生意図が保たれ、reviewing が付く', () => {
    let s = run([{ type: 'PLAY' }])
    s = tick(s)
    s = tick(s)
    s = reduce(s, { type: 'SEEK', target: 1, cause: 'key-card', direction: -1 }, deck)
    expect(s.intent).toBe('playing')
    expect(s.reviewing).toBe(true)
    expect(effectivePlaying(s)).toBe(true)
  })

  it('前進の seek には reviewing を付けない', () => {
    const s = run([{ type: 'PLAY' }, { type: 'SEEK', target: 3, cause: 'key-card', direction: 1 }])
    expect(s.reviewing).toBe(false)
  })

  it('slider の seek には reviewing を付けない', () => {
    let s = run([{ type: 'PLAY' }])
    s = tick(s)
    s = tick(s)
    s = reduce(s, { type: 'SEEK', target: 0, cause: 'slider', direction: -1 }, deck)
    expect(s.reviewing).toBe(false)
  })

  it('長押し中は reviewing を付けず、離した時点で付ける', () => {
    let s = run([{ type: 'PLAY' }])
    s = tick(s)
    s = tick(s)
    s = reduce(s, { type: 'HOLD_START' }, deck)
    s = reduce(s, { type: 'SEEK', target: 1, cause: 'hold', direction: -1 }, deck)
    expect(s.reviewing).toBe(false) // repeat のたびに3倍タイマーを張らない
    s = reduce(s, { type: 'HOLD_END' }, deck)
    expect(s.reviewing).toBe(true)
  })
})

describe('位置のアンカー', () => {
  it('移動したときだけ更新される', () => {
    let s = run([{ type: 'SEEK', target: 2, cause: 'key-card', direction: 1 }])
    expect(s.sourceAnchor).toBe(20)
    const before = s.sourceAnchor
    s = reduce(s, { type: 'CONTEXT_DOWN' }, deck)
    s = reduce(s, { type: 'SUMMARY_FOCUS', on: true }, deck)
    expect(s.sourceAnchor).toBe(before) // 表示の変化では動かない
  })
})
