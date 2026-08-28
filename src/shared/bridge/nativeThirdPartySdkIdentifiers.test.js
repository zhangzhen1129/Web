import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getThirdPartySdkIdentifiers,
  getThirdPartySdkIdentifiersRegistrySize,
} from './nativeThirdPartySdkIdentifiers.js'

function installBridge({ synchronousResult = null, handler } = {}) {
  const calls = []
  globalThis.window = {
    plahub: {
      fetchThirdPartySdkIdentifiers(payload) {
        const request = JSON.parse(payload)
        calls.push(request)
        if (handler) return handler(request)
        return JSON.stringify(synchronousResult ?? {
          action: 'third_party_sdk_identifier_fetch',
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

test('queries SDK identifiers with protocol requestId and shared replyHandler', () => {
  const calls = installBridge()
  const results = []
  const first = getThirdPartySdkIdentifiers((reply) => results.push(reply))
  const second = getThirdPartySdkIdentifiers((reply) => results.push(reply))

  assert.equal(calls.length, 2)
  assert.notEqual(first, second)
  assert.deepEqual(Object.keys(calls[0]).sort(), ['replyHandler', 'requestId'])
  assert.equal(calls[0].requestId, first)
  assert.equal(calls[0].replyHandler, 'window.__dineroProThirdPartySdkIdentifiersReply')
  assert.equal(calls[0].replyHandler, calls[1].replyHandler)
  assert.equal(getThirdPartySdkIdentifiersRegistrySize(), 2)

  const reply = {
    action: 'third_party_sdk_identifier_fetch',
    requestId: first,
    status: 'success',
    message: 'success',
    appsFlyerUid: 'redacted-apps-flyer-uid',
    firebaseAppInstanceId: 'redacted-firebase-id',
    googleAdvertisingId: 'redacted-advertising-id',
  }
  window.__dineroProThirdPartySdkIdentifiersReply(reply)
  assert.deepEqual(results, [{
    status: 'success',
    message: 'success',
    afId: 'redacted-apps-flyer-uid',
    fbId: 'redacted-firebase-id',
    gaId: 'redacted-advertising-id',
  }])
  assert.equal(getThirdPartySdkIdentifiersRegistrySize(), 1)

  window.__dineroProThirdPartySdkIdentifiersReply({
    action: 'third_party_sdk_identifier_fetch',
    requestId: second,
    status: 'partial_success',
    message: 'partial success',
    appsFlyerUid: 'redacted-apps-flyer-uid',
    firebaseAppInstanceId: '',
    googleAdvertisingId: '',
  })
  assert.equal(results.length, 2)
  assert.deepEqual(results[1], {
    status: 'partial_success',
    message: 'partial success',
    afId: 'redacted-apps-flyer-uid',
  })
  assert.equal(getThirdPartySdkIdentifiersRegistrySize(), 0)
  assert.equal(typeof window.__dineroProThirdPartySdkIdentifiersReply, 'undefined')
})

test('delivers the documented error terminal status without requiring identifiers', () => {
  const calls = installBridge()
  const results = []
  const requestId = getThirdPartySdkIdentifiers((reply) => results.push(reply))

  window[calls[0].replyHandler.replace('window.', '')]({
    action: 'third_party_sdk_identifier_fetch',
    requestId,
    status: 'error',
    message: 'failed',
    appsFlyerUid: '',
    firebaseAppInstanceId: '',
    googleAdvertisingId: '',
  })

  assert.equal(results.length, 1)
  assert.deepEqual(results[0], { status: 'error', message: 'failed' })
  assert.equal(getThirdPartySdkIdentifiersRegistrySize(), 0)
})

test('isolates unavailable, unaccepted, malformed, and throwing bridge calls', () => {
  globalThis.window = { dispatchEvent() {} }
  assert.equal(getThirdPartySdkIdentifiers(() => {}), null)
  assert.equal(getThirdPartySdkIdentifiersRegistrySize(), 0)

  installBridge({
    handler(request) {
      return JSON.stringify({
        action: 'third_party_sdk_identifier_fetch',
        requestId: request.requestId,
        status: 'busy',
        message: 'busy',
      })
    },
  })
  assert.equal(getThirdPartySdkIdentifiers(() => {}), null)
  assert.equal(getThirdPartySdkIdentifiersRegistrySize(), 0)

  installBridge({ handler() { return '{invalid-json' } })
  assert.equal(getThirdPartySdkIdentifiers(() => {}), null)
  assert.equal(getThirdPartySdkIdentifiersRegistrySize(), 0)

  globalThis.window = {
    dispatchEvent() {},
    plahub: { fetchThirdPartySdkIdentifiers() { throw new Error('host failure') } },
  }
  assert.equal(getThirdPartySdkIdentifiers(() => {}), null)
  assert.equal(getThirdPartySdkIdentifiersRegistrySize(), 0)
})

test('rejects malformed and unknown callbacks without delivering data', () => {
  const calls = installBridge()
  const results = []
  const requestId = getThirdPartySdkIdentifiers((reply) => results.push(reply))
  const callback = window[calls[0].replyHandler.replace('window.', '')]

  callback({
    action: 'third_party_sdk_identifier_fetch',
    requestId,
    status: 'success',
    message: 'invalid identifier',
    googleAdvertisingId: 123,
  })
  assert.deepEqual(results, [])
  assert.equal(getThirdPartySdkIdentifiersRegistrySize(), 0)

  callback({
    action: 'third_party_sdk_identifier_fetch',
    requestId: 'unknown',
    status: 'success',
    message: 'unknown',
  })
  assert.deepEqual(results, [])
})

test('rejects a success payload when documented Android identifier fields are missing', () => {
  const calls = installBridge()
  const results = []
  const requestId = getThirdPartySdkIdentifiers((reply) => results.push(reply))
  const callback = window[calls[0].replyHandler.replace('window.', '')]

  callback({
    action: 'third_party_sdk_identifier_fetch',
    requestId,
    status: 'success',
    message: 'renamed native fields',
  })

  assert.deepEqual(results, [])
  assert.equal(getThirdPartySdkIdentifiersRegistrySize(), 0)
})

test('does not overwrite an existing controlled callback', () => {
  const calls = installBridge()
  const existing = () => {}
  window.__dineroProThirdPartySdkIdentifiersReply = existing

  assert.equal(getThirdPartySdkIdentifiers(() => {}), null)
  assert.equal(calls.length, 0)
  assert.equal(getThirdPartySdkIdentifiersRegistrySize(), 0)
  assert.equal(window.__dineroProThirdPartySdkIdentifiersReply, existing)
})
