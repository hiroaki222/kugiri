import { Button, Switch, Text } from '@cloudflare/kumo'
import { CheckIcon, XIcon } from '@phosphor-icons/react'
import { BACKGROUNDS, DEFAULTS, type Settings } from '@/lib/settings'

type Props = {
  open: boolean
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
}

// 伝統色の名前で呼ぶ。同じ明度帯に2色あるので、名前だけでなくスウォッチと
// チェックでも見分けられるようにしてある。
const BG_LABEL: Record<string, string> = {
  hakuji: '白磁',
  gofun: '胡粉',
  tetsukon: '鉄紺',
  sumi: '墨',
}
const BG_SWATCH: Record<string, string> = {
  hakuji: '#e9ece8',
  gofun: '#f2efe8',
  tetsukon: '#16202e',
  sumi: '#1a1a1a',
}

/** 操作名と現在値は本文色、補足だけを一段弱く。ラベルまで muted にすると
 *  「操作するもの」と「説明」の区別が付かない。 */
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
      <p className="kg-jp-text mt-1.5 mb-0 text-xs leading-[1.7]" style={{ color: 'var(--kg-muted)' }}>
        {note}
      </p>
    )}
    <div className="mt-4 grid gap-5">{children}</div>
  </section>
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
          <Text variant="heading">詳細設定</Text>
          <Button variant="ghost" shape="square" icon={XIcon} aria-label="閉じる" onClick={onClose} />
        </div>

        {/* 並びは触る頻度ではなく「読む前に決めるもの → 読みながら変えるもの →
            読み終わりの補助」の順。速度はメイン画面にも常時あるので、ここでは
            数値で正確に入れたいときの控えとして中ほどに置く。 */}
        {/* 先頭のグループの罫線はヘッダーの境界と二重になるので落とす */}
        <div className="grid gap-6 p-5 [&>section:first-of-type]:border-none [&>section:first-of-type]:pt-0">
          <Group
            title="カードの読みやすさ"
            note="文字サイズ・文字間隔・知覚スパンを変えると、カードを組み直します。読んでいた位置はそのままです。"
          >
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
              label="文字間隔"
              value={settings.letterSpacing}
              display={`${settings.letterSpacing.toFixed(2)} em`}
              min={0}
              max={0.3}
              step={0.01}
              onChange={(letterSpacing) => onChange({ letterSpacing })}
              note="広げると、隣り合う文字を見分けやすくなります。"
            />
            <Slider
              label="知覚スパン"
              value={settings.spanChars}
              display={`全角 ${settings.spanChars} 字`}
              min={4}
              max={14}
              step={1}
              onChange={(spanChars) => onChange({ spanChars })}
              note="1枚に表示する文字数の目安です。初期値の7字は、一度に読み取りやすい範囲を基準にしています。"
            />
            <Row label="背景色" value={BG_LABEL[settings.bg]}>
              <div className="flex flex-wrap gap-2">
                {BACKGROUNDS.map((bg) => {
                  const on = settings.bg === bg
                  return (
                    <button
                      key={bg}
                      type="button"
                      aria-label={BG_LABEL[bg]}
                      aria-pressed={on}
                      onClick={() => onChange({ bg })}
                      // 選択を色だけで伝えない。枠は常に描き、選択中はリングとチェックを足す。
                      className="grid size-9 cursor-pointer place-items-center rounded-sm border"
                      style={{
                        background: BG_SWATCH[bg],
                        borderColor: 'var(--kg-hair)',
                        boxShadow: on
                          ? '0 0 0 2px var(--kg-panel), 0 0 0 4px var(--kg-mark)'
                          : undefined,
                      }}
                    >
                      {on && (
                        <CheckIcon
                          size={16}
                          weight="bold"
                          color={bg === 'tetsukon' || bg === 'sumi' ? '#e8ecf2' : '#131820'}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            </Row>
          </Group>

          <Group title="読む速さ">
            <Row
              label="読み上げ速度"
              htmlFor="set-cpm"
              note="1分あたりに送る文字量です。全角1字を2、半角1字を1として数えます。"
            >
              <div className="flex items-center gap-3">
                <input
                  id="set-cpm"
                  type="range"
                  min={300}
                  max={4000}
                  step={50}
                  value={settings.cpm}
                  onChange={(e) => onChange({ cpm: Number(e.target.value) })}
                  className="w-full cursor-pointer"
                  style={{ accentColor: 'var(--kg-mark)' }}
                />
                {/* スライダーだけだと 300-4000 の範囲を細かく合わせられないので、
                    数値でも直接入れられるようにする。 */}
                <span className="flex shrink-0 items-center gap-1">
                  <input
                    type="number"
                    min={300}
                    max={4000}
                    step={50}
                    value={settings.cpm}
                    aria-label="読み上げ速度（1分あたりの文字量）"
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      if (Number.isFinite(v)) onChange({ cpm: Math.min(4000, Math.max(300, v)) })
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
            <Slider
              label="戻ったときの間"
              value={settings.reviewStrength}
              display={
                settings.reviewStrength === 0
                  ? 'なし'
                  : `${(1 + 2 * settings.reviewStrength).toFixed(1)} 倍`
              }
              min={0}
              max={2}
              step={0.25}
              onChange={(reviewStrength) => onChange({ reviewStrength })}
              note="前のカードへ戻ったとき、そのカードを長めに表示します。自動再生は止まりません。"
            />
          </Group>

          <Group title="読み終わりと集中">
            <div className="kg-switch-row">
              <Switch
                label="文を読み終えたら文全体を表示する"
                controlFirst={false}
                checked={settings.summaryOn}
                onCheckedChange={(summaryOn: boolean) => onChange({ summaryOn })}
              />
            </div>
            <Slider
              label="文全体の表示時間"
              value={settings.summaryRatio}
              display={`${Math.round(settings.summaryRatio * 100)} %`}
              min={0.1}
              max={1.2}
              step={0.05}
              disabled={!settings.summaryOn}
              onChange={(summaryRatio) => onChange({ summaryRatio })}
              note="その文を読む時間に対する割合です。長い文ほど表示時間も長くなります。"
            />
            <div className="kg-switch-row">
              <Switch
                label="周辺を暗くする"
                controlFirst={false}
                checked={settings.dimSurround}
                onCheckedChange={(dimSurround: boolean) => onChange({ dimSurround })}
              />
            </div>
          </Group>

          <div className="flex justify-end border-t pt-4" style={{ borderColor: 'var(--kg-hair)' }}>
            <Button variant="secondary" onClick={() => onChange(DEFAULTS)}>
              初期値に戻す
            </Button>
          </div>
        </div>
      </aside>
    </>
  )
}
