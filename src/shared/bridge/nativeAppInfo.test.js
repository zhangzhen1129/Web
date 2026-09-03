import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getNativeAppInfo,
  getNativeAppInfoRegistrySize,
} from './nativeAppInfo.js'

function installBridge({ synchronousResult = null, handler } = {}) {
  const calls = []
  globalThis.window = {
    plahub: {
      fetchAppInfo(payload) {
        const request = JSON.parse(payload)
        calls.push(request)
        if (handler) return handler(request)
        return JSON.stringify(synchronousResult ?? {
          action: 'app_info_fetch',
          requestId: request.requestId,
          status: 'accepted',
          message: 'accepted',
        })
      },
    },
    dispatchEvent() {},
  }
  return calls
}

test.afterEach(() => { delete globalThis.window })

test('queries app info with a fresh request and shared callback', () => {
  const calls = installBridge()
  const results = []
  const first = getNativeAppInfo((reply) => results.push(reply))
  const second = getNativeAppInfo((reply) => results.push(reply))

  assert.equal(calls.length, 2)
  assert.notEqual(first, second)
  assert.equal(calls[0].replyHandler, 'window.__dineroProAppInfoReply')
  assert.equal(calls[0].replyHandler, calls[1].replyHandler)
  assert.equal(getNativeAppInfoRegistrySize(), 2)

  const reply = {
    action: 'app_info_fetch',
    requestId: first,
    status: 'success',
    message: 'success',
    packageId: 'com.example.app',
    packageName: 'Example',
    appVersion: '12',
    appVersionName: '1.2.0',
    appName: 'Example',
    androidId: 'redacted-android-id',
  }
  window.__dineroProAppInfoReply(reply)
  assert.deepEqual(results, [reply])
  assert.equal(getNativeAppInfoRegistrySize(), 1)

  window.__dineroProAppInfoReply(reply)
  assert.deepEqual(results, [reply])
  window.__dineroProAppInfoReply({ action: 'app_info_fetch', requestId: second, status: 'error', message: 'failed' })
  assert.equal(getNativeAppInfoRegistrySize(), 0)
  assert.equal(typeof window.__dineroProAppInfoReply, 'undefined')
})

test('isolates unavailable, rejected, malformed, and throwing bridge calls', () => {
  globalThis.window = { dispatchEvent() {} }
  assert.equal(getNativeAppInfo(() => {}), null)
  assert.equal(getNativeAppInfoRegistrySize(), 0)

  installBridge({
    handler(request) {
      return JSON.stringify({ action: 'app_info_fetch', requestId: request.requestId, status: 'busy', message: 'busy' })
    },
  })
  assert.equal(getNativeAppInfo(() => {}), null)
  assert.equal(getNativeAppInfoRegistrySize(), 0)

  installBridge({
    handler() { return '{invalid-json' },
  })
  assert.equal(getNativeAppInfo(() => {}), null)
  assert.equal(getNativeAppInfoRegistrySize(), 0)

  globalThis.window = {
    dispatchEvent() {},
    plahub: { fetchAppInfo() { throw new Error('host failure') } },
  }
  assert.equal(getNativeAppInfo(() => {}), null)
  assert.equal(getNativeAppInfoRegistrySize(), 0)
})

test('rejects callbacks with missing required app fields and unknown requests', () => {
  const calls = installBridge()
  const results = []
  const requestId = getNativeAppInfo((reply) => results.push(reply))
  const callback = window[calls[0].replyHandler.replace('window.', '')]

  callback({ action: 'app_info_fetch', requestId, status: 'success', message: 'missing fields' })
  assert.deepEqual(results, [])
  assert.equal(getNativeAppInfoRegistrySize(), 0)

  callback({ action: 'app_info_fetch', requestId: 'unknown', status: 'success', message: 'unknown' })
  assert.deepEqual(results, [])
})

test('does not overwrite an existing controlled callback', () => {
  const calls = installBridge()
  const existing = () => {}
  window.__dineroProAppInfoReply = existing
  assert.equal(getNativeAppInfo(() => {}), null)
  assert.equal(calls.length, 0)
  assert.equal(getNativeAppInfoRegistrySize(), 0)
  assert.equal(window.__dineroProAppInfoReply, existing)
})

test('does not delete a replacement function while cleaning a shared callback record', () => {
  const calls = installBridge()
  const requestId = getNativeAppInfo(() => {})
  const registeredCallback = window.__dineroProAppInfoReply
  const replacement = () => {}
  window.__dineroProAppInfoReply = replacement

  registeredCallback({
    action: 'app_info_fetch',
    requestId,
    status: 'success',
    message: 'success',
    packageId: 'com.example.app',
    packageName: 'Example',
    appVersion: '12',
    appVersionName: '1.2.0',
    appName: 'Example',
    androidId: 'redacted-android-id',
  })

  assert.equal(calls.length, 1)
  assert.equal(getNativeAppInfoRegistrySize(), 0)
  assert.equal(window.__dineroProAppInfoReply, replacement)
})
