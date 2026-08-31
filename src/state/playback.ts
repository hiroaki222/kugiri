/**
 * 再生の状態機械。
 *
 * 単一の列挙型では表現できない — 「再生中に K を押す」「停止した瞬間に文脈を
 * 出す」はどれも元が再生中だったかを保持する必要がある。よって直交する軸に分ける。
 */

export type Display =
  | { mode: 'card' }
  | { mode: 'context'; by: 'held' | 'paused' }
  | { mode: 'summary' }

export type Playback = {
  /** 再生意図。K を押しても scroll で止まっても変わらない。 */
  intent: 'playing' | 'paused'
  display: Display
  /** 戻った直後の長い滞留の最中 */
  reviewing: boolean
  /** scroll カードに再生中に到達して自動停止した */
  scrollBlocked: boolean
  /** 全文カードを読んでいる最中。focus と scroll は同時に立ちうるので分ける */
  summaryFocused: boolean
  summaryScrolling: boolean
  /** 現在位置。別 state に置くと二重送りや summary 遷移をイベント列で検証できない */
  stepIndex: number
  /** 位置復元用のアンカー。ユーザーが実際に移動したときだけ更新する。
   *  毎回「現在カードの sourceStart」から取り直すと往復のたびに後退する。 */
  sourceAnchor: number
  /** タイマーを張り替える全イベントで上がる。古い callback を捨てるため。 */
  timerGen: number
  timerDeadline: number | null
  /** 長押し巻き戻しの最中。repeat のたびに reviewing を付けると引っかかる。 */
  holding: boolean
}

export type SeekCause = 'key-card' | 'key-sentence' | 'key-paragraph' | 'slider' | 'hold'

export type Event =
  | { type: 'PLAY' }
  | { type: 'PAUSE_REQUEST' }
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

/** step の種類。reducer は Card[] を知らないので、必要な情報だけ渡す。 */
export type StepInfo = {
  kind: 'card' | 'summary'
  /** 進捗と位置復元に使う source offset */
  sourceStart: number
  /** scroll カードか (再生中に到達したら止める) */
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
 * 止める理由を肯定的に列挙する。
 * 「card のときだけ進む」にすると全文カードで永久停止する —
 * 全文カード自身が予定 dwell を持って自動で次へ進む step だから。
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
    // 位置復元のアンカーはユーザーが移動したときだけ更新する
    sourceAnchor: step ? step.sourceStart : s.sourceAnchor,
    // 全文カードは K も自動文脈も出さない (何を反転するかが決まらないし、
    // すでに全文が見えているので出す意味も無い)
    display: step?.kind === 'summary' ? { mode: 'summary' } : { mode: 'card' },
    // scroll カードで止まるのは再生中に到達したときだけ。手動で来たら止めない —
    // でないと再生しようとして Space を押した人がカードを飛ばしてしまう。
    scrollBlocked: false,
    summaryFocused: false,
    summaryScrolling: false,
  })
  // 戻る操作にだけ長い滞留を付ける。前進の seek に間は要らない。
  // slider は自分で見に行った位置なので付けない。長押し中も付けない。
  const isBackKey = cause !== 'slider' && cause !== 'hold'
  return { ...next, reviewing: isBackKey && clamped < s.stepIndex }
}

export function reduce(s: Playback, e: Event, deck: Deck): Playback {
  switch (e.type) {
    case 'PLAY': {
      if (s.scrollBlocked) {
        // blocked 中は再生/停止のトグルではなく「解除して次へ進む」
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
      // 文脈を自動で出すのはこのイベントのときだけ。intent === 'paused' を条件に
      // すると読書画面に入った直後 (初期状態も paused) から文脈表示になる。
      const cur = at(deck, s.stepIndex)
      return {
        ...bump(s),
        intent: 'paused',
        reviewing: false,
        display:
          cur?.kind === 'summary' ? { mode: 'summary' } : { mode: 'context', by: 'paused' },
      }
    }

    case 'TIMER': {
      if (e.gen !== s.timerGen) return s // 古い世代は捨てる
      if (!effectivePlaying(s)) return s
      if (s.stepIndex >= deck.steps.length - 1) return reduce(s, { type: 'REACHED_END' }, deck)
      const next = s.stepIndex + 1
      const step = at(deck, next)
      // 再生中に scroll カードへ到達したら止める
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
      // 長押しを離した時点の位置にだけ reviewing を付ける
      return { ...bump(s), holding: false, reviewing: true }

    case 'CONTEXT_DOWN': {
      // 全文カード表示中は文脈に遷移しない
      if (s.display.mode === 'summary') return s
      return { ...bump(s), display: { mode: 'context', by: 'held' } }
    }

    case 'CONTEXT_UP': {
      // 停止して出ている文脈は K を離しても消さない
      if (s.display.mode !== 'context' || s.display.by !== 'held') return s
      return { ...bump(s), display: { mode: 'card' } }
    }

    case 'BLUR': {
      // 押しているキーの状態をリセットすることと、表示を変えることを分ける。
      // K を押したままフォーカスを失うと keyup が来ないので BLUR は必須。
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
