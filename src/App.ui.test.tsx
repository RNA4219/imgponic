import { JSDOM } from 'jsdom'
import { afterAll, afterEach, expect, test, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const domInstance = new JSDOM('<!DOCTYPE html><html><body></body></html>')

if (!globalThis.window) {
  const { window } = domInstance
  const { document, navigator } = window

  Object.assign(globalThis, { window, document, navigator })
  Object.assign(globalThis, window)

  const constructorKeys: Array<'HTMLElement' | 'HTMLButtonElement' | 'HTMLInputElement' | 'HTMLTextAreaElement'> = [
    'HTMLElement',
    'HTMLButtonElement',
    'HTMLInputElement',
    'HTMLTextAreaElement'
  ]

  for (const key of constructorKeys) {
    const value = window[key]
    if (typeof value === 'function') {
      Object.assign(globalThis, { [key]: value })
    }
  }
}

const streamModule = await import('./useOllamaStream')
const setupModule = await import('./useSetupCheck')

type UseSetupCheckFn = typeof setupModule.useSetupCheck
type UseOllamaStreamFn = typeof streamModule.useOllamaStream
type AppMocks = {
  useSetupCheck?: UseSetupCheckFn
  useOllamaStream?: UseOllamaStreamFn
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
}
const appMockContainer = globalThis as typeof globalThis & { __APP_MOCKS__?: AppMocks }

const domTest = test

const flushEffects = async () => {
  await act(async () => {
    await Promise.resolve()
  })
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

const waitForElement = async <T extends Element>(query: () => T | null, label: string): Promise<T> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const element = query()
    if (element) return element
    await flushEffects()
  }
  throw new Error(`${label} not found`)
}

const getReactProps = (node: Element): Record<string, unknown> | null => {
  const propsKey = Object.keys(node).find(key => key.startsWith('__reactProps$'))
  if (!propsKey) return null
  const record = node as unknown as Record<string, unknown>
  const value = record[propsKey]
  return (value && typeof value === 'object') ? (value as Record<string, unknown>) : null
}

const diffModule = await import('diff')

const {
  default: App,
  composePromptWithSelection,
  createDiffPreviewFlow,
  determineUserInput,
  buildUnifiedDiff
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

afterEach(() => {
  appMockContainer.__APP_MOCKS__ = undefined
})

afterAll(() => {
  domInstance.window.close()
})

domTest('renders setup guidance banner when offline and retries on demand', async () => {
  const retry = vi.fn(async () => {})
  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({
      status: 'offline',
      guidance: 'Start Ollama',
      retry
    }),
    useOllamaStream: () => ({
      ...noopStream
    }),
    invoke: async (cmd: string) => {
      if (cmd === 'read_workspace') return null
      if (cmd === 'write_workspace') return 'ok'
      if (cmd === 'list_project_files') return []
      if (cmd === 'compose_prompt') return { final_prompt: 'SYS\n---\nUSER_INPUT', sha256: 'hash', model: 'm' }
      if (cmd === 'run_ollama_stream') return undefined
      return undefined
    }
  }

  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  await act(async () => { root.render(<App />) })

  const banner = container.querySelector('[data-testid="setup-banner"]')
  expect(banner).toBeInstanceOf(HTMLElement)
  expect(banner?.textContent ?? '').toContain('Start Ollama')

  const retryButton = container.querySelector('[data-testid="setup-banner-retry"]')
  expect(retryButton).toBeInstanceOf(HTMLButtonElement)
  if (!(retryButton instanceof HTMLButtonElement)) throw new Error('Expected retry button')
  await act(async () => { retryButton.click() })

  expect(retry).toHaveBeenCalledTimes(1)

  await act(async () => { root.unmount() })
  container.remove()
})

