import { strict as assert } from 'node:assert'
import { JSDOM } from 'jsdom'
import { renderToStaticMarkup } from 'react-dom/server'

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

type VitestModule = typeof import('vitest')
type NodeAssertModule = typeof import('node:assert/strict')

type MockRecord = { calls: unknown[][]; results: Array<{ type: 'return' | 'throw'; value: unknown }> }
type MockFunction = ((...args: unknown[]) => unknown) & {
  mock: MockRecord
  mockImplementation(nextImpl: (...args: unknown[]) => unknown): MockFunction
  mockReturnValue(value: unknown): MockFunction
  mockResolvedValue(value: unknown): MockFunction
  mockRejectedValue(reason: unknown): MockFunction
  mockRestore(): void
  mockClear(): MockFunction
}

type MinimalVi = {
  fn(implementation?: (...args: unknown[]) => unknown): MockFunction
  spyOn<T extends object, K extends keyof T>(target: T, property: K): MockFunction
}

const createNodeHarness = (assert: NodeAssertModule): { expect: VitestModule['expect']; vi: MinimalVi } => {
  const createMockFunction = (implementation: (...args: unknown[]) => unknown, restore?: () => void): MockFunction => {
    let currentImpl = implementation
    const mockFn: Partial<MockFunction> = function (this: unknown, ...args: unknown[]) {
      const record = mockFn.mock as MockRecord
      record.calls.push(args)
      try {
        const value = currentImpl.apply(this, args)
        record.results.push({ type: 'return', value })
        return value
      } catch (error) {
        record.results.push({ type: 'throw', value: error })
        throw error
      }
    }
    mockFn.mock = { calls: [], results: [] }
    const setImpl = (nextImpl: (...args: unknown[]) => unknown): MockFunction => {
      currentImpl = nextImpl
      return mockFn as MockFunction
    }
    mockFn.mockImplementation = (nextImpl: (...args: unknown[]) => unknown) => setImpl(nextImpl)
    mockFn.mockReturnValue = (value: unknown) => setImpl(() => value)
    mockFn.mockResolvedValue = (value: unknown) => setImpl(async () => value)
    mockFn.mockRejectedValue = (reason: unknown) =>
      setImpl(async () => {
        throw reason
      })
    mockFn.mockClear = () => {
      mockFn.mock.calls.length = 0
      mockFn.mock.results.length = 0
      return mockFn as MockFunction
    }
    mockFn.mockRestore = () => {
      mockFn.mockClear()
      setImpl(implementation)
      restore?.()
    }
    return mockFn as MockFunction
  }

  const vi: MinimalVi = {
    fn: (implementation?: (...args: unknown[]) => unknown) =>
      createMockFunction(implementation ?? (() => undefined)),
    spyOn: <T extends object, K extends keyof T>(target: T, property: K) => {
      const descriptor = Object.getOwnPropertyDescriptor(target, property)
      if (!descriptor || typeof descriptor.value !== 'function') {
        throw new Error('spyOn only supports existing function properties')
      }
      const original = descriptor.value as (...args: unknown[]) => unknown
      const mockFn = createMockFunction(function (this: unknown, ...args: unknown[]) {
        return original.apply(this, args)
      }, () => {
        Object.defineProperty(target, property, descriptor)
      })
      Object.defineProperty(target, property, {
        ...descriptor,
        value: mockFn
      })
      return mockFn
    }
  }

  const isArray = Array.isArray
  const ensureMock = (value: unknown): MockFunction => {
    if (typeof value !== 'function' || !value || !(value as MockFunction).mock) {
      throw new Error('Expected a mock function')
    }
    return value as MockFunction
  }

  const expectImpl: VitestModule['expect'] = actual => {
    const build = (negate: boolean) => ({
      toBe(expected: unknown) {
        return negate ? assert.notStrictEqual(actual, expected) : assert.strictEqual(actual, expected)
      },
      toEqual(expected: unknown) {
        return negate ? assert.notDeepStrictEqual(actual, expected) : assert.deepStrictEqual(actual, expected)
      },
      toContain(expected: unknown) {
        const result =
          typeof actual === 'string'
            ? actual.includes(String(expected))
            : isArray(actual)
              ? actual.includes(expected)
              : false
        return negate ? assert.ok(!result) : assert.ok(result)
      },
      toMatch(expected: RegExp | string) {
        const pattern = typeof expected === 'string' ? new RegExp(expected) : expected
        const match = pattern.test(String(actual))
        return negate ? assert.ok(!match) : assert.ok(match)
      },
      toBeInstanceOf(expected: new (...args: unknown[]) => unknown) {
        const outcome = actual instanceof expected
        return negate ? assert.ok(!outcome) : assert.ok(outcome)
      },
      toBeNull() {
        return negate ? assert.notStrictEqual(actual, null) : assert.strictEqual(actual, null)
      },
      toBeTruthy() {
        return negate ? assert.ok(!actual) : assert.ok(actual)
      },
      toHaveBeenCalled() {
        const mock = ensureMock(actual)
        const outcome = mock.mock.calls.length > 0
        return negate ? assert.ok(!outcome) : assert.ok(outcome)
      },
      toHaveBeenCalledTimes(expected: number) {
        const mock = ensureMock(actual)
        return negate
          ? assert.notStrictEqual(mock.mock.calls.length, expected)
          : assert.strictEqual(mock.mock.calls.length, expected)
      },
      toHaveLength(expected: number) {
        const length = (actual as { length?: number }).length
        if (typeof length !== 'number') {
          throw new Error('Expected value with a length property')
        }
        return negate ? assert.notStrictEqual(length, expected) : assert.strictEqual(length, expected)
      }
    })

    const matchers = build(false)
    return Object.assign(matchers, { not: build(true) }) as ReturnType<VitestModule['expect']>
  }

  return { expect: expectImpl, vi }
}

