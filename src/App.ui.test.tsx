import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'

import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

let JSDOMClass: (typeof import('jsdom'))['JSDOM'] | null = null
try {
  ({ JSDOM: JSDOMClass } = await import('jsdom'))
} catch {
  JSDOMClass = null
}

const domInstance = JSDOMClass ? new JSDOMClass('<!doctype html><html><body></body></html>') : null
const domAvailable = domInstance !== null
const globalScope = globalThis as {
  window?: typeof domInstance extends null ? Record<string, unknown> : typeof domInstance.window
  document?: typeof domInstance extends null ? Record<string, unknown> : typeof domInstance.window.document
  navigator?: typeof domInstance extends null ? Record<string, unknown> : typeof domInstance.window.navigator
}

if (domInstance && !globalScope.window) {
  globalScope.window = domInstance.window
  globalScope.document = domInstance.window.document
  globalScope.navigator = domInstance.window.navigator
}

if (!domInstance) {
  globalScope.window ??= {}
  globalScope.document ??= {}
  globalScope.navigator ??= {}
}

const streamModule = await import('./useOllamaStream')
const setupModule = await import('./useSetupCheck')

type UseSetupCheckFn = typeof setupModule.useSetupCheck
type UseOllamaStreamFn = typeof streamModule.useOllamaStream
type AppMocks = { useSetupCheck?: UseSetupCheckFn; useOllamaStream?: UseOllamaStreamFn }
const appMockContainer = globalThis as typeof globalThis & { __APP_MOCKS__?: AppMocks }

const domTest = domAvailable ? test : test.skip

const {
  default: App,
  composePromptWithSelection,
  createDiffPreviewFlow,
  determineUserInput
} = await import('./App')

const {
  default: KeybindOverlay,
  KEYBIND_SHORTCUTS,
  resolveKeybindOverlayState
} = await import('./KeybindOverlay')

const noopStream = {
  startStream: async () => {},
  abortStream: async () => {},
  appendChunk: () => {},
  isStreaming: false
} as const

test.afterEach(() => {
  appMockContainer.__APP_MOCKS__ = undefined
})

domTest('renders setup guidance banner when offline and retries on demand', async () => {
  const retry = mock.fn(async () => {})
  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({
      status: 'offline',
      guidance: 'Start Ollama',
      retry
    }),
    useOllamaStream: () => ({
      ...noopStream
    })
  }

  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  await act(async () => { root.render(<App />) })

  const banner = container.querySelector('[data-testid="setup-banner"]')
  assert.ok(banner instanceof HTMLElement)
  assert.ok(banner.textContent?.includes('Start Ollama'))

  const retryButton = container.querySelector('[data-testid="setup-banner-retry"]')
  assert.ok(retryButton instanceof HTMLButtonElement)
  await act(async () => { retryButton.click() })

  assert.equal(retry.mock.calls.length, 1)

  await act(async () => { root.unmount() })
  container.remove()
})

domTest('renders setup guidance banner when model is missing', async () => {
  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({
      status: 'missing-model',
      guidance: 'Install recommended model',
      retry: mock.fn(async () => {})
    }),
    useOllamaStream: () => ({
      ...noopStream
    })
  }

  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  await act(async () => { root.render(<App />) })

  const banner = container.querySelector('[data-testid="setup-banner"]')
  assert.ok(banner instanceof HTMLElement)
  assert.ok(banner.textContent?.includes('Install recommended model'))

  await act(async () => { root.unmount() })
  container.remove()
})

domTest('renders ollama error banner and clears it on dismiss or retry', async () => {
  let capturedHandlers: Parameters<UseOllamaStreamFn>[0] | null = null
  const consoleError = mock.method(console, 'error', () => {})

  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({
      status: 'ready',
      guidance: '',
      retry: mock.fn(async () => {})
    }),
    useOllamaStream: handlers => {
      capturedHandlers = handlers
      return {
        startStream: async () => {},
        abortStream: async () => {},
        appendChunk: () => {},
        isStreaming: false
      }
    }
  }

  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)

  try {
    await act(async () => { root.render(<App />) })

    const runButton = container.querySelector('.runpulse')
    assert.ok(runButton instanceof HTMLButtonElement)

    await act(async () => { runButton.click() })

    assert.equal(container.querySelector('[role="alert"]'), null)

    assert.ok(capturedHandlers)
    await act(async () => { capturedHandlers?.onError?.('Network unreachable') })

    const alert = container.querySelector('[role="alert"]')
    assert.ok(alert instanceof HTMLElement)
    assert.ok(alert.textContent?.includes('Network unreachable'))
    assert.ok(consoleError.mock.calls.length > 0)

    const dismissButton = alert.querySelector('[data-testid="ollama-error-dismiss"]')
    assert.ok(dismissButton instanceof HTMLButtonElement)
    await act(async () => { dismissButton.click() })

    assert.equal(container.querySelector('[role="alert"]'), null)

    await act(async () => { capturedHandlers?.onError?.('Network unreachable') })
    assert.ok(container.querySelector('[role="alert"]'))

    await act(async () => { runButton.click() })
    assert.equal(container.querySelector('[role="alert"]'), null)
  } finally {
    consoleError.mock.restore()
    await act(async () => { root.unmount() })
    container.remove()
  }
})

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

