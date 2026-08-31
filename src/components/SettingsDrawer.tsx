import { useState } from 'react'
import { Button, Popover, Switch, Text } from '@cloudflare/kumo'
import { CheckIcon, XIcon } from '@phosphor-icons/react'
import { t } from '@/i18n'
import {
  type Background,
  BACKGROUNDS,
  clampCpm,
  CPM_MAX,
  CPM_MIN,
  DARK_BACKGROUNDS,
  DEFAULTS,
  type Settings,
} from '@/lib/settings'

type Props = {
  open: boolean
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
}

const SWATCH: Record<string, string> = {
  light: '#e9ece8',
  cream: '#f2efe8',
  navy: '#16202e',
  black: '#1a1a1a',
}

/** The control's name and its current value carry body colour; only the
 *  explanation is a step quieter. Muting the label too makes it impossible to
 *  tell what is a control and what is prose. */
const Row = ({
  label,
  value,
  note,
  htmlFor,
  children,
}: {
  label: string
  value?: string
  note?: string
  htmlFor?: string
  children: React.ReactNode
}) => (
  <div className="grid gap-1.5">
    <div className="flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {value && <span className="text-sm font-semibold tabular-nums">{value}</span>}
    </div>
    {note && (
      <p className="kg-jp-text m-0 text-xs leading-[1.7]" style={{ color: 'var(--kg-muted)' }}>
        {note}
      </p>
    )}
    <div className="mt-0.5">{children}</div>
  </div>
)

function Slider(props: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  note?: string
  disabled?: boolean
}) {
  const id = `set-${props.label}`
  return (
    <div style={{ opacity: props.disabled ? 0.45 : 1 }}>
      <Row label={props.label} value={props.display} note={props.note} htmlFor={id}>
        <input
          id={id}
          type="range"
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          disabled={props.disabled}
          onChange={(e) => props.onChange(Number(e.target.value))}
          className="w-full cursor-pointer disabled:cursor-not-allowed"
          style={{ accentColor: 'var(--kg-mark)' }}
        />
      </Row>
    </div>
  )
}