domTest('renders setup guidance banner when model is missing', async () => {
  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({
      status: 'missing-model',
      guidance: 'Install recommended model',
      retry: vi.fn(async () => {})
    }),
    useOllamaStream: () => ({
      ...noopStream
    }),
    invoke: async (cmd: string) => {
      if (cmd === 'read_workspace') return null
      if (cmd === 'write_workspace') return 'ok'
      if (cmd === 'list_project_files') return []
      if (cmd === 'compose_prompt') return { final_prompt: 'SYS\n---\nUSER_INPUT', sha256: 'hash', model: 'm' }
      if (cmd === 'run_ollama_stream') return undefined
      return undefined
    }
  }

  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  await act(async () => { root.render(<App />) })

  const banner = container.querySelector('[data-testid="setup-banner"]')
  expect(banner).toBeInstanceOf(HTMLElement)
  expect(banner?.textContent ?? '').toContain('Install recommended model')

  await act(async () => { root.unmount() })
  container.remove()
})

domTest('renders ollama error banner and clears it on dismiss or retry', async () => {
  let capturedHandlers: Parameters<UseOllamaStreamFn>[0] | null = null
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const saveRunCalls: Array<Record<string, unknown> | undefined> = []

  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({
      status: 'ready',
      guidance: '',
      retry: vi.fn(async () => {})
    }),
    useOllamaStream: handlers => {
      capturedHandlers = handlers
      return {
        startStream: async () => {},
        abortStream: async () => {},
        appendChunk: () => {},
        isStreaming: false
      }
    },
    invoke: async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'read_workspace') return null
      if (cmd === 'write_workspace') return 'ok'
      if (cmd === 'list_project_files') return []
      if (cmd === 'compose_prompt') return { final_prompt: 'SYS\n---\nUSER_INPUT', sha256: 'hash', model: 'm' }
      if (cmd === 'save_run') {
        saveRunCalls.push(args)
        return undefined
      }
      if (cmd === 'run_ollama_stream') return undefined
      return undefined
    }
  }

  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)

  try {
    await act(async () => { root.render(<App />) })

    const runButton = container.querySelector('.runpulse')
    expect(runButton).toBeInstanceOf(HTMLButtonElement)
    if (!(runButton instanceof HTMLButtonElement)) throw new Error('Expected run button')

    const rightTextarea = await waitForElement(
      () => container.querySelector('textarea[data-side="right"]'),
      'right textarea'
    )

    await act(async () => { runButton.click() })
    await flushEffects()

    expect(rightTextarea.value).toBe('')
    expect(container.querySelector('[role="alert"]')).toBeNull()

    expect(capturedHandlers).toBeTruthy()
    await act(async () => { capturedHandlers?.onChunk?.('Network reachable') })
    await flushEffects()
    expect(rightTextarea.value).toBe('Network reachable')

    await act(async () => {
      await capturedHandlers?.onEnd?.()
    })
    await flushEffects()

    expect(saveRunCalls).toHaveLength(1)
    expect(saveRunCalls[0]).toMatchObject({
      recipePath: 'data/recipes/demo.sora2.yaml',
      final_prompt: 'SYS\n---\nUSER_INPUT',
      response_text: 'Network reachable'
    })
    expect(rightTextarea.value).toBe('Network reachable')

    await act(async () => { runButton.click() })
    await flushEffects()
    expect(rightTextarea.value).toBe('')

    await act(async () => { capturedHandlers?.onError?.('Network unreachable') })
    await flushEffects()

    const alert = container.querySelector('[role="alert"]')
    expect(alert).toBeInstanceOf(HTMLElement)
    if (!(alert instanceof HTMLElement)) throw new Error('Expected alert element')
    expect(alert?.textContent ?? '').toContain('Network unreachable')
    expect(consoleError).toHaveBeenCalled()
    expect(rightTextarea.value).toBe('')

    const dismissButton = alert.querySelector('[data-testid="ollama-error-dismiss"]')
    expect(dismissButton).toBeInstanceOf(HTMLButtonElement)
    if (!(dismissButton instanceof HTMLButtonElement)) throw new Error('Expected dismiss button')
    await act(async () => { dismissButton.click() })
    await flushEffects()

    expect(container.querySelector('[role="alert"]')).toBeNull()

    await act(async () => { capturedHandlers?.onError?.('Network unreachable') })
    await flushEffects()
    expect(container.querySelector('[role="alert"]')).not.toBeNull()

    await act(async () => { runButton.click() })
    await flushEffects()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  } finally {
    consoleError.mockRestore()
    await act(async () => { root.unmount() })
    container.remove()
  }
})

