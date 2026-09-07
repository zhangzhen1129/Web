import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createBusinessHandledError,
  createGlobalBusinessErrorHandler,
  isBusinessHandledError,
  readGlobalBusinessError,
} from './index.js'

function response(code, message = 'server message') {
  return {
    config: { protocolId: 'test.protocol' },
    data: { cyiUgNvO2EPltj: { atY3WWbXIN: code }, pl9xRlV: message },
  }
}

test('reads only the globally handled business codes', () => {
  assert.deepEqual(readGlobalBusinessError(response(4005).data), { code: 4005, message: 'server message' })
  assert.deepEqual(readGlobalBusinessError(response(4006).data), { code: 4006, message: 'server message' })
  assert.equal(readGlobalBusinessError(response(2000).data), null)
  assert.equal(readGlobalBusinessError({ data: {} }), null)
})

test('handles 4005 once, clears state, runs the logout action, and rejects', async () => {
  let resolveDialog
  let clearCount = 0
  let actionCount = 0
  const handler = createGlobalBusinessErrorHandler({
    showDialog: () => new Promise((resolve) => { resolveDialog = resolve }),
    clearState: () => { clearCount += 1 },
    actions: { 4005: () => { actionCount += 1 } },
  })

  const pending = handler.handleResponse(response(4005))
  await Promise.resolve()
  assert.equal(clearCount, 0)
  resolveDialog()
  await assert.rejects(pending, (error) => {
    assert.equal(error.businessCode, 4005)
    assert.equal(error.businessHandled, true)
    return isBusinessHandledError(error)
  })
  assert.equal(clearCount, 1)
  assert.equal(actionCount, 1)
})

test('suppresses concurrent 4006 dialogs and runs the Google Play action once', async () => {
  let resolveDialog
  let dialogCount = 0
  let clearCount = 0
  let actionCount = 0
  const handler = createGlobalBusinessErrorHandler({
    showDialog: () => {
      dialogCount += 1
      return new Promise((resolve) => { resolveDialog = resolve })
    },
    clearState: () => { clearCount += 1 },
    actions: { 4006: () => { actionCount += 1 } },
  })

  const first = handler.handleResponse(response(4006))
  const second = handler.handleResponse(response(4006))
  await Promise.resolve()
  assert.equal(dialogCount, 1)
  resolveDialog()
  await assert.rejects(first)
  await assert.rejects(second)
  assert.equal(clearCount, 0)
  assert.equal(actionCount, 1)
})

test('creates a stable handled error without exposing the response body', () => {
  const error = createBusinessHandledError({ code: 4005, message: 'safe', protocolId: 'p', cause: { secret: 'hidden' } })
  assert.equal(error.businessHandled, true)
  assert.equal(error.protocolId, 'p')
  assert.equal(error.cause, undefined)
  assert.equal(error.displayMessage, 'safe')
})