let afterAll: VitestModule['afterAll']
let afterEach: VitestModule['afterEach']
let expect: VitestModule['expect']
let test: VitestModule['test']
let vi: VitestModule['vi']

try {
  const vitest = await import('vitest')
  ;({ afterAll, afterEach, expect, test, vi } = vitest)
} catch {
  const nodeTest = await import('node:test')
  const assertModule = await import('node:assert/strict')
  const harness = createNodeHarness(assertModule)
  afterAll = nodeTest.after as VitestModule['afterAll']
  afterEach = nodeTest.afterEach as VitestModule['afterEach']
  test = nodeTest.test as VitestModule['test']
  expect = harness.expect
  vi = harness.vi as unknown as VitestModule['vi']
}

const domInstance = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://example.test' })

if (!globalThis.window) {
  const { window } = domInstance
  const { document, navigator } = window

  Object.assign(globalThis, { window, document, navigator })
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(window))) {
    if (key in globalThis || !descriptor) continue
    Object.defineProperty(globalThis, key, descriptor)
  }

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

const sanitizeModule = await import('./security/sanitizeUserInput')

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

domTest('uses ollama stream hook contract for run and stop controls', async () => {
  const startStream = vi.fn(async () => {})
  const abortStream = vi.fn(async () => {})
  const appendChunk = vi.fn()
  const useOllamaStreamMock = vi.fn(() => ({
    startStream,
    abortStream,
    appendChunk,
    isStreaming: false
  }))

  const invokeMock = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === 'read_workspace') return null
    if (cmd === 'write_workspace') return 'ok'
    if (cmd === 'list_project_files') return []
    if (cmd === 'compose_prompt') {
      void args
      return { final_prompt: 'SYS\n---\nUSER_INPUT', sha256: 'hash', model: 'm' }
    }
    if (cmd === 'run_ollama_stream') return undefined
    if (cmd === 'save_run') return undefined
    return undefined
  })

  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({
      status: 'ready',
      guidance: '',
      retry: vi.fn(async () => {})
    }),
    useOllamaStream: useOllamaStreamMock,
    invoke: invokeMock
  }

  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)

  try {
    await act(async () => {
      root.render(<App />)
    })

    expect(useOllamaStreamMock).toHaveBeenCalledTimes(1)

    const runButton = await waitForElement(
      () =>
        Array.from(container.querySelectorAll('button')).find(button =>
          button.textContent?.includes('▶ 実行')
        ) ?? null,
      'run button'
    )

    await act(async () => {
      runButton.click()
      await Promise.resolve()
    })

    expect(startStream).toHaveBeenCalledTimes(1)
    expect(startStream.mock.calls[0]?.[0]).toMatchObject({ model: 'llama3:8b' })

    const stopButton = await waitForElement(
      () =>
        Array.from(container.querySelectorAll('button')).find(button => button.textContent === '停止') ??
        null,
      'stop button'
    )

    const stopProps = stopButton ? getReactProps(stopButton) : null

    await act(async () => {
      const handler = stopProps?.onClick as
        | ((event: React.MouseEvent<HTMLButtonElement>) => unknown)
        | undefined
      await handler?.({ preventDefault() {} } as React.MouseEvent<HTMLButtonElement>)
    })

    expect(abortStream).toHaveBeenCalledTimes(1)
  } finally {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  }
})

