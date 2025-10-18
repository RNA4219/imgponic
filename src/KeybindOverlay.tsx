import React, { useEffect, useRef } from 'react'

export type KeyboardLikeEvent = Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'> & {
  target?: EventTarget | null
}

export const resolveKeybindOverlayState = (current: boolean, event: KeyboardLikeEvent): boolean => {
  if (event.key === 'Escape') return false
  if (event.key === '?' && !event.altKey && !event.ctrlKey && !event.metaKey) return !current
  return current
}

export type KeybindShortcut = { keys: string; description: string }

export const KEYBIND_SHORTCUTS: KeybindShortcut[] = [
  { keys: 'Ctrl/Cmd+Enter', description: 'LLM実行（左入力を整形）' },
  { keys: 'Ctrl/Cmd+S', description: '左ペインのテキストを project/ に保存' },
  { keys: 'Ctrl/Cmd+C', description: '右ペインの生成結果をコピー' },
  { keys: '? / Esc', description: 'ショートカット早見表の表示／閉じる' }
]

type KeybindOverlayProps = { open: boolean; onClose: () => void }

const KeybindOverlay: React.FC<KeybindOverlayProps> = ({ open, onClose }) => {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="keybind-overlay" role="presentation">
      <div className="keybind-overlay__backdrop" aria-hidden="true" onClick={onClose} />
      <div
        className="keybind-overlay__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="keybind-overlay-title"
        tabIndex={-1}
      >
        <header className="keybind-overlay__header">
          <h2 id="keybind-overlay-title">ショートカット早見表</h2>
          <p className="keybind-overlay__link">
            <a href="./PromptForge_仕様書_v0.3_目次付き.md#ショートカット" target="_blank" rel="noreferrer">
              仕様書: 主要ショートカット
            </a>
          </p>
        </header>
        <ul className="keybind-overlay__list">
          {KEYBIND_SHORTCUTS.map(shortcut => (
            <li key={shortcut.keys} className="keybind-overlay__item">
              <span className="keybind-overlay__keys">{shortcut.keys}</span>
              <span className="keybind-overlay__description">{shortcut.description}</span>
            </li>
          ))}
        </ul>
        <div className="keybind-overlay__footer">
          <button ref={closeButtonRef} type="button" className="btn" onClick={onClose} aria-label="ショートカット早見表を閉じる">
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}

export default KeybindOverlay