domTest('aborting stream resets ollama error and calls abort once', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const rawAbortStream = vi.fn(async () => {})
  const startStreamImpl = vi.fn(async () => {
    throw new Error('network dropped')
  })
  let capturedHandlers: Parameters<UseOllamaStreamFn>[0] | null = null

  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({
      status: 'ready',
      guidance: '',
      retry: vi.fn(async () => {})
    }),
    useOllamaStream: handlers => {
      capturedHandlers = handlers
      const [streaming, setStreaming] = React.useState(false)
      const startStream = React.useCallback(async () => {
        setStreaming(true)
        await startStreamImpl()
      }, [startStreamImpl])
      const abortStream = React.useCallback(async () => {
        setStreaming(false)
        await rawAbortStream()
      }, [rawAbortStream])
      return {
        startStream,
        abortStream,
        appendChunk: handlers.onChunk ?? (() => {}),
        isStreaming: streaming
      }
    },
    invoke: async (cmd: string) => {
      if (cmd === 'read_workspace') return null
      if (cmd === 'write_workspace') return 'ok'
      if (cmd === 'list_project_files') return []
      if (cmd === 'compose_prompt') return { final_prompt: 'SYS\n---\nUSER_INPUT', sha256: 'hash', model: 'm' }
      if (cmd === 'run_ollama_stream') return undefined
      return undefined
    }
  }

  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)

  try {
    await act(async () => {
      root.render(<App />)
    })

    const runButton = container.querySelector('.runpulse')
    expect(runButton).toBeInstanceOf(HTMLButtonElement)
    if (!(runButton instanceof HTMLButtonElement)) throw new Error('Expected run button')

    const rightTextarea = await waitForElement(
      () => container.querySelector('textarea[data-side="right"]'),
      'right textarea'
    )

    await act(async () => {
      runButton.click()
    })
    await flushEffects()

    expect(startStreamImpl).toHaveBeenCalledTimes(1)

    const errorBannerBefore = container.querySelector('[data-testid="ollama-error-banner"]')
    expect(errorBannerBefore).toBeInstanceOf(HTMLElement)

    await act(async () => {
      capturedHandlers?.onChunk?.('partial output')
    })
    await flushEffects()
    expect(rightTextarea.value).toBe('partial output')

    const stopButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('停止'))
    expect(stopButton).toBeInstanceOf(HTMLButtonElement)
    if (!(stopButton instanceof HTMLButtonElement)) throw new Error('Expected stop button')

    expect(rawAbortStream).not.toHaveBeenCalled()

    await act(async () => {
      stopButton.click()
    })
    await flushEffects()

    expect(rawAbortStream).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-testid="ollama-error-banner"]')).toBeNull()
    expect(rightTextarea.value).toBe('')
  } finally {
    consoleError.mockRestore()
    await act(async () => {
      root.unmount()
    })
    container.remove()
  }
})

test('determineUserInput returns selection context with line range header', () => {
  const leftText = Array.from({ length: 12 }, (_, idx) => `line-${idx + 1}`).join('\n')
  const selection = 'line-6'
  const selectionStart = leftText.indexOf(selection)
  const result = determineUserInput(true, selection, leftText, selectionStart, selectionStart + selection.length, 3)
  expect(result).toMatch(/^\[Lines 6-6]/)
  expect(result).toContain('line-3')
  expect(result).toContain('line-9')
  expect(result).toContain(selection)
})

test('determineUserInput falls back to full text without selection', () => {
  const sample = 'a\nb\nc'
  expect(determineUserInput(false, '', sample, null, null, 3)).toBe(sample)
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
  expect(order).toEqual(['sanitize', 'invoke'])
  expect(sanitizedSnapshot).not.toBeNull()
  const snapshot = sanitizedSnapshot as NonNullable<typeof sanitizedSnapshot>
  expect(snapshot.raw).toContain(sensitiveLine)
  expect(snapshot.overLimit).toBe(false)
  expect(snapshot.maskedTypes).toEqual(['API_KEY'])
  expect(capturedUserInput).toContain('<REDACTED:API_KEY>')
  expect(capturedUserInput).not.toContain('MySecretToken')
  expect(capturedUserInput).toBe(snapshot.sanitized)
  expect(res).toEqual({ final_prompt: 'fp', sha256: 'hash', model: 'model' })
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
  expect(open).toBe(true)
  expect(patches).toHaveLength(1)
  expect(patches[0]).toContain('-left')
  expect(patches[0]).toContain('+right')
  expect(left).toBe('line1\nleft')

  flow.cancel()
  expect(open).toBe(false)
  expect(left).toBe('line1\nleft')

  flow.open()
  flow.confirm()
  expect(open).toBe(false)
  expect(left).toBe(right)
  expect(patches).toHaveLength(2)
})