const Group = ({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) => (
  <section className="border-t pt-5" style={{ borderColor: 'var(--kg-hair)' }}>
    <h3 className="m-0 text-sm font-semibold">{title}</h3>
    {note && (
      <p
        className="kg-jp-text mt-1.5 mb-0 text-xs leading-[1.7]"
        style={{ color: 'var(--kg-muted)' }}
      >
        {note}
      </p>
    )}
    <div className="mt-4 grid gap-5">{children}</div>
  </section>
)

/** Chosen by eye, so no names: a swatch, a ring and a check mark say which one
 *  is active without relying on colour alone. */
function BackgroundPicker({
  value,
  onChange,
}: {
  value: Background
  onChange: (bg: Background) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {BACKGROUNDS.map((bg) => {
        const on = value === bg
        return (
          <button
            key={bg}
            type="button"
            aria-label={t.settings.readability.swatch[bg]}
            aria-pressed={on}
            onClick={() => onChange(bg)}
            className="grid size-9 cursor-pointer place-items-center rounded-sm border"
            style={{
              background: SWATCH[bg],
              borderColor: 'var(--kg-hair)',
              boxShadow: on ? '0 0 0 2px var(--kg-panel), 0 0 0 4px var(--kg-mark)' : undefined,
            }}
          >
            {on && (
              <CheckIcon
                size={16}
                weight="bold"
                color={DARK_BACKGROUNDS.includes(bg) ? '#e8ecf2' : '#131820'}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Resetting cannot be undone, so it asks first. A popover over the button
 *  rather than a centred dialog, which would cover the text being read. */
function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <Popover>
      <Popover.Trigger render={<Button variant="destructive">{t.settings.reset}</Button>} />
      <Popover.Content side="top" align="end" className="grid max-w-[19rem] gap-3">
        {/* Popover.Description defaults to the subtle token, which is right for
            a hint beside a control and wrong for the sentence being decided. */}
        <Popover.Description className="kg-jp-text m-0 text-sm leading-[1.7] text-kumo-default">
          {t.settings.resetConfirm}
        </Popover.Description>
        <div className="flex justify-end gap-2">
          <Popover.Close render={<Button variant="ghost">{t.settings.resetCancel}</Button>} />
          <Popover.Close
            render={
              <Button variant="destructive" onClick={onReset}>
                {t.settings.resetOk}
              </Button>
            }
          />
        </div>
      </Popover.Content>
    </Popover>
  )
}

function SpeedRow({ cpm, onChange }: { cpm: number; onChange: (cpm: number) => void }) {
  // Clamping on every keystroke makes the field impossible to type in: the
  // first digit of 500 is 5, which is below the minimum and is replaced by it
  // before the second digit arrives. What is being typed is held as text and
  // only becomes a number when the field is left or Enter is pressed.
  const [typed, setTyped] = useState<string | null>(null)

  const commit = () => {
    if (typed === null) return
    const v = Number(typed)
    if (typed.trim() !== '' && Number.isFinite(v)) onChange(clampCpm(v))
    setTyped(null)
  }

  return (
    <Row label={t.settings.pace.speed} htmlFor="set-cpm" note={t.settings.pace.speedNote}>
      <div className="flex items-center gap-3">
        <input
          id="set-cpm"
          type="range"
          min={CPM_MIN}
          max={CPM_MAX}
          step={50}
          value={cpm}
          onChange={(e) => {
            setTyped(null)
            onChange(Number(e.target.value))
          }}
          className="w-full cursor-pointer"
          style={{ accentColor: 'var(--kg-mark)' }}
        />
        {/* The slider alone cannot hit an exact value across this range. */}
        <span className="flex shrink-0 items-center gap-1">
          <input
            type="number"
            min={CPM_MIN}
            max={CPM_MAX}
            step={50}
            value={typed ?? cpm}
            aria-label={t.settings.pace.speedField}
            onChange={(e) => setTyped(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            className="w-16 rounded-sm border px-1.5 py-1 text-right text-sm font-semibold tabular-nums"
            style={{
              borderColor: 'var(--kg-hair)',
              background: 'var(--kg-paper)',
              color: 'var(--kg-ink)',
            }}
          />
          <span className="text-xs" style={{ color: 'var(--kg-muted)' }}>
            cpm
          </span>
        </span>
      </div>
    </Row>
  )
}

export function SettingsDrawer({ open, settings, onChange, onClose }: Props) {
  return (
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className="fixed inset-0 z-20 bg-black/35 transition-opacity duration-200"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
      />
      <aside
        aria-label={t.settings.title}
        aria-hidden={!open}
        data-hotkeys-off
        className="fixed inset-y-0 right-0 z-30 flex w-[min(460px,92vw)] flex-col overflow-y-auto border-l transition-transform duration-200"
        style={{
          background: 'var(--kg-panel)',
          borderColor: 'var(--kg-hair)',
          transform: open ? 'none' : 'translateX(100%)',
        }}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-5 py-3"
          style={{ background: 'var(--kg-panel)', borderColor: 'var(--kg-hair)' }}
        >
          <Text variant="heading">{t.settings.title}</Text>
          <Button
            variant="ghost"
            shape="square"
            icon={XIcon}
            aria-label={t.app.close}
            onClick={onClose}
          />
        </div>

        {/* Ordered by when a setting is decided rather than by how often it is
            touched: before reading, while reading, then what happens at the end
            of a sentence. Speed sits in the middle because the reading screen
            already carries a slider; this is the copy for exact values.
            The first group drops its rule, which would double the header's. */}
        <div className="flex flex-1 flex-col gap-6 p-5 [&>section:first-of-type]:border-none [&>section:first-of-type]:pt-0">
          <Group title={t.settings.readability.title} note={t.settings.readability.note}>
            <Slider
              label={t.settings.readability.size}
              value={settings.sizePx}
              display={t.settings.readability.sizeValue(settings.sizePx)}
              min={18}
              max={64}
              step={1}
              onChange={(sizePx) => onChange({ sizePx })}
            />
            <Slider
              label={t.settings.readability.spacing}
              value={settings.letterSpacing}
              display={t.settings.readability.spacingValue(settings.letterSpacing)}
              min={0}
              max={0.3}
              step={0.01}
              onChange={(letterSpacing) => onChange({ letterSpacing })}
              note={t.settings.readability.spacingNote}
            />
            <Slider
              label={t.settings.readability.span}
              value={settings.spanChars}
              display={t.settings.readability.spanValue(settings.spanChars)}
              min={4}
              max={14}
              step={1}
              onChange={(spanChars) => onChange({ spanChars })}
              note={t.settings.readability.spanNote}
            />
            <Row label={t.settings.readability.background}>
              <BackgroundPicker value={settings.bg} onChange={(bg) => onChange({ bg })} />
            </Row>
          </Group>

          <Group title={t.settings.pace.title}>
            <SpeedRow cpm={settings.cpm} onChange={(cpm) => onChange({ cpm })} />
            <Slider
              label={t.settings.pace.review}
              value={settings.reviewStrength}
              display={
                settings.reviewStrength === 0
                  ? t.settings.pace.reviewOff
                  : t.settings.pace.reviewValue(1 + 2 * settings.reviewStrength)
              }
              min={0}
              max={2}
              step={0.25}
              onChange={(reviewStrength) => onChange({ reviewStrength })}
              note={t.settings.pace.reviewNote}
            />
          </Group>

          <Group title={t.settings.review.title}>
            <div className="kg-switch-row">
              <Switch
                label={t.settings.review.summary}
                controlFirst={false}
                checked={settings.summaryOn}
                onCheckedChange={(summaryOn: boolean) => onChange({ summaryOn })}
              />
            </div>
            <Slider
              label={t.settings.review.summaryRatio}
              value={settings.summaryRatio}
              display={t.settings.review.summaryRatioValue(Math.round(settings.summaryRatio * 100))}
              min={0.1}
              max={1.2}
              step={0.05}
              disabled={!settings.summaryOn}
              onChange={(summaryRatio) => onChange({ summaryRatio })}
              note={t.settings.review.summaryRatioNote}
            />
            <Slider
              label={t.settings.review.context}
              value={settings.contextSentences}
              display={t.settings.review.contextValue(settings.contextSentences)}
              min={2}
              max={40}
              step={2}
              onChange={(contextSentences) => onChange({ contextSentences })}
              note={t.settings.review.contextNote}
            />
            <div className="kg-switch-row">
              <Switch
                label={t.settings.review.dim}
                controlFirst={false}
                checked={settings.dimSurround}
                onCheckedChange={(dimSurround: boolean) => onChange({ dimSurround })}
              />
            </div>
          </Group>

          {/* mt-auto so it reaches the corner even when the settings do not
              fill the panel. */}
          <div
            className="mt-auto flex justify-end border-t pt-4"
            style={{ borderColor: 'var(--kg-hair)' }}
          >
            <ResetButton onReset={() => onChange(DEFAULTS)} />
          </div>
        </div>
      </aside>
    </>
  )
}
