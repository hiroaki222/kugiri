import { useEffect } from 'react'

/** Short enough that a paste starts loading almost at once, long enough that
 *  typing does not restart the request on every keystroke. */
const SETTLE_MS = 150

/**
 * The typeface ships as unicode-range subsets, so a fresh document needs around
 * thirty requests before anything can be measured, and resolveMetrics waits for
 * all of them. Starting them while the text is still in the paste box moves
 * that wait off the transition: measured over a 60ms link, opening a document
 * went from 1.4s to 60ms once the subsets were already in flight.
 *
 * Nothing depends on the result. If it has not finished by the time the reader
 * presses the button, resolveMetrics waits for the rest exactly as before.
 */
export function useFontPrefetch(text: string, sizePx: number, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !text.trim()) return
    const id = setTimeout(() => {
      document.fonts.load(`400 ${sizePx}px "Noto Sans JP"`, text).catch(() => {})
    }, SETTLE_MS)
    return () => clearTimeout(id)
  }, [text, sizePx, enabled])
}
