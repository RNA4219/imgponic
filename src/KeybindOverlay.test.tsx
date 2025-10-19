import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

import KeybindOverlay, { FOCUS_MODE_SHORTCUT, KEYBIND_SHORTCUTS } from './KeybindOverlay'

describe('KeybindOverlay shortcuts', () => {
  it('defines the focus mode toggle shortcut in KEYBIND_SHORTCUTS', () => {
    expect(KEYBIND_SHORTCUTS).toContainEqual(FOCUS_MODE_SHORTCUT)
  })

  it('renders the focus mode toggle shortcut when open', () => {
    const html = renderToStaticMarkup(<KeybindOverlay open onClose={() => {}} />)

    expect(html).toContain(FOCUS_MODE_SHORTCUT.keys)
    expect(html).toContain(FOCUS_MODE_SHORTCUT.description)
  })
})
