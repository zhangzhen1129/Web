import assert from 'node:assert/strict'
import test from 'node:test'
import { createNativeTokenBootstrap } from './nativeTokenBootstrap.js'

test('stores one valid native Token through the application-level consumer', () => {
  let consumer
  let callCount = 0
  const writes = []
  const bootstrap = createNativeTokenBootstrap((nextConsumer) => {
    callCount += 1
    consumer = nextConsumer
    return 'request-1'
  })
  const store = { setGlobal(value) { writes.push(value); return true } }

  assert.equal(bootstrap.request(store), 'request-1')
  assert.equal(bootstrap.request(store), 'request-1')
  assert.equal(callCount, 1)
  consumer({ status: 'completed', hit: true, cacheValue: 'native-token' })
  consumer({ status: 'completed', hit: true, cacheValue: 'duplicate-token' })

  assert.deepEqual(writes, [{ token: 'native-token' }])
  assert.equal(bootstrap.getState(), 'completed')
  assert.equal(bootstrap.request(store), null)
})

test('does not write missing, failed, or malformed native values', () => {
  for (const reply of [
    { status: 'completed', hit: false, cacheValue: 'unused' },
    { status: 'error', hit: true, cacheValue: 'unused' },
    { status: 'completed', hit: true, cacheValue: '' },
  ]) {
    let consumer
    const writes = []
    const bootstrap = createNativeTokenBootstrap((nextConsumer) => {
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
  const bootstrap = createNativeTokenBootstrap(() => {
    callCount += 1
    return null
  })
  const store = { setGlobal() { return true } }

  assert.equal(bootstrap.request(store), null)
  assert.equal(bootstrap.request(store), null)
  assert.equal(callCount, 2)
  assert.equal(bootstrap.getState(), 'idle')
})
