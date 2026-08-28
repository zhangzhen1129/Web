import assert from 'node:assert/strict'
import test from 'node:test'
import { createNativeThirdPartySdkIdentifiersBootstrap } from './nativeThirdPartySdkIdentifiersBootstrap.js'

test('persists complete SDK identifiers through the application-level consumer', () => {
  let consumer
  let callCount = 0
  const writes = []
  const bootstrap = createNativeThirdPartySdkIdentifiersBootstrap((nextConsumer) => {
    callCount += 1
    consumer = nextConsumer
    return 'request-1'
  })
  const store = { setGlobal(value) { writes.push(value); return true } }

  assert.equal(bootstrap.request(store), 'request-1')
  assert.equal(bootstrap.request(store), 'request-1')
  assert.equal(callCount, 1)
  consumer({
    status: 'success',
    afId: 'redacted-apps-flyer-id',
    fbId: 'redacted-firebase-id',
    gaId: 'redacted-advertising-id',
  })

  assert.deepEqual(writes, [{
    afId: 'redacted-apps-flyer-id',
    fbId: 'redacted-firebase-id',
    gaId: 'redacted-advertising-id',
  }])
  assert.equal(bootstrap.getState(), 'completed')
  assert.equal(bootstrap.request(store), null)
})

test('persists only available partial-success identifiers', () => {
  let consumer
  const writes = []
  const bootstrap = createNativeThirdPartySdkIdentifiersBootstrap((nextConsumer) => {
    consumer = nextConsumer
    return 'request-1'
  })

  bootstrap.request({ setGlobal(value) { writes.push(value); return true } })
  consumer({
    status: 'partial_success',
    afId: 'redacted-apps-flyer-id',
    fbId: '',
  })

  assert.deepEqual(writes, [{ afId: 'redacted-apps-flyer-id' }])
})

test('does not persist failed, empty, or invalid replies', () => {
  for (const reply of [
    { status: 'error' },
    { status: 'success' },
    { status: 'partial_success', gaId: 123 },
  ]) {
    let consumer
    const writes = []
    const bootstrap = createNativeThirdPartySdkIdentifiersBootstrap((nextConsumer) => {
      consumer = nextConsumer
      return 'request-1'
    })
    bootstrap.request({ setGlobal(value) { writes.push(value); return true } })
    consumer(reply)
    assert.deepEqual(writes, [])
  }
})

test('allows a later attempt when the bridge does not accept the request', () => {
  let callCount = 0
  const bootstrap = createNativeThirdPartySdkIdentifiersBootstrap(() => {
    callCount += 1
    return null
  })
  const store = { setGlobal() { return true } }

  assert.equal(bootstrap.request(store), null)
  assert.equal(bootstrap.request(store), null)
  assert.equal(callCount, 2)
  assert.equal(bootstrap.getState(), 'idle')
})
