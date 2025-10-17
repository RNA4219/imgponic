import test from 'node:test'
import assert from 'node:assert/strict'

import { createDiffPreviewFlow } from './App'

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