domTest('Ctrl/Cmd+Shift+F toggles focus mode and reset button restores layout', async () => {
  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({
      status: 'ready',
      guidance: '',
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

  try {
    await act(async () => {
      root.render(<App />)
    })

    const split = await waitForElement(() => container.querySelector('.split'), 'split layout')
    expect(split?.classList.contains('focus-left')).toBe(false)
    expect(split?.classList.contains('focus-right')).toBe(false)

    const leftTextarea = await waitForElement(
      () => container.querySelector('textarea[data-side="left"]'),
      'left textarea'
    )

    await act(async () => {
      leftTextarea.focus()
    })

    const dispatchToggle = async () => {
      const event = new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true })
      window.dispatchEvent(event)
      await flushEffects()
    }

    await dispatchToggle()

    expect(split?.classList.contains('focus-left')).toBe(true)
    const rightPanel = container.querySelector('[data-panel="right"]') as HTMLElement | null
    expect(rightPanel?.style.display).toBe('none')

    const resetButton = await waitForElement(
      () => container.querySelector('[data-testid="focus-mode-exit"]') as HTMLButtonElement | null,
      'focus mode exit button'
    )

    await act(async () => {
      resetButton.click()
    })
    await flushEffects()

    expect(split?.classList.contains('focus-left')).toBe(false)
    expect(split?.classList.contains('focus-right')).toBe(false)
    expect(rightPanel?.style.display).toBe('')

    await dispatchToggle()
    expect(split?.classList.contains('focus-left')).toBe(true)

    await dispatchToggle()
    expect(split?.classList.contains('focus-left')).toBe(false)
    expect(split?.classList.contains('focus-right')).toBe(false)
  } finally {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  }
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

    const alert = await waitForElement(
      () => container.querySelector('[role="alert"]') as HTMLElement | null,
      'ollama error banner'
    )
    expect(alert).toBeInstanceOf(HTMLElement)
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
    const reopened = await waitForElement(
      () => container.querySelector('[role="alert"]') as HTMLElement | null,
      'ollama error banner'
    )
    expect(reopened).toBeInstanceOf(HTMLElement)

    await act(async () => { runButton.click() })
    await flushEffects()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  } finally {
    consoleError.mockRestore()
    await act(async () => { root.unmount() })
    container.remove()
  }
})

