import { Banner, Button, Field, InputArea, Switch } from '@cloudflare/kumo'
import { t } from '@/i18n'

/** Rejected before anything is processed, so a huge paste cannot freeze the tab. */
const RAW_LIMIT = 100_000

type Props = {
  value: string
  onChange: (v: string) => void
  onRead: () => void
  onSample: () => void
  /** Belongs to the text being pasted rather than to how it is read, so it
   *  lives here instead of in the settings drawer. */
  unwrap: boolean
  onUnwrapChange: (v: boolean) => void
}

export function InputPane({ value, onChange, onRead, onSample, unwrap, onUnwrapChange }: Props) {
  const length = value.trim().length
  const tooLong = length > RAW_LIMIT

  return (
    <main className="grid flex-1 place-items-center px-5 py-9">
      <div className="grid w-full max-w-[720px] gap-4">
        <h1 className="m-0 text-[clamp(21px,3.4vw,27px)] font-bold leading-snug text-balance">
          {t.compose.headlineBefore}
          <em className="not-italic" style={{ color: 'var(--kg-mark)' }}>
            {t.compose.headlineAccent}
          </em>
          {t.compose.headlineAfter}
        </h1>
        <p className="m-0 text-sm leading-loose" style={{ color: 'var(--kg-muted)' }}>
          {t.compose.lede}
        </p>
        {tooLong && (
          <Banner
            variant="alert"
            title={t.compose.tooLongTitle}
            description={t.compose.tooLong(RAW_LIMIT)}
          />
        )}
        <Field label={t.compose.bodyLabel} hideLabel>
          <InputArea
            value={value}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
            placeholder={t.compose.placeholder}
            spellCheck={false}
            className="min-h-[230px] w-full"
          />
        </Field>
        <div className="kg-tip">
          <Switch
            label={t.compose.unwrap}
            labelTooltip={t.compose.unwrapHelp}
            controlFirst={false}
            checked={unwrap}
            onCheckedChange={onUnwrapChange}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <span className="mr-auto text-[11px] tabular-nums" style={{ color: 'var(--kg-muted)' }}>
            {t.compose.charCount(length)}
          </span>
          <Button variant="secondary" onClick={onSample}>
            {t.compose.sample}
          </Button>
          <Button variant="primary" onClick={onRead} disabled={length === 0 || tooLong}>
            {t.compose.read}
          </Button>
        </div>
      </div>
    </main>
  )
}
