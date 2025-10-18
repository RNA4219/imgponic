import test from 'node:test'
import assert from 'node:assert/strict'

import { composePromptWithSelection, createDiffPreviewFlow, determineUserInput } from './App'

test('determineUserInput returns selection context with line range header', () => {
  const leftText = Array.from({ length: 12 }, (_, idx) => `line-${idx + 1}`).join('\n')
  const selection = 'line-6'
  const selectionStart = leftText.indexOf(selection)
  const result = determineUserInput(true, selection, leftText, selectionStart, selectionStart + selection.length, 3)
  assert.ok(result.startsWith('[Lines 6-6]'))
  assert.ok(result.includes('line-3') && result.includes('line-9') && result.includes(selection))
})

test('determineUserInput falls back to full text without selection', () => {
  const sample = 'a\nb\nc'
  assert.equal(determineUserInput(false, '', sample, null, null, 3), sample)
})

test('composePromptWithSelection forwards enriched selection preview', async () => {
  const leftText = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'].join('\n')
  const selection = 'gamma'
  const selectionStart = leftText.indexOf(selection)
  let capturedUserInput = ''
  const invokeFn = async (_cmd: string, args?: Record<string, unknown>) => {
    capturedUserInput = String((args?.inlineParams as { user_input: string }).user_input)
    return { final_prompt: 'fp', sha256: 'hash', model: 'model' }
  }
  const res = await composePromptWithSelection({
    invokeFn,
    params: {},
    recipePath: 'recipe.yaml',
    leftText,
    sendSelectionOnly: true,
    selection,
    selectionStart,
    selectionEnd: selectionStart + selection.length,
    contextRadius: 3
  })
  const expected = determineUserInput(true, selection, leftText, selectionStart, selectionStart + selection.length, 3)
  assert.equal(capturedUserInput, expected)
  assert.deepEqual(res, { final_prompt: 'fp', sha256: 'hash', model: 'model' })
})

test('diff preview requires approval before applying', () => {
  let left = 'line1\nleft'
  const right = 'line1\nright'
  const patches: string[] = []
  let open = false

  const flow = createDiffPreviewFlow({
    readLeft: () => left,
    readRight: () => right,
    show: patch => {
      open = true
      patches.push(patch)
    },
    apply: next => {
      left = next
    },
    close: () => {
      open = false
    }
  })

  flow.open()
  assert.equal(open, true)
  assert.equal(patches.length, 1)
  assert.ok(patches[0].includes('-left') && patches[0].includes('+right'))
  assert.equal(left, 'line1\nleft')

  flow.cancel()
  assert.equal(open, false)
  assert.equal(left, 'line1\nleft')

  flow.open()
  flow.confirm()
  assert.equal(open, false)
  assert.equal(left, right)
  assert.equal(patches.length, 2)
})
