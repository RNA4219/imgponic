import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createTwoFilesPatch } from 'diff'
import { invoke } from '@tauri-apps/api/core'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { containsDangerWords } from './security/dangerWords'
import { useOllamaStream } from './useOllamaStream'
import { useSetupCheck } from './useSetupCheck'
import KeybindOverlay, { resolveKeybindOverlayState } from './KeybindOverlay'
import { sanitizeUserInput, SanitizedUserInput } from './security/sanitizeUserInput'

if (typeof document !== 'undefined' && typeof (document as { createElement?: unknown }).createElement === 'function') {
  void import('./app.css')
}

type AppMocks = {
  useSetupCheck?: typeof useSetupCheck
  useOllamaStream?: typeof useOllamaStream
  invoke?: typeof invoke
}

const selectAppMocks = (): AppMocks =>
  (globalThis as typeof globalThis & { __APP_MOCKS__?: AppMocks }).__APP_MOCKS__ ?? {}

const resolveUseSetupCheckHook = (): typeof useSetupCheck =>
  selectAppMocks().useSetupCheck ?? useSetupCheck

const resolveUseOllamaStreamHook = (): typeof useOllamaStream =>
  selectAppMocks().useOllamaStream ?? useOllamaStream

const resolveInvokeFn = (): typeof invoke => selectAppMocks().invoke ?? invoke

export type ComposeResult = { final_prompt: string; sha256: string; model: string }
type InvokeFunction = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

type DocExcerpt = {
  path: string
  excerpt: string
  sha256: string
  truncated: boolean
  size_bytes: number
  used_bytes: number
}

const ACCESSIBILITY_STORAGE_KEYS = {
  highContrast: 'accessibility:highContrast',
  typography: 'accessibility:typography'
} as const

type TypographyPreset = 'normal' | 'relaxed' | 'spacious'

const TYPOGRAPHY_PRESETS: ReadonlyArray<{ id: TypographyPreset; label: string }> = [
  { id: 'normal', label: '標準' },
  { id: 'relaxed', label: 'ゆったり' },
  { id: 'spacious', label: 'ひろびろ' }
]

const describeOllamaError = (reason: unknown): string => {
  const value = reason instanceof Error ? reason.message : String(reason ?? '')
  const trimmed = value.trim()
  return trimmed ? `Ollamaエラー: ${trimmed}` : 'Ollamaエラー: 詳細不明'
}

const lineIndexBefore = (text: string, endExclusive: number): number =>
  !text.length || endExclusive <= 0 ? 0 : text.slice(0, Math.min(endExclusive, text.length)).split('\n').length - 1

export const determineUserInput = (
  sendSelectionOnly: boolean,
  selection: string,
  leftText: string,
  selectionStart: number | null,
  selectionEnd: number | null,
  contextRadius = 3
): string => {
  if (!sendSelectionOnly || !selection || selectionStart === null || selectionEnd === null || selectionStart === selectionEnd) return leftText
  if (!leftText) return ''
  const normalizedStart = Math.max(0, Math.min(selectionStart, leftText.length))
  const normalizedEnd = Math.max(normalizedStart, Math.min(selectionEnd, leftText.length))
  const lines = leftText.split('\n')
  const startLineIndex = lineIndexBefore(leftText, normalizedStart)
  const endLineIndex = lineIndexBefore(leftText, normalizedEnd)
  const contextText = lines
    .slice(Math.max(0, startLineIndex - contextRadius), Math.min(lines.length, endLineIndex + contextRadius + 1))
    .join('\n')
  return `[Lines ${startLineIndex + 1}-${endLineIndex + 1}]\n${contextText}`
}

type SanitizedSnapshot = SanitizedUserInput & { raw: string }

type ComposePromptOptions = {
  invokeFn?: InvokeFunction
  params: Record<string, unknown>
  recipePath: string
  leftText: string
  sendSelectionOnly: boolean
  selection: string
  selectionStart: number | null
  selectionEnd: number | null
  contextRadius?: number
  onSanitized?: (snapshot: SanitizedSnapshot) => void
}