domTest('masks over-limit preview with sanitized text', async () => {
  const secret = 'ABCDEFGHIJKLMNOPQRSTUVWX0123456789'
  const payload = `${'x'.repeat(40020)}\napi_key = "${secret}"\n`

  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({
      status: 'ready',
      guidance: '',
      retry: vi.fn(async () => {})
    }),
    useOllamaStream: () => ({
      startStream: async () => {},
      abortStream: async () => {},
      appendChunk: () => {},
      isStreaming: false
    }),
    invoke: async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'read_workspace') return null
      if (cmd === 'write_workspace') return 'ok'
      if (cmd === 'list_project_files') return []
      if (cmd === 'compose_prompt') {
        return { final_prompt: 'SYS\n---\nUSER_INPUT', sha256: 'hash', model: 'm' }
      }
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

    const leftTextarea = await waitForElement(
      () => container.querySelector('textarea[data-side="left"]'),
      'left textarea'
    )
    if (!(leftTextarea instanceof HTMLTextAreaElement)) {
      throw new Error('Expected left textarea')
    }

    await act(async () => {
      leftTextarea.value = payload
      leftTextarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flushEffects()

    const previewDetails = container.querySelector('details')
    expect(previewDetails).toBeInstanceOf(HTMLElement)
    if (!(previewDetails instanceof HTMLElement)) {
      throw new Error('Expected preview details')
    }
    previewDetails.setAttribute('open', '')

    await flushEffects()

    const previewPre = previewDetails.querySelector('pre')
    expect(previewPre).toBeInstanceOf(HTMLElement)
    const previewText = previewPre?.textContent ?? ''

    expect(previewText).toContain('<REDACTED:API_KEY>')
    expect(previewText).not.toContain(secret)
  } finally {
    await act(async () => {
      root.unmount()
    })
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

domTest('run button starts stream once and stop button aborts once', async () => {
  const startStream = vi.fn(async () => {})
  const abortStream = vi.fn(async () => {})

  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({ status: 'ready', guidance: '', retry: vi.fn(async () => {}) }),
    useOllamaStream: handlers => {
      const [streaming, setStreaming] = React.useState(false)
      return {
        startStream: React.useCallback(async () => {
          setStreaming(true)
          await startStream()
        }, [startStream]),
        abortStream: React.useCallback(async () => {
          setStreaming(false)
          await abortStream()
        }, [abortStream]),
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
    await act(async () => { root.render(<App />) })

    const runButton = await waitForElement(
      () => container.querySelector('.runpulse') as HTMLButtonElement | null,
      'run button'
    )
    const stopButton = await waitForElement(
      () => Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('停止')) as HTMLButtonElement | null,
      'stop button'
    )

    expect(stopButton.disabled).toBe(true)

    await act(async () => { runButton.click() })
    await flushEffects()
    expect(startStream).toHaveBeenCalledTimes(1)
    expect(stopButton.disabled).toBe(false)

    await act(async () => { runButton.click() })
    await flushEffects()
    expect(startStream).toHaveBeenCalledTimes(1)

    await act(async () => { stopButton.click() })
    await flushEffects()
    expect(abortStream).toHaveBeenCalledTimes(1)
    expect(stopButton.disabled).toBe(true)

    await act(async () => { stopButton.click() })
    await flushEffects()
    expect(abortStream).toHaveBeenCalledTimes(1)
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

domTest('stop button aborts stream once without saving partial response', async () => {
  const startStreamImpl = vi.fn(async () => {})
  const abortStreamImpl = vi.fn(async () => {})
  const saveRunCalls: Array<Record<string, unknown> | undefined> = []
  let capturedHandlers: Parameters<UseOllamaStreamFn>[0] | null = null

  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({ status: 'ready', guidance: '', retry: vi.fn(async () => {}) }),
    useOllamaStream: handlers => {
      capturedHandlers = handlers ?? null
      const [streaming, setStreaming] = React.useState(false)
      return {
        startStream: React.useCallback(
          async args => {
            setStreaming(true)
            await startStreamImpl(args)
          },
          [startStreamImpl]
        ),
        abortStream: React.useCallback(
          async () => {
            setStreaming(false)
            await abortStreamImpl()
            await handlers?.onEnd?.()
          },
          [abortStreamImpl, handlers]
        ),
        appendChunk: handlers?.onChunk ?? (() => {}),
        isStreaming: streaming
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
      return undefined
    }
  }

  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)

  try {
    await act(async () => { root.render(<App />) })

    const runButton = await waitForElement(
      () => container.querySelector('.runpulse') as HTMLButtonElement | null,
      'run button'
    )
    const stopButton = await waitForElement(
      () => Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('停止')) as HTMLButtonElement | null,
      'stop button'
    )
    const rightTextarea = await waitForElement(
      () => container.querySelector('textarea[data-side="right"]') as HTMLTextAreaElement | null,
      'right textarea'
    )

    await act(async () => { runButton.click() })
    await flushEffects()

    expect(startStreamImpl).toHaveBeenCalledTimes(1)
    expect(stopButton.disabled).toBe(false)
    expect(capturedHandlers).toBeTruthy()

    await act(async () => {
      capturedHandlers?.onChunk?.('partial output')
    })
    await flushEffects()
    expect(rightTextarea.value).toBe('partial output')

    await act(async () => { stopButton.click() })
    await flushEffects()

    expect(abortStreamImpl).toHaveBeenCalledTimes(1)
    expect(saveRunCalls).toHaveLength(0)
    expect(rightTextarea.value).toBe('')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

domTest('redacts over-limit secrets in preview and compose invocation', async () => {
  const secret = 'AKIA1234567890ABCDEF'
  const filler = 'x'.repeat(40000)
  const composeCalls: string[] = []
  const startStreamImpl = vi.fn(async () => {})

  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({
      status: 'ready',
      guidance: '',
      retry: vi.fn(async () => {})
    }),
    useOllamaStream: handlers => ({
      startStream: async args => {
        await startStreamImpl(args)
        handlers?.onEnd?.()
      },
      abortStream: async () => {},
      appendChunk: chunk => handlers?.onChunk?.(chunk),
      isStreaming: false
    }),
    invoke: async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'read_workspace') return null
      if (cmd === 'write_workspace') return 'ok'
      if (cmd === 'list_project_files') return []
      if (cmd === 'compose_prompt') {
        const inline = (args?.inlineParams ?? {}) as { user_input?: string }
        composeCalls.push(String(inline.user_input ?? ''))
        return { final_prompt: 'SYS\n---\nUSER_INPUT', sha256: 'hash', model: 'model' }
      }
      return undefined
    }
  }

  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)

  try {
    await act(async () => {
      root.render(<App />)
    })

    const leftTextarea = await waitForElement(
      () => container.querySelector('textarea[data-side="left"]') as HTMLTextAreaElement | null,
      'left textarea'
    )

    const longText = `${filler}${secret}`

    await act(async () => {
      leftTextarea.value = longText
      leftTextarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flushEffects()

    const preview = container.querySelector('details pre')
    expect(preview).toBeInstanceOf(HTMLElement)
    if (!(preview instanceof HTMLElement)) throw new Error('Expected preview element')
    const previewText = preview.textContent ?? ''
    expect(previewText).toContain('<REDACTED:AWS_ACCESS_KEY>')
    expect(previewText).not.toContain(secret)

    const runButton = container.querySelector('.runpulse')
    expect(runButton).toBeInstanceOf(HTMLButtonElement)
    if (!(runButton instanceof HTMLButtonElement)) throw new Error('Expected run button')

    await act(async () => {
      runButton.click()
    })
    await flushEffects()

    expect(startStreamImpl).toHaveBeenCalledTimes(1)
    expect(composeCalls).toHaveLength(1)
    expect(composeCalls[0]).toContain('<REDACTED:AWS_ACCESS_KEY>')
    expect(composeCalls[0]).not.toContain(secret)
  } finally {
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

test('composePromptWithSelection redacts secrets while keeping overLimit true', async () => {
  const MAX_LENGTH = 40000
  const secret = 'AKIA1234567890ABCDEF'
  const leftText = `${'x'.repeat(MAX_LENGTH)}${secret}`
  let capturedUserInput = ''
  let snapshot: { sanitized: string; maskedTypes: string[]; overLimit: boolean; raw: string } | null = null

  const res = await composePromptWithSelection({
    invokeFn: async (_cmd, args) => {
      capturedUserInput = String((args?.inlineParams as { user_input: string }).user_input)
      return { final_prompt: 'fp', sha256: 'hash', model: 'model' }
    },
    params: {},
    recipePath: 'recipe.yaml',
    leftText,
    sendSelectionOnly: false,
    selection: '',
    selectionStart: null,
    selectionEnd: null,
    contextRadius: 3,
    onSanitized: value => {
      snapshot = value
    }
  })

  expect(snapshot).not.toBeNull()
  const nonNullSnapshot = snapshot as NonNullable<typeof snapshot>
  expect(nonNullSnapshot.raw).toBe(leftText)
  expect(nonNullSnapshot.overLimit).toBe(true)
  expect(nonNullSnapshot.maskedTypes).toEqual(['AWS_ACCESS_KEY'])
  expect(nonNullSnapshot.sanitized).toBe(`${'x'.repeat(MAX_LENGTH)}<REDACTED:AWS_ACCESS_KEY>`)
  expect(capturedUserInput).toBe(nonNullSnapshot.sanitized)
  expect(res).toEqual({ final_prompt: 'fp', sha256: 'hash', model: 'model' })
})

test('composePromptWithSelection uses masked text even when sanitizeUserInput reports overLimit', async () => {
  const rawSelection = 'some secret token'
  const sanitizedValue = '<REDACTED:API_KEY>'
  const sanitizeSpy = vi.spyOn(sanitizeModule, 'sanitizeUserInput').mockReturnValue({
    sanitized: sanitizedValue,
    maskedTypes: ['API_KEY'],
    overLimit: true
  })

  try {
    let capturedUserInput = ''
    let snapshot: { sanitized: string; maskedTypes: string[]; overLimit: boolean; raw: string } | null = null
    const res = await composePromptWithSelection({
      invokeFn: async (_cmd, args) => {
        capturedUserInput = String((args?.inlineParams as { user_input: string }).user_input)
        return { final_prompt: 'fp', sha256: 'hash', model: 'model' }
      },
      params: {},
      recipePath: 'recipe.yaml',
      leftText: rawSelection,
      sendSelectionOnly: true,
      selection: rawSelection,
      selectionStart: 0,
      selectionEnd: rawSelection.length,
      contextRadius: 3,
      onSanitized: value => {
        snapshot = value
      }
    })

    expect(sanitizeSpy).toHaveBeenCalledTimes(1)
    const expectedRaw = determineUserInput(true, rawSelection, rawSelection, 0, rawSelection.length, 3)
    expect(sanitizeSpy).toHaveBeenCalledWith(expectedRaw)
    expect(snapshot).not.toBeNull()
    const nonNullSnapshot = snapshot as NonNullable<typeof snapshot>
    expect(nonNullSnapshot.raw).toBe(expectedRaw)
    expect(nonNullSnapshot.overLimit).toBe(true)
    expect(nonNullSnapshot.maskedTypes).toEqual(['API_KEY'])
    expect(nonNullSnapshot.sanitized).toBe(sanitizedValue)
    expect(capturedUserInput).toBe(sanitizedValue)
    expect(res).toEqual({ final_prompt: 'fp', sha256: 'hash', model: 'model' })
  } finally {
    sanitizeSpy.mockRestore()
  }
})

test('composePromptWithSelection forwards masked text when sanitizeUserInput exceeds the limit', async () => {
  const filler = 'x'.repeat(100)
  const rawSelection = `${filler}super secret`
  const maskedValue = '<REDACTED:AWS_SECRET_KEY>'
  const sanitizeSpy = vi.spyOn(sanitizeModule, 'sanitizeUserInput').mockReturnValue({
    sanitized: maskedValue,
    maskedTypes: ['AWS_SECRET_KEY'],
    overLimit: true
  })

  try {
    const invokeFn = vi.fn(async (_cmd: string, args?: Record<string, unknown>) => ({
      final_prompt: 'fp',
      sha256: 'hash',
      model: 'model'
    }))
    let snapshot: { sanitized: string; maskedTypes: string[]; overLimit: boolean; raw: string } | null = null

    await composePromptWithSelection({
      invokeFn,
      params: { temperature: 0 },
      recipePath: 'recipe.yaml',
      leftText: rawSelection,
      sendSelectionOnly: true,
      selection: rawSelection,
      selectionStart: 0,
      selectionEnd: rawSelection.length,
      contextRadius: 3,
      onSanitized: value => {
        snapshot = value
      }
    })

    expect(sanitizeSpy).toHaveBeenCalledTimes(1)
    const expectedRaw = determineUserInput(true, rawSelection, rawSelection, 0, rawSelection.length, 3)
    expect(invokeFn).toHaveBeenCalledTimes(1)
    const invokeArgs = invokeFn.mock.calls[0] as [string, { inlineParams: Record<string, unknown> }]
    expect(invokeArgs[0]).toBe('compose_prompt')
    expect(invokeArgs[1].inlineParams.user_input).toBe(maskedValue)
    expect(snapshot).not.toBeNull()
    const nonNullSnapshot = snapshot as NonNullable<typeof snapshot>
    expect(nonNullSnapshot.raw).toBe(expectedRaw)
    expect(nonNullSnapshot.sanitized).toBe(maskedValue)
    expect(nonNullSnapshot.overLimit).toBe(true)
    expect(nonNullSnapshot.maskedTypes).toEqual(['AWS_SECRET_KEY'])
  } finally {
    sanitizeSpy.mockRestore()
  }
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

test('buildUnifiedDiff formats unified diff output from library', () => {
  const libraryOutput = [
    '===================================================================',
    '--- sentinel left',
    '+++ sentinel right',
    '@@ -1,1 +1,1 @@',
    '-before',
    '+after',
    ''
  ].join('\n')
  const spy = vi.spyOn(diffModule, 'createTwoFilesPatch').mockReturnValue(libraryOutput)

  try {
    const result = buildUnifiedDiff('before\nline', 'after\nline')
    expect(result).toBe(['--- sentinel left', '+++ sentinel right', '@@ -1,1 +1,1 @@', '-before', '+after'].join('\n'))
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

domTest('toggles focus mode with shortcut and panel buttons', async () => {
  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({ status: 'ready', guidance: '', retry: vi.fn(async () => {}) }),
    invoke: async (cmd: string) => {
      if (cmd === 'read_workspace') return null
      if (cmd === 'write_workspace') return 'ok'
      if (cmd === 'list_project_files') return []
      if (cmd === 'compose_prompt') return { final_prompt: 'SYS\n---\nUSER_INPUT', sha256: 'hash', model: 'm' }
      return undefined
    },
    useOllamaStream: () => ({
      startStream: async () => {},
      abortStream: async () => {},
      appendChunk: () => {},
      isStreaming: false
    })
  }

  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  await act(async () => { root.render(<App />) })

  const split = container.querySelector('.split')
  expect(split).toBeInstanceOf(HTMLElement)
  if (!(split instanceof HTMLElement)) throw new Error('Expected split container')

  const leftTextarea = container.querySelector('textarea[data-side="left"]')
  const rightTextarea = container.querySelector('textarea[data-side="right"]')
  expect(leftTextarea).toBeInstanceOf(HTMLTextAreaElement)
  expect(rightTextarea).toBeInstanceOf(HTMLTextAreaElement)
  if (!(leftTextarea instanceof HTMLTextAreaElement) || !(rightTextarea instanceof HTMLTextAreaElement)) {
    throw new Error('Expected both textareas')
  }

  await act(async () => { leftTextarea.focus() })
  await flushEffects()

  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })
    )
  })
  await flushEffects()

  expect(split.classList.contains('focus-left')).toBe(true)
  const rightPanel = container.querySelector('[data-panel="right"]')
  expect(rightPanel).toBeInstanceOf(HTMLElement)
  if (rightPanel instanceof HTMLElement) {
    expect(rightPanel.getAttribute('data-focus-hidden')).toBe('true')
  }

  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })
    )
  })
  await flushEffects()

  expect(split.classList.contains('focus-left')).toBe(false)

  await act(async () => { rightTextarea.focus() })
  await flushEffects()

  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'f', metaKey: true, shiftKey: true, bubbles: true, cancelable: true })
    )
  })
  await flushEffects()

  expect(split.classList.contains('focus-right')).toBe(true)
  const rightToggle = container.querySelector('[data-testid="focus-toggle-right"]')
  expect(rightToggle).toBeInstanceOf(HTMLButtonElement)
  if (!(rightToggle instanceof HTMLButtonElement)) throw new Error('Expected right focus toggle')

  await act(async () => { rightToggle.click() })
  await flushEffects()

  expect(split.classList.contains('focus-right')).toBe(false)

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
  expect(runButton).toBeInstanceOf(HTMLButtonElement)
  await act(async () => { runButton.click() })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })

  expect(saveRunCalls).toHaveLength(1)
  const saveArgs = saveRunCalls[0] as { recipePath?: string; final_prompt?: string; response_text?: string }
  expect(saveArgs.recipePath).toBe('data/recipes/demo.sora2.yaml')
  expect(saveArgs.final_prompt).toBe('SYS\n---\nUSER_INPUT final')
  expect(saveArgs.response_text).toBe('first second')

  const rightTextarea = container.querySelector('textarea[data-side="right"]')
  expect(rightTextarea).toBeInstanceOf(HTMLTextAreaElement)
  expect(rightTextarea?.value).toBe('first second')

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
  expect(runButton).toBeInstanceOf(HTMLButtonElement)

  await act(async () => { runButton.click() })
  await act(async () => { await Promise.resolve() })
  expect(streamApi).not.toBeNull()
  await act(async () => { await streamApi?.abortStream() })
  await act(async () => { await Promise.resolve() })
  expect(savedTexts).toEqual(['first'])

  await act(async () => { runButton.click() })
  await act(async () => { await Promise.resolve() })
  expect(savedTexts).toEqual(['first'])

  await act(async () => { runButton.click() })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  expect(savedTexts).toEqual(['first', 'third'])

  const rightTextarea = container.querySelector('textarea[data-side="right"]')
  expect(rightTextarea).toBeInstanceOf(HTMLTextAreaElement)
  expect(rightTextarea?.value).toBe('third')

  await act(async () => { root.unmount() })
  container.remove()
})

