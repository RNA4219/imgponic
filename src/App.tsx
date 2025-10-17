import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import { writeText } from '@tauri-apps/api/clipboard'
import { save } from '@tauri-apps/api/dialog'
import { writeTextFile } from '@tauri-apps/api/fs'
import './app.css'

export type ComposeResult = { final_prompt: string; sha256: string; model: string }
type InvokeFunction = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

export const determineUserInput = (sendSelectionOnly: boolean, selection: string, leftText: string): string =>
  sendSelectionOnly && selection ? selection : leftText

export const composePromptWithSelection = async (
  {
    invokeFn = invoke,
    params,
    recipePath,
    leftText,
    sendSelectionOnly,
    selection
  }: {
    invokeFn?: InvokeFunction
    params: Record<string, unknown>
    recipePath: string
    leftText: string
    sendSelectionOnly: boolean
    selection: string
  }
): Promise<ComposeResult> => {
  const userInput = determineUserInput(sendSelectionOnly, selection, leftText)
  const res = await invokeFn('compose_prompt', { recipePath, inlineParams: { ...params, user_input: userInput } })
  return res as ComposeResult
}

export const formatSelectionSummary = (sendSelectionOnly: boolean, selection: string, leftText: string): string =>
  `送信文字数: 約${determineUserInput(sendSelectionOnly, selection, leftText).length}字`

type Workspace = {
  version: number
  left_text: string
  right_text: string
  recipe_path: string
  model: string
  params: any
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
  const header = '--- 左\n+++ 右\n@@'
  if (before === after) return `${header}\n  (差分はありません)`
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  const body = Array.from({ length: Math.max(beforeLines.length, afterLines.length) }, (_, idx) => {
    const left = beforeLines[idx]
    const right = afterLines[idx]
    if (left === right) return ` ${left ?? ''}`
    const minus = left !== undefined ? `-${left}` : ''
    const plus = right !== undefined ? `+${right}` : ''
    return [minus, plus].filter(Boolean).join('\n')
  }).join('\n')
  return `${header}\n${body}`
}

export const createDiffPreviewFlow = (callbacks: DiffPreviewCallbacks) => ({
  open: () => callbacks.show(buildUnifiedDiff(callbacks.readLeft(), callbacks.readRight())),
  confirm: () => (callbacks.apply(callbacks.readRight()), callbacks.close()),
  cancel: () => callbacks.close()
})

