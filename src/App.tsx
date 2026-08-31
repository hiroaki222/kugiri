import { useEffect, useState } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { HelpDialog } from '@/components/HelpDialog'
import { InputPane } from '@/components/InputPane'
import { ReadingView } from '@/components/ReadingView'
import { SettingsDrawer } from '@/components/SettingsDrawer'
import { useDeck } from '@/hooks/useDeck'
import { usePlayback } from '@/hooks/usePlayback'
import { useReadingHotkeys } from '@/hooks/useReadingHotkeys'
import { useSettings } from '@/hooks/useSettings'
import { t } from '@/i18n'
import { clampCpm } from '@/lib/settings'

const CPM_KEY_STEP = 100

export default function App() {
  const { settings, patch } = useSettings()
  const [raw, setRaw] = useState('')
  // The pasted text decides whether this is wanted, so it does not carry over.
  const [unwrap, setUnwrap] = useState(false)
  const [view, setView] = useState<'compose' | 'read'>('compose')
  const [panel, setPanel] = useState(false)
  const [help, setHelp] = useState(false)
  const [container, setContainer] = useState<HTMLElement | null>(null)

  const { state, setAnchor } = useDeck(view === 'read' ? raw : '', settings, container, unwrap)
  const playback = usePlayback(state, settings, setAnchor)
  const { setSuspended } = playback

  useEffect(() => {
    setSuspended(panel)
  }, [panel, setSuspended])

  useReadingHotkeys(view === 'read' && !panel && !help, {
    playback,
    onSpeedStep: (d) => patch({ cpm: clampCpm(settings.cpm + d * CPM_KEY_STEP) }),
    onHelp: () => setHelp(true),
    onSettings: () => setPanel((v) => !v),
  })

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        onBack={
          view === 'read'
            ? () => {
                playback.dispatch({ type: 'ESCAPE' })
                setView('compose')
              }
            : undefined
        }
        onSettings={() => setPanel(true)}
        onHelp={() => setHelp(true)}
      />

      {view === 'compose' ? (
        <InputPane
          value={raw}
          onChange={setRaw}
          onSample={() => setRaw(t.sample)}
          onRead={() => {
            // Every read starts unstarted, so the same text shows the hint again.
            playback.forgetStart()
            setView('read')
          }}
          unwrap={unwrap}
          onUnwrapChange={setUnwrap}
        />
      ) : (
        <ReadingView
          state={state}
          playback={playback}
          settings={settings}
          onCpm={(cpm) => patch({ cpm })}
          onContainer={setContainer}
        />
      )}

      <SettingsDrawer
        open={panel}
        settings={settings}
        onChange={patch}
        onClose={() => setPanel(false)}
      />
      <HelpDialog open={help} onClose={() => setHelp(false)} />
    </div>
  )
}
