import { useCallback, useEffect, useRef, useState } from 'react'

import { invoke } from '@tauri-apps/api/tauri'

export type SetupStatus = 'ok' | 'offline' | 'missing-model'

type BackendSetupStatus = SetupStatus | 'ready' | 'server_unavailable' | 'model_missing'

type SetupCheckResponse = {
  status: BackendSetupStatus
  guidance?: string
}

type SetupState = {
  status: SetupStatus
  guidance: string
}

const DEFAULT_GUIDANCE: Record<SetupStatus, string> = {
  ok: '',
  'missing-model': 'Required model is not available. Please install the recommended model and retry.',
  offline: 'Ollama service is not reachable. Please start Ollama and retry.'
}

const isBackendSetupStatus = (value: unknown): value is BackendSetupStatus =>
  value === 'ok' ||
  value === 'offline' ||
  value === 'missing-model' ||
  value === 'ready' ||
  value === 'server_unavailable' ||
  value === 'model_missing'

const normalizeStatus = (status: BackendSetupStatus): SetupStatus => {
  switch (status) {
    case 'ready':
      return 'ok'
    case 'server_unavailable':
      return 'offline'
    case 'model_missing':
      return 'missing-model'
    default:
      return status
  }
}

const normalizeResponse = (response: unknown): SetupState => {
  if (
    response &&
    typeof response === 'object' &&
    'status' in response &&
    isBackendSetupStatus((response as { status: unknown }).status)
  ) {
    const typed = response as SetupCheckResponse
    const status = normalizeStatus(typed.status)
    const guidance = typed.guidance ?? DEFAULT_GUIDANCE[status]
    return { status, guidance }
  }

  return { status: 'offline', guidance: DEFAULT_GUIDANCE.offline }
}

export type UseSetupCheckResult = SetupState & {
  retry: () => Promise<void>
}

export const useSetupCheck = (currentModel: string): UseSetupCheckResult => {
  const [state, setState] = useState<SetupState>({ status: 'ok', guidance: '' })
  const hasRun = useRef(false)

  const runCheck = useCallback(async () => {
    try {
      const response = await invoke<SetupCheckResponse>('check_ollama_setup', { model: currentModel })
      setState(normalizeResponse(response))
    } catch (_error) {
      setState({ status: 'offline', guidance: DEFAULT_GUIDANCE.offline })
    }
  }, [currentModel])

  useEffect(() => {
    if (!hasRun.current) {
      hasRun.current = true
      void runCheck()
    }
  }, [runCheck])

  const retry = useCallback(async () => {
    await runCheck()
  }, [runCheck])

  return {
    ...state,
    retry
  }
}
