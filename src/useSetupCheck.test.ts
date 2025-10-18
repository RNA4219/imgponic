import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { invoke } from '@tauri-apps/api/tauri'

import { useSetupCheck } from './useSetupCheck'

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn()
}))

type HookResult = ReturnType<typeof useSetupCheck>

type RenderHookResult = {
  result: { current: HookResult }
  rerender: (model: string) => Promise<void>
  unmount: () => Promise<void>
}

const flushEffects = async () => {
  await act(async () => {
    await Promise.resolve()
  })
}

const renderHook = async (model: string): Promise<RenderHookResult> => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const result: { current: HookResult } = {
    current: { status: 'ok', guidance: '', retry: async () => {} }
  }

  const TestComponent = ({ currentModel }: { currentModel: string }) => {
    result.current = useSetupCheck(currentModel)
    return null
  }

  await act(async () => {
    root.render(React.createElement(TestComponent, { currentModel: model }))
  })

  return {
    result,
    rerender: async nextModel => {
      await act(async () => {
        root.render(React.createElement(TestComponent, { currentModel: nextModel }))
      })
    },
    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    }
  }
}

describe('useSetupCheck', () => {
  beforeAll(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches setup status once on mount and reports success', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ status: 'ok', guidance: 'ready' })

    const hook = await renderHook('phi')
    await flushEffects()

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('check_ollama_setup', { model: 'phi' })
    expect(hook.result.current.status).toBe('ok')
    expect(hook.result.current.guidance).toBe('ready')

    await hook.unmount()
  })

  it('marks offline when invoke fails and allows retry', async () => {
    vi.mocked(invoke)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ status: 'ok', guidance: 'recovered' })

    const hook = await renderHook('llama')
    await flushEffects()

    expect(hook.result.current.status).toBe('offline')
    expect(hook.result.current.guidance).toContain('Ollama')
    expect(invoke).toHaveBeenCalledTimes(1)

    await act(async () => {
      await hook.result.current.retry()
    })
    await flushEffects()

    expect(invoke).toHaveBeenCalledTimes(2)
    expect(hook.result.current.status).toBe('ok')
    expect(hook.result.current.guidance).toBe('recovered')

    await hook.unmount()
  })

  it('propagates missing-model status from backend', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ status: 'missing-model', guidance: 'install phi' })

    const hook = await renderHook('phi')
    await flushEffects()

    expect(hook.result.current.status).toBe('missing-model')
    expect(hook.result.current.guidance).toBe('install phi')
    expect(invoke).toHaveBeenCalledWith('check_ollama_setup', { model: 'phi' })

    await hook.unmount()
  })

  it('normalizes backend statuses including snake_case aliases', async () => {
    const expectations = [
      { backend: { status: 'ready' as const }, expected: { status: 'ok', guidance: '' } },
      {
        backend: { status: 'server_unavailable' as const },
        expected: { status: 'offline', guidanceMatcher: expect.stringContaining('Ollama') }
      },
      {
        backend: { status: 'model_missing' as const, guidance: 'install from backend' },
        expected: { status: 'missing-model', guidance: 'install from backend' }
      }
    ]

    for (const { backend, expected } of expectations) {
      vi.mocked(invoke).mockResolvedValueOnce(backend)

      const hook = await renderHook('phi')
      await flushEffects()

      expect(hook.result.current.status).toBe(expected.status)
      if ('guidanceMatcher' in expected) {
        expect(hook.result.current.guidance).toEqual(expected.guidanceMatcher)
      } else {
        expect(hook.result.current.guidance).toBe(expected.guidance)
      }

      await hook.unmount()
    }
  })
})
