import { useEffect, useRef } from 'react'

export type HotkeyHandlers = {
  cardStep: (d: -1 | 1) => void
  sentenceStep: (d: -1 | 1) => void
  paragraphStep: (d: -1 | 1) => void
  toEdge: (d: -1 | 1) => void
  speedStep: (d: -1 | 1) => void
  togglePlay: () => void
  contextDown: () => void
  contextUp: () => void
  escape: () => void
  holdStart: () => void
  holdEnd: () => void
  help: () => void
  settings: () => void
}

/** Listing tags misses things, so the roles Kumo and Base UI generate are
 *  excluded too. */
const INTERACTIVE =
  'input, textarea, select, button, [contenteditable], [role="slider"], [role="listbox"], [role="menu"], [role="dialog"], [data-hotkeys-off]'

export function useHotkeys(enabled: boolean, h: HotkeyHandlers) {
  const ref = useRef(h)
  ref.current = h

  useEffect(() => {
    if (!enabled) return
    let gPending = false
    let gTimer: ReturnType<typeof setTimeout> | undefined
    let holding = false

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore keys during IME composition; let modified keys through.
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as Element | null
      const k = e.key
      const blocked = t?.closest?.(INTERACTIVE)
      if (blocked) {
        // data-hotkeys-off exists to hand the arrow keys to whatever owns them,
        // which is no reason to take play/pause away as well: clicking the
        // context overlay or a long card would leave Space dead. Elements you
        // type into are the exception, where Space means a space.
        const typing = blocked.matches('input, textarea, select, [contenteditable]')
        if (!typing && (k === ' ' || e.code === 'Space')) {
          e.preventDefault()
          ref.current.togglePlay()
        }
        return
      }
      const H = ref.current

      // K is Shift+k, so it has to be matched before the lower-case handler.
      if (k === 'K' && e.shiftKey) {
        e.preventDefault()
        H.contextDown()
        return
      }
      if (k === '?') {
        e.preventDefault()
        H.help()
        return
      }
      if (k === ',') {
        e.preventDefault()
        H.settings()
        return
      }
      if (k === 'g' && !e.shiftKey) {
        e.preventDefault()
        if (gPending) {
          clearTimeout(gTimer)
          gPending = false
          H.toEdge(-1)
        } else {
          gPending = true
          gTimer = setTimeout(() => (gPending = false), 600)
        }
        return
      }
      if (gPending) {
        clearTimeout(gTimer)
        gPending = false
      }

      // Shift with an arrow scrolls a card that does not fit. The arrows alone
      // always move between cards, whatever holds focus.
      if (e.shiftKey && (k === 'ArrowLeft' || k === 'ArrowRight')) return

      switch (k) {
        case 'h':
        case 'ArrowLeft':
          e.preventDefault()
          if (e.repeat) {
            if (!holding) {
              holding = true
              H.holdStart()
            }
            H.cardStep(-1)
          } else H.cardStep(-1)
          break
        case 'l':
        case 'ArrowRight':
          e.preventDefault()
          H.cardStep(1)
          break
        case 'k':
        case 'ArrowUp':
          e.preventDefault()
          H.sentenceStep(-1)
          break
        case 'j':
        case 'ArrowDown':
          e.preventDefault()
          H.sentenceStep(1)
          break
        case 'G':
          e.preventDefault()
          H.toEdge(1)
          break
        case '{':
          e.preventDefault()
          H.paragraphStep(-1)
          break
        case '}':
          e.preventDefault()
          H.paragraphStep(1)
          break
        case '<':
          e.preventDefault()
          H.speedStep(-1)
          break
        case '>':
          e.preventDefault()
          H.speedStep(1)
          break
        case ' ':
          e.preventDefault()
          H.togglePlay()
          break
        case 'Escape':
          H.escape()
          break
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      const H = ref.current
      if (e.key === 'K') H.contextUp()
      if ((e.key === 'h' || e.key === 'ArrowLeft') && holding) {
        holding = false
        H.holdEnd()
      }
    }
    // Losing focus while K is held never delivers its keyup.
    const onBlur = () => {
      holding = false
      ref.current.contextUp()
    }

    addEventListener('keydown', onKeyDown)
    addEventListener('keyup', onKeyUp)
    addEventListener('blur', onBlur)
    return () => {
      clearTimeout(gTimer)
      removeEventListener('keydown', onKeyDown)
      removeEventListener('keyup', onKeyUp)
      removeEventListener('blur', onBlur)
    }
  }, [enabled])
}