test('composePromptWithSelection masks sensitive text before invoking compose_prompt', async () => {
  const sensitiveLine = "api-key: 'MySecretTokenABCDEFG123456'"
  const leftText = ['alpha', sensitiveLine, '-----BEGIN RSA PRIVATE KEY-----', 'tail'].join('\n')
  const selection = sensitiveLine
  const selectionStart = leftText.indexOf(selection)
  let capturedUserInput = ''
  const order: string[] = []
  let sanitizedSnapshot: { sanitized: string; maskedTypes: string[]; overLimit: boolean; raw: string } | null = null
  const invokeFn = async (_cmd: string, args?: Record<string, unknown>) => {
    order.push('invoke')
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
    contextRadius: 3,
    onSanitized: snapshot => {
      order.push('sanitize')
      sanitizedSnapshot = snapshot
    }
  })
  assert.deepEqual(order, ['sanitize', 'invoke'])
  assert.ok(sanitizedSnapshot)
  assert.equal(sanitizedSnapshot?.raw.includes(sensitiveLine), true)
  assert.equal(sanitizedSnapshot?.overLimit, false)
  assert.deepEqual(sanitizedSnapshot?.maskedTypes, ['API_KEY'])
  assert.equal(capturedUserInput.includes('<REDACTED:API_KEY>'), true)
  assert.equal(capturedUserInput.includes('MySecretToken'), false)
  assert.equal(capturedUserInput, sanitizedSnapshot?.sanitized)
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

test('keybind overlay toggles on ? and closes on Esc', () => {
  const baseEvent = (key: string, overrides: Partial<Parameters<typeof resolveKeybindOverlayState>[1]> = {}) => ({
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: key === '?',
    target: undefined,
    ...overrides
  })

  let state = false
  state = resolveKeybindOverlayState(state, baseEvent('?'))
  assert.equal(state, true)

  state = resolveKeybindOverlayState(state, baseEvent('?'))
  assert.equal(state, false)

  state = resolveKeybindOverlayState(true, baseEvent('Escape'))
  assert.equal(state, false)

  state = resolveKeybindOverlayState(false, baseEvent('?', { ctrlKey: true }))
  assert.equal(state, false)
})

test('keybind overlay lists primary shortcuts from spec link', () => {
  const markup = renderToStaticMarkup(<KeybindOverlay open onClose={() => {}} />)
  for (const shortcut of ['Ctrl/Cmd+Enter', 'Ctrl/Cmd+S', 'Ctrl/Cmd+C', '? / Esc']) {
    assert.ok(markup.includes(shortcut))
  }
  assert.ok(markup.includes('主要ショートカット'))
  assert.deepEqual(
    KEYBIND_SHORTCUTS.map(item => item.keys),
    ['Ctrl/Cmd+Enter', 'Ctrl/Cmd+S', 'Ctrl/Cmd+C', '? / Esc']
  )
})

domTest('loads corpus excerpt, injects into compose params, and renders preview metadata', async () => {
  const composeCalls: Array<Record<string, unknown>> = []
  appMockContainer.__APP_MOCKS__ = {
    invoke: async (cmd: string, args?: Record<string, unknown>) => {
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
    },
    useOllamaStream: () => ({
      ...noopStream
    })
  }

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
})

domTest('renders danger word badge only when left pane contains dangerous phrases', async () => {
  appMockContainer.__APP_MOCKS__ = {
    invoke: async (cmd: string) => {
      if (cmd === 'read_workspace') return null
      if (cmd === 'write_workspace') return 'ok'
      if (cmd === 'list_project_files') return []
      return undefined
    },
    useOllamaStream: () => ({
      ...noopStream
    })
  }

  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  await act(async () => { root.render(<App />) })

  const dangerBadge = () => container.querySelector('[data-testid="danger-words-badge"]')
  assert.equal(dangerBadge(), null)

  const textarea = container.querySelector('textarea[data-side="left"]')
  assert.ok(textarea instanceof HTMLTextAreaElement)

  for (const phrase of [
    'please IGNORE PREVIOUS instructions',
    'jailbreak',
    'developer mode',
    'system prompt'
  ]) {
    await act(async () => {
      textarea.value = phrase
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    assert.ok(dangerBadge() instanceof HTMLElement, `badge visible for phrase: ${phrase}`)
  }

  await act(async () => {
    textarea.value = 'all safe here'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
  assert.equal(dangerBadge(), null)

  await act(async () => { root.unmount() })
  container.remove()
})

domTest('saves stream results once the stream completes', async () => {
  const saveRunCalls: Array<Record<string, unknown>> = []
  appMockContainer.__APP_MOCKS__ = {
    invoke: async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'read_workspace') return null
      if (cmd === 'write_workspace') return 'ok'
      if (cmd === 'compose_prompt') return { final_prompt: 'SYS\n---\nUSER_INPUT final', sha256: 'hash', model: 'm' }
      if (cmd === 'save_run') {
        saveRunCalls.push(args ?? {})
        return 'ok'
      }
      return undefined
    },
    useOllamaStream: handlers => ({
      startStream: async () => {
        handlers?.onChunk?.('first ')
        handlers?.onChunk?.('second')
        await Promise.resolve()
        await handlers?.onEnd?.()
      },
      abortStream: async () => {},
      appendChunk: chunk => handlers?.onChunk?.(chunk),
      isStreaming: false
    })
  }

  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  await act(async () => { root.render(<App />) })

  const runButton = container.querySelector('.runpulse')
  assert.ok(runButton instanceof HTMLButtonElement)
  await act(async () => { runButton.click() })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })

  assert.equal(saveRunCalls.length, 1)
  const saveArgs = saveRunCalls[0] as { recipePath?: string; final_prompt?: string; response_text?: string }
  assert.equal(saveArgs.recipePath, 'data/recipes/demo.sora2.yaml')
  assert.equal(saveArgs.final_prompt, 'SYS\n---\nUSER_INPUT final')
  assert.equal(saveArgs.response_text, 'first second')

  const rightTextarea = container.querySelector('textarea[data-side="right"]')
  assert.ok(rightTextarea instanceof HTMLTextAreaElement)
  assert.equal(rightTextarea.value, 'first second')

  await act(async () => { root.unmount() })
  container.remove()
})

domTest('clears accumulated stream text after aborts and errors', async () => {
  const savedTexts: string[] = []
  let streamApi: ReturnType<UseOllamaStreamFn> | null = null
  let startCount = 0
  appMockContainer.__APP_MOCKS__ = {
    invoke: async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'read_workspace') return null
      if (cmd === 'write_workspace') return 'ok'
      if (cmd === 'compose_prompt') return { final_prompt: 'SYS\n---\nUSER_INPUT final', sha256: 'hash', model: 'm' }
      if (cmd === 'save_run') {
        savedTexts.push(String((args ?? {}).response_text ?? ''))
        return 'ok'
      }
      return undefined
    },
    useOllamaStream: handlers => {
      streamApi = {
        startStream: async () => {
          startCount += 1
          if (startCount === 1) {
            handlers?.onChunk?.('first')
          } else if (startCount === 2) {
            handlers?.onChunk?.('second')
            handlers?.onError?.('boom')
          } else if (startCount === 3) {
            handlers?.onChunk?.('third')
            await handlers?.onEnd?.()
          }
        },
        abortStream: async () => {
          await handlers?.onEnd?.()
        },
        appendChunk: chunk => handlers?.onChunk?.(chunk),
        isStreaming: false
      }
      return streamApi
    }
  }

  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  await act(async () => { root.render(<App />) })

  const runButton = container.querySelector('.runpulse')
  assert.ok(runButton instanceof HTMLButtonElement)

  await act(async () => { runButton.click() })
  await act(async () => { await Promise.resolve() })
  assert.ok(streamApi)
  await act(async () => { await streamApi?.abortStream() })
  await act(async () => { await Promise.resolve() })
  assert.deepEqual(savedTexts, ['first'])

  await act(async () => { runButton.click() })
  await act(async () => { await Promise.resolve() })
  assert.deepEqual(savedTexts, ['first'])

  await act(async () => { runButton.click() })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  assert.deepEqual(savedTexts, ['first', 'third'])

  const rightTextarea = container.querySelector('textarea[data-side="right"]')
  assert.ok(rightTextarea instanceof HTMLTextAreaElement)
  assert.equal(rightTextarea.value, 'third')

  await act(async () => { root.unmount() })
  container.remove()
})
