import assert from 'node:assert/strict'
import test from 'node:test'
import { createIdentityAdvanceLivePort } from './identityAdvanceLivePort.js'

test('exposes an open-only business port while keeping the opaque handle internal', () => {
  const calls = []
  let nativeConsumer
  const results = []
  const port = createIdentityAdvanceLivePort({
    onResult: (result) => results.push(result),
    openNative: (url, consumer, options) => {
      calls.push(['open', url, typeof consumer, typeof options.onFailure])
      nativeConsumer = consumer
      return 'opaque-consumer-handle'
    },
    detachNative: (handle) => { calls.push(['detach', handle]); return true },
  })
  assert.equal(port.open('https://trusted.example/live'), true)
  assert.equal(port.isActive(), true)
  assert.equal(port.open('https://trusted.example/duplicate'), false)
  assert.deepEqual(calls, [['open', 'https://trusted.example/live', 'function', 'function']])
  nativeConsumer({ type: 1 })
  assert.deepEqual(results, [{ type: 1 }])
  assert.equal(port.isActive(), false)
})

test('detaches using the internal handle and suppresses future business ownership', () => {
  const calls = []
  const port = createIdentityAdvanceLivePort({
    openNative: () => 'internal-handle',
    detachNative: (handle) => { calls.push(handle); return true },
  })
  assert.equal(port.open('https://trusted.example/live'), true)
  assert.equal(port.detach(), true)
  assert.equal(port.detach(), false)
  assert.deepEqual(calls, ['internal-handle'])
  assert.equal(port.isActive(), false)
})

test('delivers controlled open failures without retaining a handle', () => {
  const failures = []
  let nativeFailure
  const port = createIdentityAdvanceLivePort({
    onFailure: (failure) => failures.push(failure),
    openNative: (url, consumer, options) => { nativeFailure = options.onFailure; return null },
  })
  assert.equal(port.open('https://rejected.example/live'), false)
  nativeFailure({ code: 'BRIDGE_NOT_ACCEPTED' })
  assert.deepEqual(failures, [{ code: 'BRIDGE_NOT_ACCEPTED' }])
  assert.equal(port.isActive(), false)
})
