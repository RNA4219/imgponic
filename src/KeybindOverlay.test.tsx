import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

import KeybindOverlay, { KEYBIND_SHORTCUTS } from './KeybindOverlay'

describe('KeybindOverlay shortcuts', () => {
  const focusModeShortcut = {
    keys: 'Ctrl/Cmd+Shift+F',
    description: 'フォーカスモードを切り替え（片側全画面⇔2ペイン）'
  }

  it('defines the focus mode toggle shortcut in KEYBIND_SHORTCUTS', () => {
    expect(KEYBIND_SHORTCUTS).toContainEqual(focusModeShortcut)
  })

  it('renders the focus mode toggle shortcut when open', () => {
    const html = renderToStaticMarkup(<KeybindOverlay open onClose={() => {}} />)

    expect(html).toContain(focusModeShortcut.keys)
    expect(html).toContain(focusModeShortcut.description)
  })
})
