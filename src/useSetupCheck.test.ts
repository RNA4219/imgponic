import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('normalizes snake_case statuses returned by tauri backend', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ status: 'ready' })

    const readyHook = await renderHook('phi')
    await flushEffects()

    expect(readyHook.result.current.status).toBe('ok')
    expect(readyHook.result.current.guidance).toBe('')

    await readyHook.unmount()

    vi.mocked(invoke).mockResolvedValueOnce({ status: 'server_unavailable' })

    const offlineHook = await renderHook('phi')
    await flushEffects()

    expect(offlineHook.result.current.status).toBe('offline')
    expect(offlineHook.result.current.guidance).toContain('Ollama')

    await offlineHook.unmount()

    vi.mocked(invoke).mockResolvedValueOnce({ status: 'model_missing', guidance: 'install from backend' })

    const missingHook = await renderHook('phi')
    await flushEffects()

    expect(missingHook.result.current.status).toBe('missing-model')
    expect(missingHook.result.current.guidance).toBe('install from backend')

    await missingHook.unmount()
  })
})
