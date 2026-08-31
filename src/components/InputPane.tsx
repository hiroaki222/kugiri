import { Banner, Button, Field, InputArea, Switch } from '@cloudflare/kumo'

const RAW_LIMIT = 100_000

type Props = {
  value: string
  onChange: (v: string) => void
  onRead: () => void
  onSample: () => void
  /** 貼り付けたテキストの性質に関する設定なので、読書中の設定ではなくここに置く。 */
  fixPdfWrap: boolean
  onFixPdfWrapChange: (v: boolean) => void
}

export function InputPane({ value, onChange, onRead, onSample, fixPdfWrap, onFixPdfWrapChange }: Props) {
  const len = value.trim().length
  const tooLong = len > RAW_LIMIT

  return (
    <main className="grid flex-1 place-items-center px-5 py-9">
      <div className="grid w-full max-w-[720px] gap-4">
        <h1 className="m-0 text-[clamp(21px,3.4vw,27px)] font-bold leading-snug text-balance">
          読みたい文章を貼ると、<em className="not-italic" style={{ color: 'var(--kg-mark)' }}>一目で読める大きさ</em>に区切ります
        </h1>
        <p className="m-0 text-sm leading-loose" style={{ color: 'var(--kg-muted)' }}>
          日本語と英語に対応。本文はこの端末の中だけで処理され、どこへも送信されません。
        </p>
        {tooLong && (
          <Banner
            variant="alert"
            title="長すぎます"
            description={`${RAW_LIMIT.toLocaleString()} 字までにしてください。分けて読むと快適です。`}
          />
        )}
        <Field label="本文" hideLabel>
          <InputArea
            value={value}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
            placeholder="ここに貼り付け"
            spellCheck={false}
            className="min-h-[230px] w-full"
          />
        </Field>
        <div
          className="rounded-md border px-4 py-3"
          style={{ borderColor: 'var(--kg-hair)', background: 'var(--kg-panel)' }}
        >
          <div className="kg-switch-row">
            <Switch
              label="PDF の改行を取り除く"
              controlFirst={false}
              checked={fixPdfWrap}
              onCheckedChange={onFixPdfWrapChange}
            />
          </div>
          <p
            className="kg-jp-text m-0 mt-1.5 text-[11.5px] leading-relaxed"
            style={{ color: 'var(--kg-muted)' }}
          >
            PDF などで文の途中に入ってしまう改行を取り除きます。詩や箇条書きでは
            行の区切りが失われるため、必要なときだけオンにしてください。
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <span
            className="mr-auto text-[11px] tabular-nums"
            style={{ color: 'var(--kg-muted)' }}
          >
            {len.toLocaleString()} 字
          </span>
          <Button variant="secondary" onClick={onSample}>
            サンプルを入れる
          </Button>
          <Button variant="primary" onClick={onRead} disabled={len === 0 || tooLong}>
            読む
          </Button>
        </div>
      </div>
    </main>
  )
}