export const composePromptWithSelection = async (
  {
    invokeFn = invoke,
    params,
    recipePath,
    leftText,
    sendSelectionOnly,
    selection,
    selectionStart,
    selectionEnd,
    contextRadius,
    onSanitized
  }: ComposePromptOptions
): Promise<ComposeResult> => {
  const rawUserInput = determineUserInput(sendSelectionOnly, selection, leftText, selectionStart, selectionEnd, contextRadius)
  const sanitized = sanitizeUserInput(rawUserInput)
  onSanitized?.({ ...sanitized, raw: rawUserInput })
  const userInput = sanitized.overLimit ? rawUserInput : sanitized.sanitized
  const res = await invokeFn('compose_prompt', { recipePath, inlineParams: { ...params, user_input: userInput } })
  return res as ComposeResult
}

export const formatSelectionSummary = (sendSelectionOnly: boolean, selection: string, preview: string): string => {
  const label = sendSelectionOnly && selection ? '選択+前後3行' : '全文'
  const lines = preview
    ? preview
        .split('\n')
        .filter((line, idx, arr) => !(line === '' && idx === arr.length - 1))
        .length
    : 0
  return `${label} / 送信行数: ${lines}行 / 送信文字数: 約${preview.length}字`
}

type Workspace = {
  version: number
  left_text: string
  right_text: string
  recipe_path: string
  model: string
  params: Record<string, unknown>
  updated_at: string
  project_path?: string
}

type DiffPreviewCallbacks = {
  show(patch: string): void
  apply(next: string): void
  close(): void
  readLeft(): string
  readRight(): string
}

