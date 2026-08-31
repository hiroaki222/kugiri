import { Button, Dialog, Text } from '@cloudflare/kumo'
import { XIcon } from '@phosphor-icons/react'

const Key = ({ children }: { children: React.ReactNode }) => (
  <kbd
    className="mr-1 rounded border border-b-2 px-1.5 py-0.5 text-[11px]"
    style={{ borderColor: 'var(--kg-hair)', background: 'var(--kg-paper)' }}
  >
    {children}
  </kbd>
)

const ROWS: [React.ReactNode, React.ReactNode, string][] = [
  [<><Key>h</Key><Key>l</Key></>, <><Key>←</Key><Key>→</Key></>, '前／次のカードへ。h は長押しすると、だんだん速く巻き戻ります'],
  [<><Key>k</Key><Key>j</Key></>, <><Key>↑</Key><Key>↓</Key></>, '前／次の文の先頭へ'],
  [<><Key>{'{'}</Key><Key>{'}'}</Key></>, <>—</>, '前／次の段落へ'],
  [<><Key>g</Key><Key>g</Key></>, <Key>G</Key>, '文書の先頭／末尾へ'],
  [<Key>Space</Key>, <>—</>, '再生／停止。停止すると、今の文の全体を表示します'],
  [<><Key>&lt;</Key><Key>&gt;</Key></>, <>—</>, '速度を下げる／上げる（Shift キーを押しながら）'],
  [<Key>K</Key>, <>—</>, '押している間だけ、今の文の全体を表示（Shift + k）'],
  [<><Key>Shift</Key><Key>←</Key><Key>→</Key></>, <>—</>, '長い URL などで横に収まらないカードをスクロール'],
  [<Key>?</Key>, <Key>,</Key>, 'この画面／詳細設定'],
  [<Key>Esc</Key>, <>—</>, '再生を止めて、開いている表示を閉じる'],
]

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <Dialog className="p-0" data-hotkeys-off>
        <div
          className="flex items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: 'var(--kg-hair)' }}
        >
          <Text variant="heading">キー操作</Text>
          <Button variant="ghost" shape="square" icon={XIcon} aria-label="閉じる" onClick={onClose} />
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-2">
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              {ROWS.map(([vim, alt, desc], i) => (
                <tr key={i}>
                  <td className="w-[130px] whitespace-nowrap border-t py-2" style={{ borderColor: 'var(--kg-hair)' }}>{vim}</td>
                  <td className="w-[80px] whitespace-nowrap border-t py-2" style={{ borderColor: 'var(--kg-hair)' }}>{alt}</td>
                  <td className="border-t py-2" style={{ borderColor: 'var(--kg-hair)', color: 'var(--kg-muted)' }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          className="border-t px-5 py-3 text-[11.5px] leading-relaxed"
          style={{ borderColor: 'var(--kg-hair)', color: 'var(--kg-muted)' }}
        >
          自動再生中に前のカードへ戻っても、再生は止まりません。戻ったカードを通常より長く表示したあと、そのまま自動再生を続けます。
        </div>
      </Dialog>
    </Dialog.Root>
  )
}
