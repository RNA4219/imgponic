import { useCallback, useEffect, useRef, useState } from 'react'

import { invoke } from '@tauri-apps/api/tauri'

export type SetupStatus = 'ok' | 'offline' | 'missing-model'

type BackendSetupStatus = SetupStatus | 'ready' | 'server_unavailable' | 'model_missing'

type SetupCheckResponse = {
  status: BackendSetupStatus | string
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

const normalizeStatus = (status: unknown): SetupStatus | undefined => {
  if (typeof status !== 'string') {
    return undefined
  }

  const trimmed = status.trim()
  if (!trimmed) {
    return undefined
  }

  const snakeCase = trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()

  switch (snakeCase) {
    case 'ok':
    case 'ready':
      return 'ok'
    case 'offline':
    case 'server_unavailable':
      return 'offline'
    case 'missing-model':
    case 'missing_model':
    case 'model_missing':
      return 'missing-model'
    default:
      return undefined
  }
}

const normalizeResponse = (response: unknown): SetupState => {
  if (
    response &&
    typeof response === 'object' &&
    'status' in response
  ) {
    const typed = response as SetupCheckResponse
    const status = normalizeStatus(typed.status)
    if (status) {
      const guidance = typed.guidance ?? DEFAULT_GUIDANCE[status]
      return { status, guidance }
    }
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