export const buildUnifiedDiff = (before: string, after: string): string => {
  if (before === after) {
    return ['--- 左', '+++ 右', '@@', '  (差分はありません)'].join('\n')
  }
  const patch = createTwoFilesPatch('左', '右', before, after, '', '', { context: 3 })
  const lines = patch.split('\n')
  if (lines.length > 0 && lines[0] === '===================================================================') {
    lines.shift()
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines.join('\n')
}

export const createDiffPreviewFlow = (callbacks: DiffPreviewCallbacks) => ({
  open: () => callbacks.show(buildUnifiedDiff(callbacks.readLeft(), callbacks.readRight())),
  confirm: () => (callbacks.apply(callbacks.readRight()), callbacks.close()),
  cancel: () => callbacks.close()
})

export default function App() {
  const [highContrast, setHighContrast] = useState<boolean>(false)
  const [typographyPreset, setTypographyPreset] = useState<TypographyPreset>('normal')
  const INITIAL_LEFT_TEXT = 'ここに入力。Ollama整形は右の▶で実行。'
  const [leftText, setLeftText] = useState<string>(INITIAL_LEFT_TEXT)
  const [rightText, setRightText] = useState<string>('（ここに整形結果が出ます）')
  const [hasDangerWords, setHasDangerWords] = useState<boolean>(() => containsDangerWords(INITIAL_LEFT_TEXT))

  // レシピ/モデル
  const [recipePath, setRecipePath] = useState('data/recipes/demo.sora2.yaml')
  const [ollamaModel, setOllamaModel] = useState('llama3:8b')
  const useSetupCheckHook = resolveUseSetupCheckHook()
  const useOllamaStreamHook = resolveUseOllamaStreamHook()
  const { status: setupStatus, guidance: setupGuidance, retry: retrySetupCheck } = useSetupCheckHook(ollamaModel)
  const showSetupBanner = setupStatus === 'offline' || setupStatus === 'missing-model'
  const invokeFn = resolveInvokeFn()

  // パラメータ
  const [params, setParams] = useState({ goal: '30秒の戦闘シーン', tone: '冷静', steps: 6, user_input: '' })
  const [composed, setComposed] = useState<ComposeResult | null>(null)
  const composedRef = useRef<ComposeResult | null>(composed)
  useEffect(() => {
    composedRef.current = composed
  }, [composed])
  const [diffPatch, setDiffPatch] = useState<string | null>(null)
  const [showKeybindOverlay, setShowKeybindOverlay] = useState(false)

  // 実行ボタン演出
  const [running, setRunning] = useState(false)
  const [ollamaError, setOllamaError] = useState<string | null>(null)
  const resetOllamaError = useCallback(() => setOllamaError(null), [])
  const runBtnRef = useRef<HTMLButtonElement>(null)
  const leftTextRef = useRef<HTMLTextAreaElement>(null)
  const corpusInputRef = useRef<HTMLInputElement>(null)
  const [sendSelectionOnly, setSendSelectionOnly] = useState<boolean>(false)
  const [leftSelection, setLeftSelection] = useState<string>('')
  const [leftSelectionStart, setLeftSelectionStart] = useState<number | null>(null)
  const [leftSelectionEnd, setLeftSelectionEnd] = useState<number | null>(null)
  const streamedResponseRef = useRef<string>('')
  const updateLeftText = useCallback((value: string) => {
    setLeftText(value)
    setHasDangerWords(containsDangerWords(value))
  }, [])

  const clearStreamedResponse = useCallback(
    (options?: { preserveRightText?: boolean }) => {
      streamedResponseRef.current = ''
      if (!options?.preserveRightText) {
        setRightText('')
      }
    },
    [setRightText]
  )

  const appendStreamChunk = useCallback(
    (chunk: string) => {
      streamedResponseRef.current += chunk
      setRightText(streamedResponseRef.current)
    },
    [setRightText]
  )

  const handleStreamEnd = useCallback(async () => {
    setRunning(false)
    const responseText = streamedResponseRef.current
    const latestComposed = composedRef.current
    if (latestComposed) {
      try {
        await invokeFn('save_run', {
          recipePath,
          final_prompt: latestComposed.final_prompt,
          response_text: responseText
        })
      } catch (error) {
        console.warn('save_run failed', error)
      }
    }
    clearStreamedResponse({ preserveRightText: true })
  }, [clearStreamedResponse, invokeFn, recipePath])

  const handleStreamError = useCallback(
    (message: string) => {
      console.error('ollama stream error', message)
      setRunning(false)
      setOllamaError(describeOllamaError(message))
      clearStreamedResponse()
    },
    [clearStreamedResponse, setOllamaError]
  )

  const { startStream, abortStream: rawAbortStream, isStreaming } = useOllamaStreamHook({
    onChunk: appendStreamChunk,
    onEnd: () => {
      void handleStreamEnd()
    },
    onError: handleStreamError
  })
  const abortStream = useCallback(async () => {
    resetOllamaError()
    setRunning(false)
    await rawAbortStream()
    clearStreamedResponse()
  }, [clearStreamedResponse, resetOllamaError, rawAbortStream])

  useEffect(() => {
    const storedContrast = localStorage.getItem(ACCESSIBILITY_STORAGE_KEYS.highContrast)
    if (storedContrast === '1') setHighContrast(true)
    const storedTypography = localStorage.getItem(ACCESSIBILITY_STORAGE_KEYS.typography)
    if (storedTypography && TYPOGRAPHY_PRESETS.some(option => option.id === storedTypography)) setTypographyPreset(storedTypography as TypographyPreset)
  }, [])

  useEffect(() => {
    const body = document.body
    const typographyClass = `typography-${typographyPreset}`
    body.classList.toggle('high-contrast', highContrast)
    body.classList.add(typographyClass)
    localStorage.setItem(ACCESSIBILITY_STORAGE_KEYS.highContrast, highContrast ? '1' : '0')
    localStorage.setItem(ACCESSIBILITY_STORAGE_KEYS.typography, typographyPreset)
    return () => { body.classList.remove('high-contrast'); body.classList.remove(typographyClass) }
  }, [highContrast, typographyPreset])

  useEffect(() => {
    if (running) {
      runBtnRef.current?.classList.add('active')
    } else {
      runBtnRef.current?.classList.remove('active')
    }
  }, [running])

  // プロジェクトファイルパス（project/ 内相対）
  const [projRel, setProjRel] = useState('src/example.py')
  const [corpusRel, setCorpusRel] = useState('')
  const [docExcerpt, setDocExcerpt] = useState<DocExcerpt | null>(null)
  const [docExcerptStatus, setDocExcerptStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [docExcerptError, setDocExcerptError] = useState<string | null>(null)

  const loadDocExcerpt = useCallback(async () => {
    const currentValue = corpusInputRef.current?.value ?? corpusRel
    const trimmed = currentValue.trim()
    if (!trimmed) {
      setDocExcerpt(null)
      setDocExcerptStatus('idle')
      setDocExcerptError(null)
      setParams(prev => {
        if ('doc_excerpt' in prev) {
          const next = { ...prev }
          delete (next as Record<string, unknown>).doc_excerpt
          return next
        }
        return prev
      })
      return
    }
    setDocExcerptStatus('loading')
    setDocExcerptError(null)
    try {
      const result = await invokeFn<DocExcerpt>('load_txt_excerpt', { path: trimmed })
      setDocExcerpt(result)
      setDocExcerptStatus('success')
      setParams(prev => ({ ...prev, doc_excerpt: result.excerpt }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '')
      setDocExcerpt(null)
      setDocExcerptStatus('error')
      setDocExcerptError(message)
      setParams(prev => {
        if ('doc_excerpt' in prev) {
          const next = { ...prev }
          delete (next as Record<string, unknown>).doc_excerpt
          return next
        }
        return prev
      })
      alert('抜粋読込失敗: ' + message)
    }
  }, [corpusRel, invokeFn])

  // === Workspace: Restore on startup ===
  useEffect(() => {
    (async () => {
      try {
        const ws = await invokeFn<Workspace | null>('read_workspace')
        if (ws) {
          if (ws.left_text) updateLeftText(ws.left_text)
          if (ws.right_text) setRightText(ws.right_text)
          if (ws.recipe_path) setRecipePath(ws.recipe_path)
          if (ws.model) setOllamaModel(ws.model)
          if (ws.params) setParams(ws.params)
          if (ws.project_path) setProjRel(ws.project_path)
        }
      } catch (e) {
        console.warn('workspace load failed', e)
      }
    })()
  }, [invokeFn, updateLeftText])

  // === Workspace: Autosave (debounced 800ms) ===
  const saveTimer = useRef<number | null>(null)
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      const ws: Workspace = {
        version: 1,
        left_text: leftText,
        right_text: rightText,
        recipe_path: recipePath,
        model: ollamaModel,
        params,
        updated_at: new Date().toISOString(),
        project_path: projRel
      }
      try {
        await invokeFn<string>('write_workspace', { ws })
      } catch (e) {
        console.warn('workspace save failed', e)
      }
    }, 800)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [leftText, rightText, recipePath, ollamaModel, params, projRel, invokeFn])

  // ヘルパ：コピー／保存
  const copy = useCallback(async (txt: string) => { await writeText(txt) }, [])
  const saveAs = useCallback(async (suggest: string, txt: string) => {
    const p = await save({ defaultPath: suggest })
    if (p) await writeTextFile(p as string, txt)
  }, [])

  // 合成
  const doCompose = useCallback(async () => {
    const res = await composePromptWithSelection({
      invokeFn,
      params,
      recipePath,
      leftText,
      sendSelectionOnly,
      selection: leftSelection,
      selectionStart: leftSelectionStart,
      selectionEnd: leftSelectionEnd,
      contextRadius: 3,
      onSanitized: snapshot => {
        setUserInputWarnings({ maskedTypes: snapshot.maskedTypes, overLimit: snapshot.overLimit })
      }
    })
    setComposed(res)
    return res
  }, [invokeFn, params, recipePath, leftText, sendSelectionOnly, leftSelection, leftSelectionStart, leftSelectionEnd])

  // 実行（▶）
  const runOllama = useCallback(async () => {
    if (isStreaming) return
    resetOllamaError()
    setRunning(true)
    clearStreamedResponse()
    try {
      const c = composed ?? await doCompose()
      const sep = '\n---\nUSER_INPUT'
      const at = c.final_prompt.indexOf(sep)
      const sys = at < 0 ? c.final_prompt : c.final_prompt.slice(0, at)
      const user = at < 0 ? '' : c.final_prompt.slice(at)

      await startStream({
        model: ollamaModel,
        systemText: sys,
        userText: user
      })
    } catch (error) {
      console.error('run ollama stream failed', error)
      setRunning(false)
      setOllamaError(describeOllamaError(error))
    }
  }, [isStreaming, composed, doCompose, startStream, ollamaModel, clearStreamedResponse, resetOllamaError])

  // 右→左 反映（プレビュー付き）
  const diffFlow = useMemo(
    () =>
      createDiffPreviewFlow({
        readLeft: () => leftText,
        readRight: () => rightText,
        show: value => setDiffPatch(value),
        apply: value => updateLeftText(value),
        close: () => setDiffPatch(null)
      }),
    [leftText, rightText, updateLeftText]
  )
  const { open: openDiffPreview, confirm: confirmDiffPreview, cancel: cancelDiffPreview } = diffFlow

  const rawUserInput = useMemo(
    () => determineUserInput(sendSelectionOnly, leftSelection, leftText, leftSelectionStart, leftSelectionEnd, 3),
    [sendSelectionOnly, leftSelection, leftText, leftSelectionStart, leftSelectionEnd]
  )
  const sanitization = useMemo(() => sanitizeUserInput(rawUserInput), [rawUserInput])
  const sanitizedPreview = sanitization.overLimit ? rawUserInput : sanitization.sanitized
  const [userInputWarnings, setUserInputWarnings] = useState<{ maskedTypes: string[]; overLimit: boolean }>(() => ({
    maskedTypes: sanitization.maskedTypes,
    overLimit: sanitization.overLimit
  }))

  useEffect(() => {
    setUserInputWarnings({ maskedTypes: sanitization.maskedTypes, overLimit: sanitization.overLimit })
  }, [sanitization])

  const handleLeftSelection = useCallback((target: HTMLTextAreaElement) => {
    const { selectionStart, selectionEnd, value } = target
    setLeftSelectionStart(selectionStart)
    setLeftSelectionEnd(selectionEnd)
    setLeftSelection(selectionStart === selectionEnd ? '' : value.slice(selectionStart, selectionEnd))
  }, [])

  const handleLeftChange = useCallback(
    (event: React.FormEvent<HTMLTextAreaElement>) => {
      const target = event.currentTarget
      updateLeftText(target.value)
      handleLeftSelection(target)
    },
    [handleLeftSelection, updateLeftText]
  )

  // --- Project file helpers ---
  const openProjectToLeft = useCallback(async () => {
    if (!projRel) return
    try {
      const r = await invokeFn<{ path: string; content: string }>('read_project_file', { relPath: projRel })
      updateLeftText(r.content)
    } catch (error: unknown) {
      alert('読み込み失敗: ' + String(error))
    }
  }, [projRel, invokeFn, updateLeftText])

  const openProjectToRight = useCallback(async () => {
    if (!projRel) return
    try {
      const r = await invokeFn<{path:string, content:string}>('read_project_file', { relPath: projRel })
      setRightText(r.content)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '')
      alert('読み込み失敗: ' + message)
    }
  }, [projRel, invokeFn])

  const saveLeftToProject = useCallback(async () => {
    if (!projRel) return
    try {
      await invokeFn<string>('write_project_file', { relPath: projRel, content: leftText })
      alert('保存しました: project/' + projRel)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '')
      alert('保存失敗: ' + message)
    }
  }, [projRel, leftText, invokeFn])

  const saveRightToProject = useCallback(async () => {
    if (!projRel) return
    try {
      await invokeFn<string>('write_project_file', { relPath: projRel, content: rightText })
      alert('保存しました: project/' + projRel)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '')
      alert('保存失敗: ' + message)
    }
  }, [projRel, rightText, invokeFn])

  const listPy = useCallback(async () => {
    try {
      const files = await invokeFn<Array<{path:string,name:string,size:number}>>('list_project_files', { exts: ['py'] })
      alert(files.map(f => f.path).join('\n') || '(なし)')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '')
      alert('一覧失敗: ' + message)
    }
  }, [invokeFn])

  // ショートカット
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 'Enter') { e.preventDefault(); runOllama() }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveLeftToProject()
      }
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        copy(rightText)
      }

      let preventOverlayToggle = false
      setShowKeybindOverlay(prev => {
        const next = resolveKeybindOverlayState(prev, e)
        if (next !== prev) preventOverlayToggle = true
        return next
      })
      if (preventOverlayToggle) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [runOllama, copy, saveLeftToProject, rightText])

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>PromptForge</h1>

      <div className="toolbar" style={{ gap: 12, margin: '12px 0' }}>
        <button type="button" className={`btn${highContrast ? ' primary' : ''}`} data-testid="high-contrast-toggle" aria-pressed={highContrast} onClick={() => setHighContrast(prev => !prev)}>
          ハイコントラスト: {highContrast ? 'ON' : 'OFF'}
        </button>
        <label className="toolbar" style={{ gap: 8, alignItems: 'center' }}>
          <span className="badge">字間・行間</span>
          <select
            value={typographyPreset}
            onChange={event => {
              const next = event.target.value
              if (TYPOGRAPHY_PRESETS.some(option => option.id === next)) setTypographyPreset(next as TypographyPreset)
            }}
          >
            {TYPOGRAPHY_PRESETS.map(option => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* ファイルバー（project/ サンドボックス） */}
      <div className="filebar">
        <div className="badge">project/</div>
        <input style={{ width: 340 }} value={projRel} onChange={e => setProjRel(e.target.value)} placeholder="src/example.py" />
        <button className="btn" onClick={listPy}>.py一覧</button>
        <button className="btn" onClick={openProjectToLeft}>← 左に開く</button>
        <button className="btn" onClick={openProjectToRight}>→ 右に開く</button>
        <button className="btn" onClick={saveLeftToProject}>左を保存（Ctrl/Cmd+S）</button>
        <button className="btn" onClick={saveRightToProject}>右を保存</button>
      </div>

      <div className="toolbar" style={{ gap: 12, margin: '12px 0' }}>
        <div className="badge">corpus/</div>
        <input
          ref={corpusInputRef}
          data-testid="corpus-path-input"
          style={{ width: 320 }}
          value={corpusRel}
          onChange={e => setCorpusRel(e.target.value)}
          placeholder="lore/story.txt"
        />
        <button data-testid="load-excerpt-button" className="btn" onClick={loadDocExcerpt}>
          抜粋読込
        </button>
        {docExcerptStatus === 'loading' && <span className="badge">読込中...</span>}
        {docExcerptStatus === 'success' && <span className="badge">読込済</span>}
        {docExcerptStatus === 'error' && <span className="badge">読込失敗</span>}
      </div>

      {docExcerpt && (
        <div
          data-testid="excerpt-preview"
          style={{
            background: '#f4f4f4',
            color: '#222',
            padding: 12,
            borderRadius: 4,
            marginBottom: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12 }}>
            <span>SHA-256: {docExcerpt.sha256}</span>
            <span>Bytes: {docExcerpt.used_bytes} / {docExcerpt.size_bytes}</span>
            <span>TRUNCATED: {docExcerpt.truncated ? 'YES' : 'NO'}</span>
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{docExcerpt.excerpt}</pre>
        </div>
      )}

      {docExcerptStatus === 'error' && docExcerptError && (
        <div style={{ marginBottom: 12, color: '#b91c1c', fontSize: 12 }}>Error: {docExcerptError}</div>
      )}

      {/* セットアップバナー */}
      {showSetupBanner && (
        <div
          data-testid="setup-banner"
          className="toolbar"
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            borderRadius: 4,
            background: '#fef3c7',
            color: '#92400e',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12
          }}
        >
          <span style={{ fontSize: 13 }}>{setupGuidance}</span>
          <button
            data-testid="setup-banner-retry"
            className="btn"
            onClick={() => {
              void retrySetupCheck()
            }}
          >
            リトライ
          </button>
        </div>
      )}

      {/* 上部ツールバー */}
      <div className="toolbar" style={{ marginBottom: 12, justifyContent:'space-between' }}>
        <div className="toolbar" style={{ gap:12 }}>
          <div>
            <div className="badge">Recipe</div>
            <input style={{ width: 360 }} value={recipePath} onChange={e => setRecipePath(e.target.value)} />
          </div>
          <div>
            <div className="badge">Model</div>
            <input style={{ width: 180 }} value={ollamaModel} onChange={e => setOllamaModel(e.target.value)} />
          </div>
          <div>
            <div className="badge">Params (goal/tone/steps)</div>
            <div className="toolbar">
              <input placeholder="goal"  value={params.goal as string}  onChange={e => setParams(p => ({...p, goal: e.target.value}))} />
              <input placeholder="tone"  value={params.tone as string}  onChange={e => setParams(p => ({...p, tone: e.target.value}))} />
              <input placeholder="steps" type="number" value={params.steps as number} onChange={e => setParams(p => ({...p, steps: Number(e.target.value)}))} />
            </div>
          </div>
        </div>

        <div className="right-actions">
          {hasDangerWords && (
            <span className="badge" data-testid="danger-words-badge">⚠ 危険語を含む</span>
          )}
          <label className="toolbar" style={{ gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={sendSelectionOnly} onChange={e => setSendSelectionOnly(e.target.checked)} />
            <span>選択のみ送る</span>
            <span className="badge">{formatSelectionSummary(sendSelectionOnly, leftSelection, sanitizedPreview)}</span>
          </label>
          {userInputWarnings.maskedTypes.length > 0 && (
            <span className="badge" data-testid="mask-warning">秘密情報をマスクしました</span>
          )}
          {userInputWarnings.maskedTypes.length > 0 && (
            <span className="badge" style={{ fontSize: 11 }}>
              {userInputWarnings.maskedTypes.join(', ')}
            </span>
          )}
          {userInputWarnings.overLimit && (
            <span className="badge" data-testid="limit-warning">4万字超</span>
          )}
          <details style={{ maxWidth: 280 }}>
            <summary>送信範囲プレビュー</summary>
            <pre style={{ marginTop: 8, maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{sanitizedPreview || '(なし)'}</pre>
          </details>
          {composed && <div className="badge">SHA-256: {composed.sha256.slice(0,16)}…</div>}
          {isStreaming && <span>Streaming...</span>}
          <button className="btn" onClick={abortStream} disabled={!isStreaming}>停止</button>
          <button ref={runBtnRef} className={`btn primary runpulse ${running ? 'active' : ''}`} onClick={runOllama} disabled={isStreaming}>
            ▶ 実行（Ctrl/Cmd+Enter）
          </button>
        </div>
      </div>

      {ollamaError && (
        <div
          role="alert"
          data-testid="ollama-error-banner"
          className="toolbar"
          style={{ margin: '12px 0', padding: '12px 16px', background: '#fdecea', color: '#611a15', justifyContent: 'space-between' }}
        >
          <span>{ollamaError}</span>
          <div className="toolbar" style={{ gap: 8 }}>
            <button className="btn" type="button" data-testid="ollama-error-dismiss" onClick={resetOllamaError}>
              閉じる
            </button>
            <button className="btn primary" type="button" onClick={runOllama}>
              再試行
            </button>
          </div>
        </div>
      )}

      {/* 分割ビュー */}
      <div className="split">
        {/* 左：入力 */}
        <div className="panel">
          <h3>
            <span>入力</span>
            <span className="toolbar">
              <button className="btn" onClick={() => writeText(leftText)}>コピー</button>
              <button className="btn" onClick={() => saveAs('left.txt', leftText)}>別名保存</button>
            </span>
          </h3>
          <div className="area">
            <textarea
              data-side="left"
              ref={leftTextRef}
              value={leftText}
              onSelect={e => handleLeftSelection(e.currentTarget)}
              onChange={handleLeftChange}
              onInput={handleLeftChange}
            />
          </div>
        </div>

        {/* 右：LLM整形出力 */}
        <div className="panel">
          <h3>
            <span>LLM（整形出力）</span>
            <span className="toolbar">
              <button className="btn" onClick={openDiffPreview}>⇧ 反映</button>
              <button className="btn" onClick={() => writeText(rightText)}>コピー</button>
              <button className="btn" onClick={() => saveAs('right.txt', rightText)}>別名保存</button>
            </span>
          </h3>
          <div className="area">
            <textarea data-side="right" value={rightText} onChange={e => setRightText(e.target.value)} />
          </div>
        </div>
      </div>

      <KeybindOverlay open={showKeybindOverlay} onClose={() => setShowKeybindOverlay(false)} />

      {diffPatch && (
        <div className="diff-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="diff-modal" style={{ background: '#fff', color: '#222', padding: 24, width: 'min(720px, 90vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: 0 }}>差分プレビュー</h3>
            <pre data-testid="diff-preview" style={{ margin: 0, padding: 12, background: '#111', color: '#0f0', overflow: 'auto', fontSize: 12, lineHeight: 1.5 }}>{diffPatch}</pre>
            <div className="toolbar" style={{ justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn primary" onClick={confirmDiffPreview}>承認</button>
              <button className="btn" onClick={cancelDiffPreview}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
