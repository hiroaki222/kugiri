import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Banner, Button, Text } from '@cloudflare/kumo'
import { ArrowUUpLeftIcon, GearIcon, PlayIcon, StopIcon, CaretLeftIcon, CaretRightIcon, QuestionIcon, MinusIcon, PlusIcon } from '@phosphor-icons/react'
import { CardStage } from '@/components/CardStage'
import { HelpDialog } from '@/components/HelpDialog'
import { InputPane } from '@/components/InputPane'
import { Progress } from '@/components/Progress'
import { SettingsDrawer } from '@/components/SettingsDrawer'
import { useDeck } from '@/hooks/useDeck'
import { useHotkeys } from '@/hooks/useHotkeys'
import { dwellMs, reviewDwellMs } from '@/lib/dwell'
import { loadSettings, saveSettings, type Settings } from '@/lib/settings'
import { progressOffset, summaryDwellMs } from '@/lib/steps'
import { effectivePlaying, initial, reduce, type Deck as RDeck, type Event } from '@/state/playback'

const SAMPLE = `視覚的な情報処理において、人間の眼球は連続的に文字列を追っているわけではない。実際にはサッケードと呼ばれる跳躍運動と、停留と呼ばれる短い静止を繰り返している。この停留のあいだにだけ、我々は文字を読み取っている。したがって一度の停留で捉えられる範囲を超えた長さの行を追わせることは、それ自体が余分な運動負荷になる。

読む速さを決めているのは眼の動きの速さではない。一度の停留でどれだけの範囲を語として同定できるか、その幅のほうが効いている。漢字かな交じりの日本語では、その幅はおよそ五文字から八文字とされる。これは短い。かなり短い。行の長さとは無関係である。`

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [raw, setRaw] = useState('')
  const [view, setView] = useState<'compose' | 'read'>('compose')
  const [panel, setPanel] = useState(false)
  const [help, setHelp] = useState(false)
  const [summaryProgress, setSummaryProgress] = useState<number | null>(null)

  const stageRef = useRef<HTMLDivElement>(null)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const { state, setAnchor } = useDeck(view === 'read' ? raw : '', settings, container)

  const [pb, setPb] = useState(initial)
  const pbRef = useRef(pb)
  pbRef.current = pb

  const deck: RDeck = useMemo(() => {
    if (state.status !== 'ready') return { steps: [] }
    return {
      steps: state.deck.steps.map((s) => {
        const card =
          s.kind === 'card' ? state.deck.cards[s.cardIndex] : state.deck.cards[s.afterCard]
        return {
          kind: s.kind,
          sourceStart: card?.sourceStart ?? 0,
          isScroll: s.kind === 'card' && card?.fit.mode === 'scroll',
        }
      }),
    }
  }, [state])

  const dispatch = useCallback(
    (e: Event) => setPb((s) => reduce(s, e, deck)),
    [deck],
  )

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    const el = document.documentElement
    el.dataset.bg = settings.bg
    // Kumo は light-dark() で色を解決し、モードは data-mode で決まる。
    // トークンを上書きするだけではコンポーネント側 (Button, Text, Switch) が
    // 明色のままになり、暗い背景で文字が潰れる。
    const dark = settings.bg === 'navy' || settings.bg === 'sumi'
    el.dataset.mode = dark ? 'dark' : 'light'
    el.style.colorScheme = dark ? 'dark' : 'light'
  }, [settings.bg])

  // 書体クラスと deck は同じ commit で適用される (deck が ready になった時点)
  useEffect(() => {
    if (state.status === 'ready') document.documentElement.dataset.font = state.deck.fontMode
  }, [state])

  // 組み直しが終わったら位置を復元する
  useEffect(() => {
    if (state.status === 'ready') dispatch({ type: 'REBUILD', stepIndex: state.restoreStep })
  }, [state, dispatch])

  const ready = state.status === 'ready' ? state.deck : null
  const step = ready?.steps[pb.stepIndex]
  const offset = ready ? progressOffset(step, ready.cards, ready.source.length) : 0

  // 現在位置のアンカーを useDeck に渡す (ユーザーが移動したときだけ更新される)
  useEffect(() => {
    if (ready) setAnchor(pb.sourceAnchor)
  }, [ready, pb.sourceAnchor, setAnchor])

  // 再生ループ。timerGen が変わるたびに張り直す。
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
    const t = setTimeout(() => dispatch({ type: 'TIMER', gen }), ms)

    if (s.kind === 'summary') {
      const t0 = performance.now()
      let raf = 0
      const tickBar = () => {
        setSummaryProgress(Math.min(1, (performance.now() - t0) / ms))
        raf = requestAnimationFrame(tickBar)
      }
      raf = requestAnimationFrame(tickBar)
      return () => {
        clearTimeout(t)
        cancelAnimationFrame(raf)
      }
    }
    setSummaryProgress(null)
    return () => clearTimeout(t)
  }, [ready, pb.timerGen, pb.stepIndex, pb.reviewing, settings.cpm, settings.summaryRatio,
      settings.reviewStrength, dispatch])

  // 詳細設定を開いたら再生を止める。ユーザーが「止めたい」と言ったわけではないので
  // 文脈は出さない (停止ボタンとは意味が違う)。
  useEffect(() => {
    if (panel) dispatch({ type: 'SUSPEND' })
  }, [panel, dispatch])

  const seekStep = useCallback(
    (target: number, cause: Parameters<typeof reduce>[1] extends never ? never : 'key-card' | 'key-sentence' | 'key-paragraph' | 'slider' | 'hold') => {
      const dir: -1 | 1 = target < pbRef.current.stepIndex ? -1 : 1
      dispatch({ type: 'SEEK', target, cause, direction: dir })
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

  useHotkeys(view === 'read' && !panel && !help, {
    cardStep: (d) => seekStep(pbRef.current.stepIndex + d, 'key-card'),
    sentenceStep: (d) => {
      if (!ready) return
      const ci = currentCardIndex()
      const cur = ready.cards[ci]
      if (!cur) return
      if (d === -1) {
        const first = ready.cards.findIndex((c) => c.sentenceId === cur.sentenceId)
        if (ci > first) return seekStep(findStepForCard(first), 'key-sentence')
        const prev = ready.cards.findIndex((c) => c.sentenceId === cur.sentenceId - 1)
        seekStep(findStepForCard(prev < 0 ? 0 : prev), 'key-sentence')
      } else {
        const next = ready.cards.findIndex((c) => c.sentenceId === cur.sentenceId + 1)
        seekStep(findStepForCard(next < 0 ? ready.cards.length - 1 : next), 'key-sentence')
      }
    },
    paragraphStep: (d) => {
      if (!ready) return
      const ci = currentCardIndex()
      const pi = ready.paragraphs.findIndex((p) => ci < p.cardEnd)
      const p = ready.paragraphs[pi]
      if (!p) return
      if (d === -1 && ci > p.cardStart) return seekStep(findStepForCard(p.cardStart), 'key-paragraph')
      const t = ready.paragraphs[pi + d]
      seekStep(findStepForCard(t ? t.cardStart : d < 0 ? 0 : ready.cards.length - 1), 'key-paragraph')
    },
    toEdge: (d) => seekStep(d < 0 ? 0 : deck.steps.length - 1, 'key-card'),
    speedStep: (d) =>
      setSettings((s) => ({ ...s, cpm: Math.min(4000, Math.max(300, s.cpm + d * 100)) })),
    togglePlay: () => dispatch({ type: 'PLAY' }),
    contextDown: () => dispatch({ type: 'CONTEXT_DOWN' }),
    contextUp: () => dispatch({ type: 'CONTEXT_UP' }),
    escape: () => dispatch({ type: 'ESCAPE' }),
    holdStart: () => dispatch({ type: 'HOLD_START' }),
    holdEnd: () => dispatch({ type: 'HOLD_END' }),
    help: () => setHelp(true),
    settings: () => setPanel((v) => !v),
  })

  const patch = useCallback((p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p })), [])
  const pct = ready && ready.source.length ? Math.round((offset / ready.source.length) * 100) : 0

  return (
    <div className="flex min-h-full flex-col">
      <header
        className="flex flex-none items-center justify-between gap-4 border-b px-5 py-2.5"
        style={{ background: 'var(--kg-panel)', borderColor: 'var(--kg-hair)' }}
      >
        <div className="flex items-baseline gap-2">
          <Text variant="heading">Kugiri</Text>
          <span className="text-[10.5px] uppercase tracking-[0.14em]" style={{ color: 'var(--kg-muted)' }}>
            くぎり
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {view === 'read' && (
            <Button variant="ghost" shape="square" icon={ArrowUUpLeftIcon} aria-label="入力に戻る"
              onClick={() => { dispatch({ type: 'ESCAPE' }); setView('compose') }} />
          )}
          <Button variant="ghost" shape="square" icon={GearIcon} aria-label="詳細設定" onClick={() => setPanel(true)} />
          <Button variant="ghost" shape="square" icon={QuestionIcon} aria-label="キー操作" onClick={() => setHelp(true)} />
        </div>
      </header>

      {view === 'compose' ? (
        <InputPane
          value={raw}
          onChange={setRaw}
          onSample={() => setRaw(SAMPLE)}
          onRead={() => setView('read')}
          fixPdfWrap={settings.fixPdfWrap}
          onFixPdfWrapChange={(fixPdfWrap) => patch({ fixPdfWrap })}
        />
      ) : (
        <div className="flex flex-1 flex-col">
          {state.status === 'error' && (
            <div className="p-5">
              <Banner variant="error" title="読み込めませんでした" description={state.message} />
            </div>
          )}
          {/* コンテナは deck の有無と無関係に常にマウントする。
              ready の中に置くと「deck を作るのに幅が要るのに、幅を持つ要素は
              deck ができるまで存在しない」という循環になる。 */}
          <div
            ref={(el) => { stageRef.current = el; setContainer(el) }}
            className="flex flex-1 flex-col"
          >
            {!ready && (
              <div className="grid flex-1 place-items-center text-sm" style={{ color: 'var(--kg-muted)' }}>
                {state.status === 'building' ? '区切っています…' : ''}
              </div>
            )}
            {ready && (
                <CardStage
                  step={ready.steps[pb.stepIndex]}
                  cards={ready.cards}
                  source={ready.source}
                  sentences={ready.sentences}
                  display={pb.display}
                  sizePx={settings.sizePx}
                  letterSpacing={settings.letterSpacing}
                  dim={settings.dimSurround}
                  summaryProgress={summaryProgress}
                  onSummaryFocus={(on) => dispatch({ type: 'SUMMARY_FOCUS', on })}
                  onSummaryScroll={(on) => dispatch({ type: 'SUMMARY_SCROLL', on })}
                  stageRef={stageRef}
                />
            )}
          </div>
          {ready && (
            <>
              <div className="flex-none border-t px-5 py-1.5" style={{ background: 'var(--kg-panel)', borderColor: 'var(--kg-hair)' }}>
                <Progress
                  cards={ready.cards}
                  paragraphs={ready.paragraphs}
                  sourceLength={ready.source.length}
                  offset={offset}
                  onTogglePlay={() => dispatch({ type: 'PLAY' })}
                  onSeekOffset={(o) => {
                    const ci = ready.cards.findIndex((c) => o < c.sourceEnd)
                    seekStep(findStepForCard(ci < 0 ? ready.cards.length - 1 : ci), 'slider')
                  }}
                />
              </div>
              <div
                className="flex flex-none flex-wrap items-center justify-between gap-4 border-t px-5 py-2.5 text-[11px] tabular-nums"
                style={{ background: 'var(--kg-panel)', borderColor: 'var(--kg-hair)', color: 'var(--kg-muted)' }}
              >
                <span className="flex items-center gap-3">
                  <b className="w-10" style={{ color: 'var(--kg-ink)' }}>{pct}%</b>
                  <span className="flex items-center gap-1.5">
                    <Button variant="ghost" shape="square" icon={MinusIcon} aria-label="速度を下げる"
                      onClick={() => patch({ cpm: Math.max(300, settings.cpm - 50) })} />
                    <input
                      type="range" min={300} max={4000} step={50} value={settings.cpm}
                      aria-label="読み上げ速度"
                      onChange={(e) => patch({ cpm: Number(e.target.value) })}
                      className="w-[clamp(140px,26vw,340px)] cursor-pointer"
                      style={{ accentColor: 'var(--kg-mark)' }}
                      data-hotkeys-off
                    />
                    <Button variant="ghost" shape="square" icon={PlusIcon} aria-label="速度を上げる"
                      onClick={() => patch({ cpm: Math.min(4000, settings.cpm + 50) })} />
                    <span className="w-[68px] shrink-0">{settings.cpm} cpm</span>
                  </span>
                </span>

                <span className="flex items-center gap-2">
                  {pb.scrollBlocked && (
                    <span className="mr-1 rounded-sm px-2 py-1 text-[11px]"
                          style={{ background: 'color-mix(in srgb, var(--kg-mark) 14%, transparent)', color: 'var(--kg-mark)' }}>
                      横に収まりません ・ スペースキーで次へ
                    </span>
                  )}
                  <Button variant="ghost" shape="square" icon={CaretLeftIcon} aria-label="前へ"
                    onClick={() => seekStep(pb.stepIndex - 1, 'key-card')} />
                  {/* ボタンには「今の状態」ではなく「押したら何が起きるか」を出す。
                      再生中は押せば止まるので「停止」= 赤。停止中は「再生」= 枠線だけ。
                      色と塗りの差で周辺視からも状態が読める。 */}
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'PLAY' })}
                    aria-pressed={effectivePlaying(pb)}
                    aria-label={effectivePlaying(pb) ? '停止' : '再生'}
                    className="flex h-9 min-w-[104px] cursor-pointer items-center justify-center gap-2 rounded-md px-4 text-[13px] font-semibold transition-colors"
                    style={
                      // 再生中は塗り (押せば止まる)、停止中は枠線だけ。
                      // 塗りの有無で周辺視からも状態が読める。
                      effectivePlaying(pb)
                        ? { background: 'var(--kg-mark)', color: 'var(--kg-panel)', border: '1px solid var(--kg-mark)' }
                        : { background: 'transparent', color: 'var(--kg-ink)', border: '1px solid var(--kg-hair)' }
                    }
                  >
                    {effectivePlaying(pb) ? <StopIcon weight="fill" size={16} /> : <PlayIcon weight="fill" size={16} />}
                    {effectivePlaying(pb) ? '停止' : '再生'}
                  </button>
                  <Button variant="ghost" shape="square" icon={CaretRightIcon} aria-label="次へ"
                    onClick={() => seekStep(pb.stepIndex + 1, 'key-card')} />
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <SettingsDrawer open={panel} settings={settings} onChange={patch} onClose={() => setPanel(false)} />
      <HelpDialog open={help} onClose={() => setHelp(false)} />
    </div>
  )
}
