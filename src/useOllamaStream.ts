import { useCallback, useEffect, useRef, useState } from 'react'

import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

type UnlistenFn = () => void | Promise<void>

type StreamArgs = { model: string; systemText: string; userText: string }

type StreamHandlers = { onChunk?: (chunk: string) => void; onEnd?: () => void; onError?: (message: string) => void }

type StreamState = { startStream: (args: StreamArgs) => Promise<void>; abortStream: () => Promise<void>; appendChunk: (chunk: string) => void; isStreaming: boolean }

export const useOllamaStream = (handlers: StreamHandlers = {}): StreamState => {
  const [isStreaming, setIsStreaming] = useState(false)
  const handlerRef = useRef(handlers)
  const unlistenRef = useRef<UnlistenFn[] | null>(null)
  const streamingRef = useRef(false)

  useEffect(() => { handlerRef.current = handlers }, [handlers])

  const appendChunk = useCallback((chunk: string) => handlerRef.current.onChunk?.(chunk), [])

  const clearListeners = useCallback(async () => {
    const current = unlistenRef.current
    unlistenRef.current = null
    if (!current) return
    await Promise.allSettled(current.map(fn => Promise.resolve(fn())))
  }, [])

  const finalize = useCallback((kind: 'end' | 'error', reason?: unknown) => {
    if (!streamingRef.current) return
    streamingRef.current = false
    setIsStreaming(false)
    void clearListeners()
    if (kind === 'end') handlerRef.current.onEnd?.()
    else handlerRef.current.onError?.(reason instanceof Error ? reason.message : String(reason ?? ''))
  }, [clearListeners])

  const startStream = useCallback(async (args: StreamArgs) => {
    if (streamingRef.current) return
    streamingRef.current = true
    setIsStreaming(true)
    const unlisteners: UnlistenFn[] = []
    const window = getCurrentWindow()
    const register = async (name: string, cb: (event: unknown) => void) =>
      unlisteners.push(await window.listen(name, cb as (event: unknown) => void))
    await register('ollama:chunk', (event: { payload: string }) => appendChunk(event.payload))
    await register('ollama:end', () => finalize('end'))
    await register('ollama:error', event => finalize('error', (event as { payload?: unknown }).payload))
    unlistenRef.current = unlisteners
    try {
      await invoke('run_ollama_stream', args)
    } catch (error) {
      finalize('error', error)
      throw error
    }
  }, [appendChunk, finalize])

  const abortStream = useCallback(async () => {
    if (!streamingRef.current) return
    try {
      await invoke('abort_current_stream')
    } finally {
      finalize('end')
    }
  }, [finalize])

  return { startStream, abortStream, appendChunk, isStreaming }
}

if (import.meta.vitest) {
  const { describe, beforeEach, it, expect, vi } = import.meta.vitest
  const React = await import('react')
  const { act } = await import('react-dom/test-utils')
  const { createRoot } = await import('react-dom/client')
  const tauriModule = await import('@tauri-apps/api/core')
  const windowModule = await import('@tauri-apps/api/window')

  type HandlerPayload = { payload?: unknown }

  describe('useOllamaStream', () => {
    let listeners: Record<string, (event: HandlerPayload) => void>
    let resolveRun: (() => void) | null
    let rejectRun: ((error: unknown) => void) | null
    let runOverride: (() => Promise<void>) | null

    const mount = (handlers?: StreamHandlers) => {
      const root = createRoot(document.createElement('div'))
      const result: { current: StreamState | null } = { current: null }
      const View = (props: { handlers?: StreamHandlers }) => {
        result.current = useOllamaStream(props.handlers)
        return null
      }
      act(() => root.render(React.createElement(View, { handlers })))
      return { result, unmount: () => act(() => root.unmount()) }
    }

    beforeEach(() => {
      vi.restoreAllMocks()
      listeners = {}
      resolveRun = null
      rejectRun = null
      runOverride = null
      vi.spyOn(windowModule, 'getCurrentWindow').mockReturnValue({
        listen: vi.fn(async (event: string, handler: (payload: HandlerPayload) => void) => {
          listeners[event] = handler
          return () => {
            delete listeners[event]
          }
        })
      } as unknown as ReturnType<typeof windowModule.getCurrentWindow>)
      vi.spyOn(tauriModule, 'invoke').mockImplementation(async (cmd: string) => {
        if (cmd === 'run_ollama_stream') {
          if (runOverride) return await runOverride()
          return await new Promise<void>((resolve, reject) => { resolveRun = resolve; rejectRun = reject })
        }
        if (cmd === 'abort_current_stream') resolveRun?.()
        return undefined
      })
    })

    it('appends chunks and resolves on end events', async () => {
      const chunks: string[] = []; const ends: number[] = []
      const { result, unmount } = mount({ onChunk: chunk => chunks.push(chunk), onEnd: () => ends.push(1) })
      const startPromise = result.current?.startStream({ model: 'm', systemText: 's', userText: 'u' }) ?? Promise.resolve()
      await act(async () => { await Promise.resolve() })
      expect(result.current?.isStreaming).toBe(true)
      listeners['ollama:chunk']?.({ payload: 'hello' }); expect(chunks).toEqual(['hello'])
      await act(async () => { listeners['ollama:end']?.({}); resolveRun?.(); await startPromise })
      expect(result.current?.isStreaming).toBe(false); expect(ends.length).toBe(1)
      unmount()
    })

    it('handles error events and exposes appendChunk', async () => {
      const errors: string[] = []
      const { result, unmount } = mount({ onError: message => errors.push(message) })
      const startPromise = result.current?.startStream({ model: 'm', systemText: 's', userText: 'u' }) ?? Promise.resolve()
      await act(async () => { await Promise.resolve() })
      expect(result.current?.isStreaming).toBe(true)
      result.current?.appendChunk('manual')
      listeners['ollama:error']?.({ payload: new Error('boom') })
      await act(async () => { rejectRun?.(new Error('boom')); await startPromise.catch(() => {}) })
      expect(errors[0]).toBe('boom'); expect(result.current?.isStreaming).toBe(false)
      unmount()
    })

    it('keeps subscription when run resolves synchronously', async () => {
      const chunks: string[] = []
      runOverride = async () => {}
      const { result, unmount } = mount({ onChunk: chunk => chunks.push(chunk) })
      const startPromise = result.current?.startStream({ model: 'm', systemText: 's', userText: 'u' }) ?? Promise.resolve()
      await act(async () => { await Promise.resolve() })
      expect(result.current?.isStreaming).toBe(true)
      listeners['ollama:chunk']?.({ payload: 'late' })
      expect(chunks).toEqual(['late'])
      await act(async () => { listeners['ollama:end']?.({}); await startPromise })
      unmount()
    })
  })
}
