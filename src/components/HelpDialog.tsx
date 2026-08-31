import { Button, Dialog, Text } from '@cloudflare/kumo'
import { XIcon } from '@phosphor-icons/react'
import { t } from '@/i18n'

const Key = ({ children }: { children: React.ReactNode }) => (
  <kbd
    className="mr-1 rounded border border-b-2 px-1.5 py-0.5 text-[11px]"
    style={{ borderColor: 'var(--kg-hair)', background: 'var(--kg-paper)' }}
  >
    {children}
  </kbd>
)

const NONE = <>—</>

/** Key glyphs are structure, not copy, so only the descriptions are localised. */
const ROWS: [React.ReactNode, React.ReactNode, string][] = [
  [<><Key>h</Key><Key>l</Key></>, <><Key>←</Key><Key>→</Key></>, t.help.cardStep],
  [<><Key>k</Key><Key>j</Key></>, <><Key>↑</Key><Key>↓</Key></>, t.help.sentenceStep],
  [<><Key>{'{'}</Key><Key>{'}'}</Key></>, NONE, t.help.paragraphStep],
  [<><Key>g</Key><Key>g</Key></>, <Key>G</Key>, t.help.edges],
  [<Key>Space</Key>, NONE, t.help.play],
  [<><Key>&lt;</Key><Key>&gt;</Key></>, NONE, t.help.speed],
  [<Key>K</Key>, NONE, t.help.context],
  [<><Key>Shift</Key><Key>←</Key><Key>→</Key></>, NONE, t.help.scroll],
  [<Key>?</Key>, <Key>,</Key>, t.help.panels],
  [<Key>Esc</Key>, NONE, t.help.escape],
]

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <Dialog size="xl" className="p-0" data-hotkeys-off>
        <div
          className="flex items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: 'var(--kg-hair)' }}
        >
          <Text variant="heading">{t.help.title}</Text>
          <Button
            variant="ghost"
            shape="square"
            icon={XIcon}
            aria-label={t.app.close}
            onClick={onClose}
          />
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-2">
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              {ROWS.map(([vim, alt, desc], i) => {
                // No rule on the first row: the dialog header already draws one.
                const rule = i === 0 ? {} : { borderTopWidth: 1, borderColor: 'var(--kg-hair)' }
                return (
                  <tr key={i}>
                    <td className="w-[150px] whitespace-nowrap py-2 align-top" style={rule}>
                      {vim}
                    </td>
                    <td className="w-[86px] whitespace-nowrap py-2 align-top" style={rule}>
                      {alt}
                    </td>
                    <td
                      className="kg-jp-text py-2 align-top"
                      style={{ ...rule, color: 'var(--kg-muted)' }}
                    >
                      {desc}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div
          className="border-t px-5 py-3 text-[11.5px] leading-relaxed"
          style={{ borderColor: 'var(--kg-hair)', color: 'var(--kg-muted)' }}
        >
          {t.help.footnote}
        </div>
      </Dialog>
    </Dialog.Root>
  )
}
