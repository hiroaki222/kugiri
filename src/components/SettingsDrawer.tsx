import { Button, Select, Switch, Text } from '@cloudflare/kumo'
import { XIcon } from '@phosphor-icons/react'
import { BACKGROUNDS, type Settings } from '@/lib/settings'

type Props = {
  open: boolean
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
}

const BG_LABEL: Record<string, string> = {
  hai: '冷灰',
  kinari: '生成り',
  navy: '濃紺',
  sumi: '墨',
}
const BG_SWATCH: Record<string, string> = {
  hai: '#e9ece8',
  kinari: '#f2efe8',
  navy: '#16202e',
  sumi: '#1a1a1a',
}

function Slider(props: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  note?: string
}) {
  const id = `set-${props.label}`
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs" style={{ color: 'var(--kg-muted)' }}>
          {props.label}
        </label>
        <b className="text-xs tabular-nums">{props.display}</b>
      </div>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
        style={{ accentColor: 'var(--kg-mark)' }}
      />
      {props.note && (
        <p className="m-0 text-[11.5px] leading-relaxed" style={{ color: 'var(--kg-muted)' }}>
          {props.note}
        </p>
      )}
    </div>
  )
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="grid gap-4 border-t pt-4" style={{ borderColor: 'var(--kg-hair)' }}>
    <div
      className="text-[10px] font-semibold uppercase tracking-[0.15em]"
      style={{ color: 'var(--kg-muted)' }}
    >
      {title}
    </div>
    {children}
  </div>
)

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
        aria-label="詳細設定"
        aria-hidden={!open}
        data-hotkeys-off
        className="fixed inset-y-0 right-0 z-30 flex w-[min(400px,90vw)] flex-col overflow-y-auto border-l transition-transform duration-200"
        style={{
          background: 'var(--kg-panel)',
          borderColor: 'var(--kg-hair)',
          transform: open ? 'none' : 'translateX(100%)',
        }}
      >
        <div
          className="sticky top-0 flex items-center justify-between gap-3 border-b px-5 py-3"
          style={{ background: 'var(--kg-panel)', borderColor: 'var(--kg-hair)' }}
        >
          <Text variant="heading">詳細設定</Text>
          <Button variant="ghost" shape="square" icon={XIcon} aria-label="閉じる" onClick={onClose} />
        </div>

        <div className="grid gap-5 p-5">
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.15em]"
            style={{ color: 'var(--kg-muted)' }}
          >
            読みやすさ
          </div>
          <Slider
            label="文字サイズ"
            value={settings.sizePx}
            display={`${settings.sizePx} px`}
            min={18}
            max={64}
            step={1}
            onChange={(sizePx) => onChange({ sizePx })}
          />
          <Slider
            label="文字間の幅"
            value={settings.letterSpacing}
            display={`${settings.letterSpacing.toFixed(2)} em`}
            min={0}
            max={0.3}
            step={0.01}
            onChange={(letterSpacing) => onChange({ letterSpacing })}
            note="広げると隣の字からの干渉が減ります。"
          />
          <Slider
            label="知覚スパン"
            value={settings.spanChars}
            display={`全角 ${settings.spanChars} 字`}
            min={4}
            max={14}
            step={1}
            onChange={(spanChars) => onChange({ spanChars })}
            note="1枚に入る量の目安。既定の7字は「一度に読み取れる範囲」の目安です。"
          />
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs" style={{ color: 'var(--kg-muted)' }}>
                背景色
              </span>
              <b className="text-xs">{BG_LABEL[settings.bg]}</b>
            </div>
            <div className="flex flex-wrap gap-2">
              {BACKGROUNDS.map((bg) => (
                <button
                  key={bg}
                  type="button"
                  aria-label={BG_LABEL[bg]}
                  aria-pressed={settings.bg === bg}
                  onClick={() => onChange({ bg })}
                  className="size-8 cursor-pointer rounded-sm border"
                  style={{
                    background: BG_SWATCH[bg],
                    borderColor: settings.bg === bg ? 'transparent' : 'var(--kg-hair)',
                    boxShadow: settings.bg === bg ? '0 0 0 2px var(--kg-mark)' : undefined,
                  }}
                />
              ))}
            </div>
          </div>

          <Group title="全文カード">
            <div className="kg-switch-row">
              <Switch
                label="文の終わりに全文を出す"
                controlFirst={false}
                checked={settings.summaryOn}
                onCheckedChange={(summaryOn: boolean) => onChange({ summaryOn })}
              />
            </div>
            <Slider
              label="全文カードの長さ"
              value={settings.summaryRatio}
              display={`${Math.round(settings.summaryRatio * 100)} %`}
              min={0.1}
              max={1.2}
              step={0.05}
              onChange={(summaryRatio) => onChange({ summaryRatio })}
              note="その文を読むのにかかる時間に対する割合。長い文ほど自動的に長く出ます。"
            />
          </Group>

          <Group title="表示">
            <div className="kg-switch-row">
              <Switch
                label="周辺を暗くする"
                controlFirst={false}
                checked={settings.dimSurround}
                onCheckedChange={(dimSurround: boolean) => onChange({ dimSurround })}
              />
            </div>
          </Group>

          <Group title="貼り付け">
            <div className="kg-switch-row">
              <Switch
                label="PDF の改行を補正する"
                controlFirst={false}
                checked={settings.fixPdfWrap}
                onCheckedChange={(fixPdfWrap: boolean) => onChange({ fixPdfWrap })}
              />
            </div>
            <p className="m-0 text-[11.5px] leading-relaxed" style={{ color: 'var(--kg-muted)' }}>
              論文などで文の途中に入る改行をつなぎます。詩や箇条書きでは意味が変わるので、
              必要なときだけ入れてください。
            </p>
          </Group>

          <Group title="速度">
            <Select
              label="読み上げ速度"
              value={String(settings.cpm)}
              onValueChange={(v: string | null) => onChange({ cpm: Number(v ?? 1200) })}
              items={{
                '600': 'ゆっくり (600)',
                '900': 'やや遅い (900)',
                '1200': '標準 (1200)',
                '1800': '速い (1800)',
                '2600': 'かなり速い (2600)',
              }}
            />
          </Group>
        </div>
      </aside>
    </>
  )
}