test('buildUnifiedDiff delegates to diff library for unified patch', () => {
  const sentinel = '--- sentinel diff ---'
  const spy = vi.spyOn(diffModule, 'createTwoFilesPatch').mockReturnValue(sentinel)

  try {
    const result = buildUnifiedDiff('before\nline', 'after\nline')
    expect(result).toBe(sentinel)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('左', '右', 'before\nline', 'after\nline', '', '', { context: 3 })
  } finally {
    spy.mockRestore()
  }
})

test('buildUnifiedDiff returns no-diff message when contents match', () => {
  const spy = vi.spyOn(diffModule, 'createTwoFilesPatch')

  try {
    const result = buildUnifiedDiff('same line', 'same line')
    expect(result).toBe(['--- 左', '+++ 右', '@@', '  (差分はありません)'].join('\n'))
    expect(spy).not.toHaveBeenCalled()
  } finally {
    spy.mockRestore()
  }
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
  expect(state).toBe(true)

  state = resolveKeybindOverlayState(state, baseEvent('?'))
  expect(state).toBe(false)

  state = resolveKeybindOverlayState(true, baseEvent('Escape'))
  expect(state).toBe(false)

  state = resolveKeybindOverlayState(false, baseEvent('?', { ctrlKey: true }))
  expect(state).toBe(false)
})

test('keybind overlay lists primary shortcuts from spec link', () => {
  const markup = renderToStaticMarkup(<KeybindOverlay open onClose={() => {}} />)
  for (const shortcut of ['Ctrl/Cmd+Enter', 'Ctrl/Cmd+S', 'Ctrl/Cmd+C', '? / Esc']) {
    expect(markup).toContain(shortcut)
  }
  expect(markup).toContain('主要ショートカット')
  expect(KEYBIND_SHORTCUTS.map(item => item.keys)).toEqual([
    'Ctrl/Cmd+Enter',
    'Ctrl/Cmd+S',
    'Ctrl/Cmd+C',
    '? / Esc'
  ])
})

domTest('loads corpus excerpt, injects into compose params, and renders preview metadata', async () => {
  const composeCalls: Array<Record<string, unknown>> = []
  const excerptCalls: Array<Record<string, unknown>> = []
  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({ status: 'ready', guidance: '', retry: vi.fn(async () => {}) }),
    invoke: async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'read_workspace') return null
      if (cmd === 'write_workspace') return 'ok'
      if (cmd === 'load_txt_excerpt') {
        expect(args).toBeTruthy()
        excerptCalls.push(args ?? {})
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

  const pathInput = container.querySelector('[data-testid="corpus-path-input"]')
  expect(pathInput).toBeInstanceOf(HTMLInputElement)
  if (!(pathInput instanceof HTMLInputElement)) throw new Error('Expected path input')
  const pathProps = getReactProps(pathInput)
  const handlePathChange = pathProps?.onChange as ((event: unknown) => void) | undefined
  expect(typeof handlePathChange).toBe('function')
  await act(async () => {
    await handlePathChange?.({
      target: { value: 'corpus/story.txt' },
      currentTarget: pathInput
    })
  })
  await flushEffects()
  expect(pathInput.value).toBe('corpus/story.txt')

  const loadButton = container.querySelector('[data-testid="load-excerpt-button"]')
  expect(loadButton).toBeInstanceOf(HTMLButtonElement)
  if (!(loadButton instanceof HTMLButtonElement)) throw new Error('Expected load button')
  loadButton.disabled = false
  loadButton.removeAttribute('disabled')
  const loadButtonProps = getReactProps(loadButton)
  const handleClick = loadButtonProps?.onClick as ((event: unknown) => void) | undefined
  expect(typeof handleClick).toBe('function')
  await act(async () => {
    await handleClick?.({ preventDefault() {}, stopPropagation() {} })
  })
  await flushEffects()
  expect(excerptCalls).toHaveLength(1)

  const preview = await waitForElement(
    () => container.querySelector('[data-testid="excerpt-preview"]') as HTMLElement | null,
    'excerpt preview'
  )
  const previewText = preview.textContent ?? ''
  expect(previewText).toContain('deadbeefcafebabe')
  expect(previewText).toContain('400 / 1200')
  expect(previewText.toLowerCase()).toContain('truncated')

  const runButton = container.querySelector('.runpulse')
  expect(runButton).toBeInstanceOf(HTMLButtonElement)
  if (!(runButton instanceof HTMLButtonElement)) throw new Error('Expected run button')
  await act(async () => { runButton.click() })
  await flushEffects()

  expect(composeCalls).toHaveLength(1)
  const inlineParams = (composeCalls[0].inlineParams ?? {}) as Record<string, unknown>
  expect(inlineParams.doc_excerpt).toBe('頭 75% ... 尾 25%')

  await act(async () => { root.unmount() })
  container.remove()
})

