import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'

import App from './App'

const invokeResponses: Record<string, unknown> = {
  compose_prompt: { final_prompt: 'system\n---\nUSER_INPUT', sha256: 'hash', model: 'mock' },
  run_ollama_chat: 'ok',
  write_workspace: '',
  list_project_files: [],
  write_project_file: ''
}
const invokeMock = vi.fn(async (cmd: string) => (cmd === 'read_workspace' ? null : invokeResponses[cmd] ?? null))

vi.mock('@tauri-apps/api/tauri', () => ({ invoke: (...args: [string, unknown?]) => invokeMock(...args) }))
vi.mock('@tauri-apps/api/clipboard', () => ({ writeText: vi.fn() }))
vi.mock('@tauri-apps/api/dialog', () => ({ save: vi.fn(async () => null) }))
vi.mock('@tauri-apps/api/fs', () => ({ writeTextFile: vi.fn() }))

describe('App focus controls', () => {
  it('keeps shortcuts functional while toggling focus via button and hotkey', async () => {
    invokeMock.mockClear()
    const user = userEvent.setup()
    render(<App />)

    const left = await screen.findByTestId('left-editor')
    const right = screen.getByTestId('right-editor')
    const focusButton = screen.getByRole('button', { name: /フォーカス/ })
    const ctrlShiftF = '{Control>}{Shift>}F{/Shift}{/Control}'
    const steps: Array<[() => Promise<void>, boolean, boolean]> = [
      [() => user.click(focusButton), true, false],
      [() => user.click(focusButton), true, true],
      [() => user.click(left), true, true],
      [() => user.keyboard(ctrlShiftF), true, false],
      [() => user.keyboard(ctrlShiftF), false, true],
      [() => user.keyboard(ctrlShiftF), true, false],
      [() => user.keyboard('{Meta>}{Shift>}F{/Shift}{/Meta}'), false, true],
      [() => user.click(focusButton), true, true]
    ]

    for (const [act, l, r] of steps) {
      await act()
      expect(left).toHaveStyle(l ? '' : 'display: none')
      expect(right).toHaveStyle(r ? '' : 'display: none')
    }

    await user.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('run_ollama_chat', expect.objectContaining({ model: expect.any(String) }))
    })
  })
})