domTest('defers save_run until stream completion without duplicate start', async () => {
  let capturedHandlers: Parameters<UseOllamaStreamFn>[0] | null = null; let resolveStream: (() => void) | null = null; let startCalls = 0; const saveRunCalls: Array<Record<string, unknown>> = []
  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({ status: 'ready', guidance: '', retry: vi.fn(async () => {}) }),
    invoke: async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'read_workspace') return null
      if (cmd === 'write_workspace') return 'ok'
      if (cmd === 'list_project_files') return []
      if (cmd === 'compose_prompt') return { final_prompt: 'SYS\n---\nUSER_INPUT', sha256: 'hash', model: 'm' }
      if (cmd === 'save_run') { saveRunCalls.push(args ?? {}); return 'ok' }
      return undefined
    },
    useOllamaStream: handlers => {
      capturedHandlers = handlers
      let streaming = false
      const api: ReturnType<UseOllamaStreamFn> = {
        startStream: async () => {
          startCalls += 1
          streaming = true
          api.isStreaming = true
          handlers?.onChunk?.('alpha ')
          handlers?.onJsonl?.('{"response":"alpha ","done":false}\n')
          await new Promise<void>(resolve => {
            resolveStream = () => {
              streaming = false
              api.isStreaming = false
              resolve()
            }
          })
        },
        abortStream: async () => {
          streaming = false
          api.isStreaming = false
        },
        appendChunk: chunk => handlers?.onChunk?.(chunk),
        isStreaming: streaming
      }
      return api
    }
  }

  const container = document.body.appendChild(document.createElement('div')); const root = createRoot(container)
  try {
    await act(async () => { root.render(<App />) })
    const runButton = container.querySelector('.runpulse') as HTMLButtonElement | null
    if (!runButton) throw new Error('Expected run button')

    await act(async () => { runButton.click(); await Promise.resolve() })
    await flushEffects()
    expect(startCalls).toBe(1); expect(saveRunCalls).toHaveLength(0)
    await act(async () => {
      capturedHandlers?.onChunk?.('beta')
      capturedHandlers?.onJsonl?.('{"response":"beta","done":true}\n')
    })
    await flushEffects()
    expect(startCalls).toBe(1); expect(saveRunCalls).toHaveLength(0)

    await act(async () => { resolveStream?.(); await capturedHandlers?.onEnd?.() })
    await flushEffects()
    expect(startCalls).toBe(1)
    expect(saveRunCalls).toEqual([
      {
        recipePath: 'data/recipes/demo.sora2.yaml',
        final_prompt: 'SYS\n---\nUSER_INPUT',
        response_jsonl: '{"response":"alpha ","done":false}\n{"response":"beta","done":true}\n',
        response_text: 'alpha beta'
      }
    ])
    const rightTextarea = container.querySelector('textarea[data-side="right"]')
    expect(rightTextarea).toBeInstanceOf(HTMLTextAreaElement); expect(rightTextarea?.value).toBe('alpha beta')
  } finally {
    await act(async () => { root.unmount() }); container.remove()
  }
})

