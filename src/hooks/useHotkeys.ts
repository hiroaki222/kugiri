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

/** タグの列挙だけでは漏れる。Kumo/Base UI が生成する role も除外する。 */
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
      // IME 変換中は無視。修飾キー併用は素通し。
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as Element | null
      const k = e.key
      const blocked = t?.closest?.(INTERACTIVE)
      if (blocked) {
        // data-hotkeys-off は「矢印キーなどを本来の用途に渡す」ためのもので、
        // 再生の切り替えまで殺す必要はない。文脈オーバーレイや長いカードを
        // クリックしたあと Space が効かなくなるのを防ぐ。
        // 文字を入力する要素では Space は本来の意味を持つので除外する。
        const typing = blocked.matches('input, textarea, select, [contenteditable]')
        if (!typing && (k === ' ' || e.code === 'Space')) {
          e.preventDefault()
          ref.current.togglePlay()
        }
        return
      }
      const H = ref.current

      // K は Shift+k なので、小文字の処理より先に判定する
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

      // scroll カードの横スクロールは Shift+←/→。← → 単体は常にカード移動。
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
    // K を押したままフォーカスを失うと keyup が来ない
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
