import { useRef } from 'react'
import { Banner } from '@cloudflare/kumo'
import { CardStage } from '@/components/CardStage'
import { Controls } from '@/components/Controls'
import { Progress } from '@/components/Progress'
import type { DeckState } from '@/hooks/useDeck'
import type { Playback } from '@/hooks/usePlayback'
import { t } from '@/i18n'
import type { Settings } from '@/lib/settings'

type Props = {
  state: DeckState
  playback: Playback
  settings: Settings
  onCpm: (cpm: number) => void
  /** useDeck measures against this element, so it has to reach back up. */
  onContainer: (el: HTMLElement | null) => void
}

export function ReadingView({ state, playback, settings, onCpm, onContainer }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const { pb, ready, dispatch, seekStep, findStepForCard } = playback

  return (
    <div className="flex flex-1 flex-col">
      {state.status === 'error' && (
        <div className="p-5">
          <Banner variant="error" title={t.reading.errorTitle} description={state.message} />
        </div>
      )}

      {/* The container is mounted whether or not a deck exists. Putting it
          inside the ready branch is circular: building a deck needs a width,
          and the element that has a width would not exist until the deck did. */}
      <div
        ref={(el) => {
          stageRef.current = el
          onContainer(el)
        }}
        className="flex flex-1 flex-col"
      >
        {!ready && (
          <div className="grid flex-1 place-items-center text-sm" style={{ color: 'var(--kg-muted)' }}>
            {state.status === 'building' ? t.reading.building : ''}
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
            idle={!playback.started}
            contextSentences={settings.contextSentences}
            summaryProgress={playback.summaryProgress}
            onSummaryFocus={(on) => dispatch({ type: 'SUMMARY_FOCUS', on })}
            onSummaryScroll={(on) => dispatch({ type: 'SUMMARY_SCROLL', on })}
            stageRef={stageRef}
          />
        )}
      </div>

      {ready && (
        <>
          {/* The percentage belongs beside the bar it measures. Next to the cpm
              readout it reads as a second number about speed. */}
          <div
            className="flex flex-none items-center gap-3 border-t px-5 py-1.5"
            style={{ background: 'var(--kg-panel)', borderColor: 'var(--kg-hair)' }}
          >
            <div className="min-w-0 flex-1">
              <Progress
                cards={ready.cards}
                paragraphs={ready.paragraphs}
                sourceLength={ready.source.length}
                offset={playback.offset}
                onSeekOffset={(o) => {
                  const i = ready.cards.findIndex((c) => o < c.sourceEnd)
                  seekStep(findStepForCard(i < 0 ? ready.cards.length - 1 : i), 'slider')
                }}
              />
            </div>
            <b className="w-9 shrink-0 text-right text-[11px] tabular-nums">{playback.pct}%</b>
          </div>

          <Controls
            cpm={settings.cpm}
            onCpm={onCpm}
            playing={playback.playing}
            blocked={pb.scrollBlocked}
            onTogglePlay={() => dispatch({ type: 'PLAY' })}
            onPrev={() => seekStep(pb.stepIndex - 1, 'key-card')}
            onNext={() => seekStep(pb.stepIndex + 1, 'key-card')}
          />
        </>
      )}
    </div>
  )
}
