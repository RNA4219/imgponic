import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import KeybindOverlay, { FOCUS_MODE_SHORTCUT, KEYBIND_SHORTCUTS } from './KeybindOverlay'

const renderOverlay = async (open: boolean) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(<KeybindOverlay open={open} onClose={() => {}} />)
  })

  return {
    container,
    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    }
  }
}

describe('KeybindOverlay focus mode shortcut', () => {
  it('includes the focus mode toggle shortcut in KEYBIND_SHORTCUTS', () => {
    expect(KEYBIND_SHORTCUTS).toContainEqual(FOCUS_MODE_SHORTCUT)

    const focusModeEntry = KEYBIND_SHORTCUTS.find(shortcut => shortcut.keys === 'Ctrl/Cmd+Shift+F')
    expect(focusModeEntry).toBeDefined()
    expect(focusModeEntry?.description).toBe('フォーカスモードを切り替え（片側全画面⇔2ペイン）')
  })

  it('renders the focus mode shortcut within the overlay when open', async () => {
    const { container, unmount } = await renderOverlay(true)

    const keyCells = Array.from(container.querySelectorAll('.keybind-overlay__keys')).map(node => node.textContent)
    const descriptionCells = Array.from(container.querySelectorAll('.keybind-overlay__description')).map(
      node => node.textContent
    )

    expect(keyCells).toContain('Ctrl/Cmd+Shift+F')
    expect(descriptionCells).toContain('フォーカスモードを切り替え（片側全画面⇔2ペイン）')

    await unmount()
  })
})
