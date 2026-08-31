import { useCallback, useEffect, useState } from 'react'
import { DARK_BACKGROUNDS, loadSettings, saveSettings, type Settings } from '@/lib/settings'

/** Owns the persisted settings and keeps the document in sync with the colour
 *  choice, which is the one setting that has to reach outside React. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    const el = document.documentElement
    el.dataset.bg = settings.bg
    // Kumo resolves its colours with light-dark(), and the mode comes from
    // data-mode. Overriding our own tokens alone leaves Kumo's components light,
    // so their text disappears into a dark background.
    const dark = DARK_BACKGROUNDS.includes(settings.bg)
    el.dataset.mode = dark ? 'dark' : 'light'
    el.style.colorScheme = dark ? 'dark' : 'light'
  }, [settings.bg])

  const patch = useCallback((p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p })), [])

  return { settings, patch }
}
