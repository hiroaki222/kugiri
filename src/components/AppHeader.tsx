import { Button, Text } from '@cloudflare/kumo'
import { ArrowUUpLeftIcon, GearIcon, QuestionIcon } from '@phosphor-icons/react'
import { t } from '@/i18n'

type Props = {
  /** Only shown while reading; there is nothing to go back to on the paste screen. */
  onBack?: () => void
  onSettings: () => void
  onHelp: () => void
}

export function AppHeader({ onBack, onSettings, onHelp }: Props) {
  return (
    <header
      className="flex flex-none items-center justify-between gap-4 border-b px-5 py-2.5"
      style={{ background: 'var(--kg-panel)', borderColor: 'var(--kg-hair)' }}
    >
      <div className="flex items-baseline gap-2">
        <Text variant="heading">{t.app.name}</Text>
        <span
          className="text-[10.5px] uppercase tracking-[0.14em]"
          style={{ color: 'var(--kg-muted)' }}
        >
          {t.app.reading}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {onBack && (
          <Button
            variant="ghost"
            shape="square"
            icon={ArrowUUpLeftIcon}
            aria-label={t.app.backToInput}
            onClick={onBack}
          />
        )}
        <Button
          variant="ghost"
          shape="square"
          icon={GearIcon}
          aria-label={t.app.settings}
          onClick={onSettings}
        />
        <Button
          variant="ghost"
          shape="square"
          icon={QuestionIcon}
          aria-label={t.app.help}
          onClick={onHelp}
        />
      </div>
    </header>
  )
}
