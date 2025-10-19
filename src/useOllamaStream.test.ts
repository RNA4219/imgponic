import React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

import { useOllamaStream } from './useOllamaStream'

type StreamHandlers = Parameters<typeof useOllamaStream>[0]
type StreamState = ReturnType<typeof useOllamaStream>

type HandlerPayload = { payload?: unknown }

const flushEffects = async () => {
  await act(async () => {
    await Promise.resolve()
  })
}

const mountHook = (handlers?: StreamHandlers) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const result: { current: StreamState | null } = { current: null }

  const Wrapper = (props: { handlers?: StreamHandlers }) => {
    result.current = useOllamaStream(props.handlers)
    return null
  }

  act(() => {
    root.render(React.createElement(Wrapper, { handlers }))
  })

  return {
    result,
    listeners: new Map<string, (payload: HandlerPayload) => void>(),
    unmount: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    }
  }
}

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}))

describe('useOllamaStream (jsonl aggregation)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('aggregates JSONL payloads and forwards them to onEnd', async () => {
    const listeners = new Map<string, (payload: HandlerPayload) => void>()
    let resolveStream: (() => void) | null = null

    vi.mocked(getCurrentWindow).mockReturnValue({
      listen: vi.fn(async (event: string, handler: (payload: HandlerPayload) => void) => {
        listeners.set(event, handler)
        return () => {
          listeners.delete(event)
        }
      })
    } as unknown as ReturnType<typeof getCurrentWindow>)

    vi.mocked(invoke).mockImplementation(async command => {
      if (command === 'run_ollama_stream') {
        await new Promise<void>(resolve => {
          resolveStream = resolve
        })
      }
      return undefined
    })

    const onEnd = vi.fn()
    const { result, unmount } = mountHook({ onEnd })
    const startPromise = result.current?.startStream({ model: 'm', systemText: 's', userText: 'u' }) ?? Promise.resolve()
    await flushEffects()

    listeners.get('ollama:jsonl')?.({ payload: '{"response":"a"}\n' })
    listeners.get('ollama:chunk')?.({ payload: 'a' })
    listeners.get('ollama:jsonl')?.({ payload: '{"response":"b","done":true}\n' })
    listeners.get('ollama:chunk')?.({ payload: 'b' })

    await act(async () => {
      listeners.get('ollama:end')?.({})
      resolveStream?.()
      await startPromise
    })

    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledWith({ raw: '{"response":"a"}\n{"response":"b","done":true}\n' })

    unmount()
  })
})
