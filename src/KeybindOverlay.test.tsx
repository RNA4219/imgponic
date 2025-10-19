import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'

import KeybindOverlay, { KEYBIND_SHORTCUTS } from './KeybindOverlay'

test('KEYBIND_SHORTCUTS にフォーカスモード切替ショートカットが含まれる', () => {
  const entry = KEYBIND_SHORTCUTS.find(shortcut => shortcut.keys === 'Ctrl/Cmd+Shift+F')
  expect(entry).toBeTruthy()
  expect(entry?.description).toBe('フォーカスモードを切り替え（片側全画面⇔2ペイン）')
})

test('KeybindOverlay がフォーカスモード切替ショートカットを表示する', () => {
  const markup = renderToStaticMarkup(<KeybindOverlay open onClose={() => {}} />)
  expect(markup).toContain('Ctrl/Cmd+Shift+F')
  expect(markup).toContain('フォーカスモードを切り替え（片側全画面⇔2ペイン）')
})