export default function App() {
  // 左右ペインのテキスト状態
  const [leftText, setLeftText]   = useState<string>('ここに入力。Ollama整形は右の▶で実行。')
  const [rightText, setRightText] = useState<string>('（ここに整形結果が出ます）')

  // レシピ/モデル
  const [recipePath, setRecipePath] = useState('data/recipes/demo.sora2.yaml')
  const [ollamaModel, setOllamaModel] = useState('llama3:8b')

  // パラメータ
  const [params, setParams] = useState({ goal: '30秒の戦闘シーン', tone: '冷静', steps: 6, user_input: '' })
  const [composed, setComposed] = useState<ComposeResult | null>(null)
  const [diffPatch, setDiffPatch] = useState<string | null>(null)

  // 実行ボタン演出
  const [running, setRunning] = useState(false)
  const runBtnRef = useRef<HTMLButtonElement>(null)
  const leftTextRef = useRef<HTMLTextAreaElement>(null)
  const [sendSelectionOnly, setSendSelectionOnly] = useState<boolean>(false)
  const [leftSelection, setLeftSelection] = useState<string>('')

  // プロジェクトファイルパス（project/ 内相対）
  const [projRel, setProjRel] = useState('src/example.py')

  // === Workspace: Restore on startup ===
  useEffect(() => {
    (async () => {
      try {
        const ws = await invoke<Workspace | null>('read_workspace')
        if (ws) {
          if (ws.left_text) setLeftText(ws.left_text)
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
  }, [])

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
        await invoke<string>('write_workspace', { ws })
      } catch (e) {
        console.warn('workspace save failed', e)
      }
    }, 800)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [leftText, rightText, recipePath, ollamaModel, params, projRel])

  // ヘルパ：コピー／保存
  const copy = useCallback(async (txt: string) => { await writeText(txt) }, [])
  const saveAs = useCallback(async (suggest: string, txt: string) => {
    const p = await save({ defaultPath: suggest })
    if (p) await writeTextFile(p as string, txt)
  }, [])

  // 合成
  const doCompose = useCallback(async () => {
    const res = await composePromptWithSelection({
      params,
      recipePath,
      leftText,
      sendSelectionOnly,
      selection: leftSelection
    })
    setComposed(res)
    return res
  }, [params, recipePath, leftText, sendSelectionOnly, leftSelection])

  // 実行（▶）
  const runOllama = useCallback(async () => {
    setRunning(true)
    runBtnRef.current?.classList.add('active')
    try {
      const c = composed ?? await doCompose()
      const sep = '\n---\nUSER_INPUT'
      const at = c.final_prompt.indexOf(sep)
      const sys = at < 0 ? c.final_prompt : c.final_prompt.slice(0, at)
      const user = at < 0 ? '' : c.final_prompt.slice(at)

      const res = await invoke('run_ollama_chat', {
        model: ollamaModel,
        systemText: sys,
        userText: user
      })
      setRightText(res as string)
    } finally {
      setTimeout(() => runBtnRef.current?.classList.remove('active'), 120)
      setRunning(false)
    }
  }, [composed, doCompose, ollamaModel])

  // 右→左 反映（プレビュー付き）
  const diffFlow = useMemo(() => createDiffPreviewFlow({ readLeft: () => leftText, readRight: () => rightText, show: value => setDiffPatch(value), apply: value => setLeftText(value), close: () => setDiffPatch(null) }), [leftText, rightText])
  const { open: openDiffPreview, confirm: confirmDiffPreview, cancel: cancelDiffPreview } = diffFlow

  const handleLeftSelection = useCallback((target: HTMLTextAreaElement) => {
    const { selectionStart, selectionEnd, value } = target
    setLeftSelection(selectionStart === selectionEnd ? '' : value.slice(selectionStart, selectionEnd))
  }, [])

  const handleLeftChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLeftText(e.target.value)
    handleLeftSelection(e.currentTarget)
  }, [handleLeftSelection])

  // --- Project file helpers ---
  const openProjectToLeft = useCallback(async () => {
    if (!projRel) return
    try {
      const r = await invoke<{path:string, content:string}>('read_project_file', { relPath: projRel })
      setLeftText(r.content)
    } catch (e:any) {
      alert('読み込み失敗: ' + String(e))
    }
  }, [projRel])

  const openProjectToRight = useCallback(async () => {
    if (!projRel) return
    try {
      const r = await invoke<{path:string, content:string}>('read_project_file', { relPath: projRel })
      setRightText(r.content)
    } catch (e:any) {
      alert('読み込み失敗: ' + String(e))
    }
  }, [projRel])

  const saveLeftToProject = useCallback(async () => {
    if (!projRel) return
    try {
      await invoke<string>('write_project_file', { relPath: projRel, content: leftText })
      alert('保存しました: project/' + projRel)
    } catch (e:any) {
      alert('保存失敗: ' + String(e))
    }
  }, [projRel, leftText])

  const saveRightToProject = useCallback(async () => {
    if (!projRel) return
    try {
      await invoke<string>('write_project_file', { relPath: projRel, content: rightText })
      alert('保存しました: project/' + projRel)
    } catch (e:any) {
      alert('保存失敗: ' + String(e))
    }
  }, [projRel, rightText])

  const listPy = useCallback(async () => {
    try {
      const files = await invoke<Array<{path:string,name:string,size:number}>>('list_project_files', { exts: ['py'] })
      alert(files.map(f => f.path).join('\n') || '(なし)')
    } catch (e:any) {
      alert('一覧失敗: ' + String(e))
    }
  }, [])

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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [runOllama, copy, saveLeftToProject, rightText])

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>PromptForge</h1>

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
          <label className="toolbar" style={{ gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={sendSelectionOnly} onChange={e => setSendSelectionOnly(e.target.checked)} />
            <span>選択のみ送る</span>
            <span className="badge">{formatSelectionSummary(sendSelectionOnly, leftSelection, leftText)}</span>
          </label>
          {composed && <div className="badge">SHA-256: {composed.sha256.slice(0,16)}…</div>}
          <button ref={runBtnRef} className={`btn primary runpulse ${running ? 'active' : ''}`} onClick={runOllama} disabled={running}>
            ▶ 実行（Ctrl/Cmd+Enter）
          </button>
        </div>
      </div>

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
            <textarea data-side="left" ref={leftTextRef} value={leftText} onSelect={e => handleLeftSelection(e.currentTarget)} onChange={handleLeftChange} />
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
