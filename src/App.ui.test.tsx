import { strict as assert } from 'node:assert'
import test from 'node:test'
import { composePromptWithSelection, formatSelectionSummary } from './App'

const baseParams: Record<string, unknown> = { goal: '', tone: '', steps: 1, user_input: '' }
const makeInvoke = (calls: Array<{ cmd: string; args?: Record<string, unknown> }>) =>
  async (cmd: string, args?: Record<string, unknown>) => {
    calls.push({ cmd, args })
    if (cmd === 'compose_prompt') return { final_prompt: '', sha256: 'hash', model: 'llama3:8b' }
    return ''
  }

test('選択送信を有効化すると選択部分のみが compose_prompt に渡され概算文字数が表示される', async () => {
  const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = []
  await composePromptWithSelection({
    invokeFn: makeInvoke(calls),
    params: { ...baseParams },
    recipePath: 'recipe.yaml',
    leftText: '左ペイン全体のテキスト',
    sendSelectionOnly: true,
    selection: '選択のみ'
  })
  assert.equal(calls[0]!.cmd, 'compose_prompt')
  assert.equal(((calls[0]!.args as any).inlineParams as any).user_input, '選択のみ')
  assert.equal(formatSelectionSummary(true, 'abc', 'abcdef'), '送信文字数: 約3字')
})

test('選択が空の場合は全文送信にフォールバックし概算文字数も全文に一致する', async () => {
  const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = []
  await composePromptWithSelection({
    invokeFn: makeInvoke(calls),
    params: { ...baseParams },
    recipePath: 'recipe.yaml',
    leftText: 'abcdef',
    sendSelectionOnly: true,
    selection: ''
  })
  assert.equal(((calls[0]!.args as any).inlineParams as any).user_input, 'abcdef')
  assert.equal(formatSelectionSummary(true, '', 'abcdef'), '送信文字数: 約6字')
})
