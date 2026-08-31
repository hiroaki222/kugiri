import { Button } from '@cloudflare/kumo'
import {
  CaretLeftIcon,
  CaretRightIcon,
  MinusIcon,
  PlayIcon,
  PlusIcon,
  StopIcon,
} from '@phosphor-icons/react'
import { t } from '@/i18n'
import { clampCpm, CPM_MAX, CPM_MIN } from '@/lib/settings'

const CPM_NUDGE = 50

type Props = {
  cpm: number
  onCpm: (cpm: number) => void
  playing: boolean
  /** Playback stopped on a card too wide to fit; Space moves past it. */
  blocked: boolean
  onTogglePlay: () => void
  onPrev: () => void
  onNext: () => void
}

function SpeedControl({ cpm, onCpm }: Pick<Props, 'cpm' | 'onCpm'>) {
  return (
    <span className="flex items-center gap-1.5">
      <Button
        variant="ghost"
        shape="square"
        icon={MinusIcon}
        aria-label={t.reading.speedDown}
        onClick={() => onCpm(clampCpm(cpm - CPM_NUDGE))}
      />
      <input
        type="range"
        min={CPM_MIN}
        max={CPM_MAX}
        step={CPM_NUDGE}
        value={cpm}
        aria-label={t.reading.speed}
        onChange={(e) => onCpm(Number(e.target.value))}
        className="w-[clamp(140px,26vw,340px)] cursor-pointer"
        style={{ accentColor: 'var(--kg-mark)' }}
        data-hotkeys-off
      />
      <Button
        variant="ghost"
        shape="square"
        icon={PlusIcon}
        aria-label={t.reading.speedUp}
        onClick={() => onCpm(clampCpm(cpm + CPM_NUDGE))}
      />
      <span className="w-[68px] shrink-0">{t.reading.cpm(cpm)}</span>
    </span>
  )
}

/** The play button says what pressing it will do, not what is happening now.
 *  Filled while playing, outlined while stopped, so the state also reads from
 *  peripheral vision. */
function PlayButton({ playing, onTogglePlay }: Pick<Props, 'playing' | 'onTogglePlay'>) {
  const label = playing ? t.reading.stop : t.reading.play
  return (
    <button
      type="button"
      onClick={onTogglePlay}
      aria-pressed={playing}
      aria-label={label}
      className="flex h-9 min-w-[104px] cursor-pointer items-center justify-center gap-2 rounded-md px-4 text-[13px] font-semibold transition-colors"
      style={
        playing
          ? {
              background: 'var(--kg-mark)',
              color: 'var(--kg-panel)',
              border: '1px solid var(--kg-mark)',
            }
          : {
              background: 'transparent',
              color: 'var(--kg-ink)',
              border: '1px solid var(--kg-hair)',
            }
      }
    >
      {playing ? <StopIcon weight="fill" size={16} /> : <PlayIcon weight="fill" size={16} />}
      {label}
    </button>
  )
}

export function Controls(props: Props) {
  return (
    <div
      className="flex flex-none flex-wrap items-center justify-between gap-4 border-t px-5 py-2.5 text-[11px] tabular-nums"
      style={{
        background: 'var(--kg-panel)',
        borderColor: 'var(--kg-hair)',
        color: 'var(--kg-muted)',
      }}
    >
      <SpeedControl cpm={props.cpm} onCpm={props.onCpm} />

      <span className="flex items-center gap-2">
        {props.blocked && (
          <span
            className="mr-1 rounded-sm px-2 py-1 text-[11px]"
            style={{
              background: 'color-mix(in srgb, var(--kg-mark) 14%, transparent)',
              color: 'var(--kg-mark)',
            }}
          >
            {t.reading.overflowNotice}
          </span>
        )}
        <Button
          variant="ghost"
          shape="square"
          icon={CaretLeftIcon}
          aria-label={t.reading.prev}
          onClick={props.onPrev}
        />
        <PlayButton playing={props.playing} onTogglePlay={props.onTogglePlay} />
        <Button
          variant="ghost"
          shape="square"
          icon={CaretRightIcon}
          aria-label={t.reading.next}
          onClick={props.onNext}
        />
      </span>
    </div>
  )
}
