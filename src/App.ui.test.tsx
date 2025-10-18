import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import * as tauriModule from '@tauri-apps/api/tauri'

import App, { composePromptWithSelection, createDiffPreviewFlow, determineUserInput } from './App'
import * as streamModule from './useOllamaStream'

test('determineUserInput returns selection context with line range header', () => {
  const leftText = Array.from({ length: 12 }, (_, idx) => `line-${idx + 1}`).join('\n')
  const selection = 'line-6'
  const selectionStart = leftText.indexOf(selection)
  const result = determineUserInput(true, selection, leftText, selectionStart, selectionStart + selection.length, 3)
  assert.ok(result.startsWith('[Lines 6-6]'))
  assert.ok(result.includes('line-3') && result.includes('line-9') && result.includes(selection))
})

test('determineUserInput falls back to full text without selection', () => {
  const sample = 'a\nb\nc'
  assert.equal(determineUserInput(false, '', sample, null, null, 3), sample)
})

test('composePromptWithSelection forwards enriched selection preview', async () => {
  const leftText = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'].join('\n')
  const selection = 'gamma'
  const selectionStart = leftText.indexOf(selection)
  let capturedUserInput = ''
  const invokeFn = async (_cmd: string, args?: Record<string, unknown>) => {
    capturedUserInput = String((args?.inlineParams as { user_input: string }).user_input)
    return { final_prompt: 'fp', sha256: 'hash', model: 'model' }
  }
  const res = await composePromptWithSelection({
    invokeFn,
    params: {},
    recipePath: 'recipe.yaml',
    leftText,
    sendSelectionOnly: true,
    selection,
    selectionStart,
    selectionEnd: selectionStart + selection.length,
    contextRadius: 3
  })
  const expected = determineUserInput(true, selection, leftText, selectionStart, selectionStart + selection.length, 3)
  assert.equal(capturedUserInput, expected)
  assert.deepEqual(res, { final_prompt: 'fp', sha256: 'hash', model: 'model' })
})

test('diff preview requires approval before applying', () => {
  let left = 'line1\nleft'
  const right = 'line1\nright'
  const patches: string[] = []
  let open = false

  const flow = createDiffPreviewFlow({
    readLeft: () => left,
    readRight: () => right,
    show: patch => {
      open = true
      patches.push(patch)
    },
    apply: next => {
      left = next
    },
    close: () => {
      open = false
    }
  })

  flow.open()
  assert.equal(open, true)
  assert.equal(patches.length, 1)
  assert.ok(patches[0].includes('-left') && patches[0].includes('+right'))
  assert.equal(left, 'line1\nleft')

  flow.cancel()
  assert.equal(open, false)
  assert.equal(left, 'line1\nleft')

  flow.open()
  flow.confirm()
  assert.equal(open, false)
  assert.equal(left, right)
  assert.equal(patches.length, 2)
})

test('high contrast toggle updates body class, persists, and restores on mount', async () => {
  const key = 'accessibility:highContrast'
  localStorage.removeItem(key)
  document.body.classList.remove('high-contrast')

  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  await act(async () => { root.render(<App />) })

  const toggle = container.querySelector('[data-testid="high-contrast-toggle"]')
  assert.ok(toggle instanceof HTMLButtonElement)
  await act(async () => { toggle.click() })

  assert.equal(document.body.classList.contains('high-contrast'), true)
  assert.equal(localStorage.getItem(key), '1')

  await act(async () => { root.unmount() })
  const rerenderContainer = document.body.appendChild(document.createElement('div'))
  const rerenderRoot = createRoot(rerenderContainer)
  await act(async () => { rerenderRoot.render(<App />) })
  assert.equal(document.body.classList.contains('high-contrast'), true)

  await act(async () => { rerenderRoot.unmount() })
  container.remove()
  rerenderContainer.remove()
  localStorage.removeItem(key)
  document.body.classList.remove('high-contrast')
})

test('loads corpus excerpt, injects into compose params, and renders preview metadata', async () => {
  const composeCalls: Array<Record<string, unknown>> = []
  const invokeMock = mock.method(tauriModule, 'invoke', async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === 'read_workspace') return null
    if (cmd === 'write_workspace') return 'ok'
    if (cmd === 'load_txt_excerpt') {
      assert.ok(args)
      return {
        path: String(args?.path ?? ''),
        excerpt: '頭 75% ... 尾 25%',
        sha256: 'deadbeefcafebabe',
        truncated: true,
        size_bytes: 1200,
        used_bytes: 400
      }
    }
    if (cmd === 'compose_prompt') {
      composeCalls.push(args ?? {})
      return { final_prompt: 'prompt', sha256: 'hash', model: 'm' }
    }
    if (cmd === 'run_ollama_stream') return undefined
    return undefined
  })
  const streamMock = mock.method(streamModule, 'useOllamaStream', () => ({
    startStream: async () => {},
    abortStream: async () => {},
    appendChunk: () => {},
    isStreaming: false
  }))

  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  await act(async () => { root.render(<App />) })

  const pathInput = container.querySelector('[data-testid="corpus-path-input"]')
  assert.ok(pathInput instanceof HTMLInputElement)
  await act(async () => {
    pathInput.value = 'corpus/story.txt'
    pathInput.dispatchEvent(new Event('input', { bubbles: true }))
  })

  const loadButton = container.querySelector('[data-testid="load-excerpt-button"]')
  assert.ok(loadButton instanceof HTMLButtonElement)
  await act(async () => { loadButton.click() })
  await act(async () => { await Promise.resolve() })

  const preview = container.querySelector('[data-testid="excerpt-preview"]')
  assert.ok(preview instanceof HTMLElement)
  const previewText = preview.textContent ?? ''
  assert.ok(previewText.includes('deadbeefcafebabe'))
  assert.ok(previewText.includes('400 / 1200'))
  assert.ok(previewText.toLowerCase().includes('truncated'))

  const runButton = container.querySelector('.runpulse')
  assert.ok(runButton instanceof HTMLButtonElement)
  await act(async () => { runButton.click() })
  await act(async () => { await Promise.resolve() })

  assert.equal(composeCalls.length, 1)
  const inlineParams = (composeCalls[0].inlineParams ?? {}) as Record<string, unknown>
  assert.equal(inlineParams.doc_excerpt, '頭 75% ... 尾 25%')

  await act(async () => { root.unmount() })
  container.remove()
  invokeMock.restore()
  streamMock.restore()
})
