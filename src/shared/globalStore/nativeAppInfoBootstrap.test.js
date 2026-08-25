import assert from 'node:assert/strict'
import test from 'node:test'
import { createNativeAppInfoBootstrap } from './nativeAppInfoBootstrap.js'

const appInfoReply = {
  status: 'success',
  packageId: 'com.platarap.app',
  packageName: 'PlataRap',
  appVersion: '42',
  appVersionName: '1.2.0',
  appName: 'PlataRap',
  androidId: 'redacted-android-id',
}

test('persists one complete native App info payload through the application-level consumer', () => {
  let consumer
  let callCount = 0
  const writes = []
  const bootstrap = createNativeAppInfoBootstrap((nextConsumer) => {
    callCount += 1
    consumer = nextConsumer
    return 'request-1'
  })
  const store = { setGlobal(value) { writes.push(value); return true } }

  assert.equal(bootstrap.request(store), 'request-1')
  assert.equal(bootstrap.request(store), 'request-1')
  assert.equal(callCount, 1)
  consumer(appInfoReply)
  consumer(appInfoReply)

  assert.deepEqual(writes, [{
    packageId: 'com.platarap.app',
    packageName: 'PlataRap',
    appVersion: '42',
    appVersionName: '1.2.0',
    appName: 'PlataRap',
    androidId: 'redacted-android-id',
  }])
  assert.equal(bootstrap.getState(), 'completed')
  assert.equal(bootstrap.request(store), null)
})

test('does not persist incomplete or failed native App info', () => {
  for (const reply of [
    { status: 'error' },
    { ...appInfoReply, appVersionName: '' },
    { ...appInfoReply, androidId: undefined },
  ]) {
    let consumer
    const writes = []
    const bootstrap = createNativeAppInfoBootstrap((nextConsumer) => {
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
  const bootstrap = createNativeAppInfoBootstrap(() => {
    callCount += 1
    return null
  })
  const store = { setGlobal() { return true } }

  assert.equal(bootstrap.request(store), null)
  assert.equal(bootstrap.request(store), null)
  assert.equal(callCount, 2)
  assert.equal(bootstrap.getState(), 'idle')
})