domTest('renders danger word badge only when left pane contains dangerous phrases', async () => {
  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({ status: 'ready', guidance: '', retry: vi.fn(async () => {}) }),
    invoke: async (cmd: string) => {
      if (cmd === 'read_workspace') return null
      if (cmd === 'write_workspace') return 'ok'
      if (cmd === 'list_project_files') return []
      if (cmd === 'compose_prompt') return { final_prompt: 'SYS\n---\nUSER_INPUT', sha256: 'hash', model: 'm' }
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

  const dangerBadge = () => container.querySelector('[data-testid="danger-words-badge"]')
  expect(dangerBadge()).toBeNull()

  const textarea = container.querySelector('textarea[data-side="left"]')
  expect(textarea).toBeInstanceOf(HTMLTextAreaElement)
  if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('Expected textarea')

  for (const phrase of [
    'please IGNORE PREVIOUS instructions',
    'jailbreak',
    'developer mode',
    'system prompt'
  ]) {
    await act(async () => {
      const textProps = getReactProps(textarea)
      const handleChange = textProps?.onChange as ((event: unknown) => void) | undefined
      expect(typeof handleChange).toBe('function')
      await handleChange?.({
        target: { value: phrase },
        currentTarget: textarea
      })
    })
    await flushEffects()
    const badge = await waitForElement(
      () => dangerBadge() as HTMLElement | null,
      'danger words badge'
    )
    expect(badge).toBeInstanceOf(HTMLElement)
  }

  await act(async () => {
    const textProps = getReactProps(textarea)
    const handleChange = textProps?.onChange as ((event: unknown) => void) | undefined
    expect(typeof handleChange).toBe('function')
    await handleChange?.({
      target: { value: 'all safe here' },
      currentTarget: textarea
    })
  })
  await flushEffects()
  expect(dangerBadge()).toBeNull()

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
  await flushEffects()

  const rightTextarea = container.querySelector('textarea[data-side="right"]')
  assert.ok(rightTextarea instanceof HTMLTextAreaElement)
  assert.equal(rightTextarea.value, '')

  await act(async () => { runButton.click() })
  await act(async () => { await Promise.resolve() })
  assert.deepEqual(savedTexts, ['first'])
  await flushEffects()

  const afterErrorTextarea = container.querySelector('textarea[data-side="right"]')
  assert.ok(afterErrorTextarea instanceof HTMLTextAreaElement)
  assert.equal(afterErrorTextarea.value, '')

  await act(async () => { runButton.click() })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  assert.deepEqual(savedTexts, ['first', 'third'])

  const finalTextarea = container.querySelector('textarea[data-side="right"]')
  assert.ok(finalTextarea instanceof HTMLTextAreaElement)
  assert.equal(finalTextarea.value, 'third')

  await act(async () => { root.unmount() })
  container.remove()
})