domTest('aggregates raw jsonl lines before invoking save_run', async () => {
  let capturedHandlers: Parameters<UseOllamaStreamFn>[0] | null = null
  const saveRunCalls: Array<Record<string, unknown>> = []
  appMockContainer.__APP_MOCKS__ = {
    useSetupCheck: () => ({ status: 'ready', guidance: '', retry: vi.fn(async () => {}) }),
    invoke: async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'read_workspace') return null
      if (cmd === 'write_workspace') return 'ok'
      if (cmd === 'list_project_files') return []
      if (cmd === 'compose_prompt') return { final_prompt: 'SYS\n---\nUSER_INPUT', sha256: 'hash', model: 'm' }
      if (cmd === 'save_run') { saveRunCalls.push(args ?? {}); return 'ok' }
      return undefined
    },
    useOllamaStream: handlers => {
      capturedHandlers = handlers
      return {
        startStream: async () => {},
        abortStream: async () => {},
        appendChunk: chunk => handlers?.onChunk?.(chunk),
        isStreaming: true
      }
    }
  }

  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)

  try {
    await act(async () => { root.render(<App />) })
    const runButton = container.querySelector('.runpulse') as HTMLButtonElement | null
    if (!runButton) throw new Error('Expected run button')

    await act(async () => { runButton.click(); await Promise.resolve() })
    expect(saveRunCalls).toHaveLength(0)

    await act(async () => {
      capturedHandlers?.onJsonl?.('{"response":"alpha"}\n')
      capturedHandlers?.onJsonl?.('{"response":"beta","done":true}')
    })
    expect(saveRunCalls).toHaveLength(0)

    await act(async () => { capturedHandlers?.onEnd?.() })
    expect(saveRunCalls).toEqual([
      {
        recipePath: 'data/recipes/demo.sora2.yaml',
        final_prompt: 'SYS\n---\nUSER_INPUT',
        response_jsonl: '{"response":"alpha"}\n{"response":"beta","done":true}',
        response_text: ''
      }
    ])
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
