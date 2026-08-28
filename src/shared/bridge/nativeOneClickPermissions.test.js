import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getNativeOneClickPermissionRegistrySize,
  requestNativeOneClickPermissions,
} from './nativeOneClickPermissions.js'

function installBridge({ synchronousResult = null, handler } = {}) {
  const calls = []
  globalThis.window = {
    plahub: {
      requestOneClickPermissions(payload) {
        const request = JSON.parse(payload)
        calls.push(request)
        if (handler) return handler(request)
        return JSON.stringify(synchronousResult ?? {
          action: 'requestOneClickPermissions',
          requestId: request.requestId,
          status: 'accepted',
          message: '',
        })
      },
    },
    dispatchEvent() {},
  }
  return calls
}

test.afterEach(() => { delete globalThis.window })

test('registers a per-call callback and clears it after the Android reply', () => {
  const calls = installBridge()
  const results = []
  const requestId = requestNativeOneClickPermissions(
    ['sms', 'callLog', 'sms'],
    (reply) => results.push(reply),
  )

  assert.equal(calls.length, 1)
  assert.equal(calls[0].requestId, requestId)
  assert.deepEqual(calls[0].permissions, ['sms', 'callLog'])
  assert.match(calls[0].replyHandler, /^window\.__dineroProOneClickPermissionReply_[a-z0-9]+$/)
  assert.equal(getNativeOneClickPermissionRegistrySize(), 1)

  const callbackName = calls[0].replyHandler.replace('window.', '')
  window[callbackName]({ requestId, status: 'all_granted', message: 'granted' })

  assert.deepEqual(results, [{ requestId, status: 'all_granted', message: 'granted' }])
  assert.equal(getNativeOneClickPermissionRegistrySize(), 0)
  assert.equal(typeof window[callbackName], 'undefined')
})

test('keeps an accepted request registered until Android invokes its callback', () => {
  const calls = installBridge()
  const requestId = requestNativeOneClickPermissions(['sms'])
  assert.ok(requestId)
  assert.equal(getNativeOneClickPermissionRegistrySize(), 1)
  window[calls[0].replyHandler.replace('window.', '')]({ requestId, status: 'all_granted', message: 'granted' })
  assert.equal(getNativeOneClickPermissionRegistrySize(), 0)
})

test('isolates invalid input, unavailable hosts, and unaccepted synchronous results', () => {
  installBridge()
  assert.equal(requestNativeOneClickPermissions([]), null)
  assert.equal(requestNativeOneClickPermissions(['unknown']), null)
  assert.equal(requestNativeOneClickPermissions(['sms'], 'not-a-function'), null)
  assert.equal(getNativeOneClickPermissionRegistrySize(), 0)

  globalThis.window = { dispatchEvent() {} }
  assert.equal(requestNativeOneClickPermissions(['sms']), null)
  assert.equal(getNativeOneClickPermissionRegistrySize(), 0)

  installBridge({
    handler(request) {
      return JSON.stringify({
        action: 'requestOneClickPermissions',
        requestId: request.requestId,
        status: 'busy',
        message: 'busy',
      })
    },
  })
  assert.equal(requestNativeOneClickPermissions(['sms']), null)
  assert.equal(getNativeOneClickPermissionRegistrySize(), 0)

  installBridge({ handler() { return '{invalid-json' } })
  assert.equal(requestNativeOneClickPermissions(['sms']), null)
  assert.equal(getNativeOneClickPermissionRegistrySize(), 0)
})

test('cleans matching malformed callbacks and ignores duplicate or unknown callbacks', () => {
  const calls = installBridge()
  const results = []
  const firstRequestId = requestNativeOneClickPermissions(['sms'], (reply) => results.push(reply))
  const firstCallback = window[calls[0].replyHandler.replace('window.', '')]

  firstCallback({ requestId: firstRequestId, status: 'all_granted' })
  assert.equal(getNativeOneClickPermissionRegistrySize(), 0)
  assert.deepEqual(results, [])

  const secondRequestId = requestNativeOneClickPermissions(['camera'], (reply) => results.push(reply))
  const secondCallback = window[calls[1].replyHandler.replace('window.', '')]
  secondCallback({ requestId: 'unknown', status: 'all_granted', message: 'unknown' })
  assert.equal(getNativeOneClickPermissionRegistrySize(), 1)
  assert.deepEqual(results, [])

  secondCallback({ requestId: secondRequestId, status: 'all_granted', message: 'late' })
  assert.deepEqual(results, [{ requestId: secondRequestId, status: 'all_granted', message: 'late' }])
  assert.equal(getNativeOneClickPermissionRegistrySize(), 0)
})
