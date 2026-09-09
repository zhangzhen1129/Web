import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cancelNativeContactConsumer,
  getNativeContactRegistrySize,
  selectContactNative,
} from './nativeContact.js'

const ERROR_STATUSES = [
  'ERR_USER_CANCELLED',
  'ERR_NO_PHONE_NUMBER',
  'ERR_PICK_FAILED',
  'ERR_PICKER_UNAVAILABLE',
]

function createReply(requestId, status = 'SUCCESS') {
  return {
    action: 'pick_contact',
    requestId,
    status,
    message: 'terminal',
    contactResult: status === 'SUCCESS'
      ? { name: '<contact-name>', phoneNumber: '<contact-phone>' }
      : {},
  }
}

function installBridge({ rawResult, handler } = {}) {
  const calls = []
  globalThis.window = {
    plahub: {
      selectContact(payload) {
        const request = JSON.parse(payload)
        calls.push(request)
        if (handler) return handler(request)
        if (typeof rawResult !== 'undefined') return rawResult
        return JSON.stringify({
          action: 'pick_contact',
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

test('registers a unique per-call callback and delivers a valid success once', () => {
  const calls = installBridge()
  const results = []
  const failures = []
  const requestId = selectContactNative(
    (reply) => results.push(reply),
    { onFailure: (failure) => failures.push(failure) },
  )

  assert.equal(calls.length, 1)
  assert.equal(requestId, calls[0].requestId)
  assert.ok(requestId.length <= 64)
  assert.deepEqual(Object.keys(calls[0]).sort(), ['replyHandler', 'requestId'])
  assert.match(calls[0].replyHandler, /^window\.__dineroProContactReply_[a-z0-9]+$/)
  assert.equal(getNativeContactRegistrySize(), 1)

  const callbackName = calls[0].replyHandler.slice('window.'.length)
  const callback = window[callbackName]
  const reply = createReply(requestId)
  callback(reply)
  callback(reply)

  assert.deepEqual(results, [reply])
  assert.deepEqual(failures, [])
  assert.equal(getNativeContactRegistrySize(), 0)
  assert.equal(typeof window[callbackName], 'undefined')
})

test('delivers every documented Android error as a business result', () => {
  for (const status of ERROR_STATUSES) {
    const calls = installBridge()
    const results = []
    const failures = []
    const requestId = selectContactNative(
      (reply) => results.push(reply),
      { onFailure: (failure) => failures.push(failure) },
    )
    const callbackName = calls[0].replyHandler.slice('window.'.length)
    const reply = createReply(requestId, status)

    window[callbackName](reply)

    assert.deepEqual(results, [reply])
    assert.deepEqual(failures, [])
    assert.equal(getNativeContactRegistrySize(), 0)
  }
})

test('reports invalid arguments and unavailable Bridge methods without registration', () => {
  installBridge()
  const invalidFailures = []
  assert.equal(selectContactNative(null, {
    onFailure: (failure) => invalidFailures.push(failure),
  }), null)
  assert.deepEqual(invalidFailures, [{ code: 'INVALID_ARGUMENT', capability: 'selectContact' }])
  assert.equal(selectContactNative(() => {}, { onFailure: 'invalid' }), null)

  delete globalThis.window
  const unavailableFailures = []
  assert.equal(selectContactNative(() => {}, {
    onFailure: (failure) => unavailableFailures.push(failure),
  }), null)
  assert.deepEqual(unavailableFailures, [{ code: 'BRIDGE_UNAVAILABLE', capability: 'selectContact' }])

  globalThis.window = { plahub: {}, dispatchEvent() {} }
  assert.equal(selectContactNative(() => {}, {
    onFailure: (failure) => unavailableFailures.push(failure),
  }), null)
  assert.equal(unavailableFailures.length, 2)
  assert.equal(getNativeContactRegistrySize(), 0)
})

test('maps callback registration and serialization failures to BRIDGE_CALL_FAILED', () => {
  let bridgeCalls = 0
  const baseWindow = {
    plahub: { selectContact() { bridgeCalls += 1 } },
    dispatchEvent() {},
  }
  globalThis.window = new Proxy(baseWindow, {
    get(target, property, receiver) {
      if (typeof property === 'string' && property.startsWith('__dineroProContactReply_')) {
        return () => {}
      }
      return Reflect.get(target, property, receiver)
    },
  })
  const registrationFailures = []
  assert.equal(selectContactNative(() => {}, {
    onFailure: (failure) => registrationFailures.push(failure),
  }), null)
  assert.deepEqual(registrationFailures, [{ code: 'BRIDGE_CALL_FAILED', capability: 'selectContact' }])
  assert.equal(bridgeCalls, 0)

  globalThis.window = new Proxy(baseWindow, {
    set(target, property, value, receiver) {
      if (typeof property === 'string' && property.startsWith('__dineroProContactReply_')) {
        throw new Error('registration failed')
      }
      return Reflect.set(target, property, value, receiver)
    },
  })
  const assignmentFailures = []
  assert.equal(selectContactNative(() => {}, {
    onFailure: (failure) => assignmentFailures.push(failure),
  }), null)
  assert.deepEqual(assignmentFailures, [{ code: 'BRIDGE_CALL_FAILED', capability: 'selectContact' }])
  assert.equal(bridgeCalls, 0)

  installBridge({ handler: () => { bridgeCalls += 1 } })
  const originalStringify = JSON.stringify
  const serializationFailures = []
  try {
    JSON.stringify = () => { throw new Error('serialization failed') }
    assert.equal(selectContactNative(() => {}, {
      onFailure: (failure) => serializationFailures.push(failure),
    }), null)
  } finally {
    JSON.stringify = originalStringify
  }
  assert.deepEqual(serializationFailures, [{ code: 'BRIDGE_CALL_FAILED', capability: 'selectContact' }])
  assert.equal(bridgeCalls, 0)
  assert.equal(getNativeContactRegistrySize(), 0)
})

test('separates non-acceptance from malformed and throwing synchronous results', () => {
  const scenarios = [
    {
      expected: 'BRIDGE_NOT_ACCEPTED',
      handler: (request) => JSON.stringify({
        action: 'pick_contact',
        requestId: request.requestId,
        status: 'busy',
        message: 'busy',
      }),
    },
    { expected: 'BRIDGE_CALL_FAILED', rawResult: 'not-json' },
    { expected: 'BRIDGE_CALL_FAILED', rawResult: JSON.stringify({ status: 'accepted' }) },
    { expected: 'BRIDGE_CALL_FAILED', handler: () => { throw new Error('host failed') } },
  ]

  for (const scenario of scenarios) {
    installBridge(scenario)
    const failures = []
    assert.equal(selectContactNative(() => {}, {
      onFailure: (failure) => failures.push(failure),
    }), null)
    assert.deepEqual(failures, [{ code: scenario.expected, capability: 'selectContact' }])
    assert.equal(getNativeContactRegistrySize(), 0)
    assert.equal(Object.keys(window).some((key) => key.startsWith('__dineroProContactReply_')), false)
  }
})

test('ignores mismatched callbacks and fails only an associated invalid callback', () => {
  const calls = installBridge()
  const results = []
  const failures = []
  const requestId = selectContactNative(
    (reply) => results.push(reply),
    { onFailure: (failure) => failures.push(failure) },
  )
  const callbackName = calls[0].replyHandler.slice('window.'.length)
  const callback = window[callbackName]

  callback(createReply('another-request'))
  assert.equal(getNativeContactRegistrySize(), 1)
  assert.deepEqual(results, [])
  assert.deepEqual(failures, [])

  callback({
    action: 'pick_contact',
    requestId,
    status: 'UNKNOWN',
    message: 'invalid',
    contactResult: {},
  })
  callback(createReply(requestId))

  assert.deepEqual(results, [])
  assert.deepEqual(failures, [{ code: 'INVALID_CALLBACK', capability: 'selectContact' }])
  assert.equal(getNativeContactRegistrySize(), 0)
})

test('rejects a matching SUCCESS callback without complete contact fields', () => {
  const calls = installBridge()
  const results = []
  const failures = []
  const requestId = selectContactNative(
    (reply) => results.push(reply),
    { onFailure: (failure) => failures.push(failure) },
  )
  const callbackName = calls[0].replyHandler.slice('window.'.length)

  window[callbackName]({
    action: 'pick_contact',
    requestId,
    status: 'SUCCESS',
    message: 'terminal',
    contactResult: { name: '<contact-name>' },
  })

  assert.deepEqual(results, [])
  assert.deepEqual(failures, [{ code: 'INVALID_CALLBACK', capability: 'selectContact' }])
  assert.equal(getNativeContactRegistrySize(), 0)
})

test('consumer detachment is repeat-safe and preserves registration until terminal cleanup', () => {
  const calls = installBridge()
  const results = []
  const failures = []
  const requestId = selectContactNative(
    (reply) => results.push(reply),
    { onFailure: (failure) => failures.push(failure) },
  )
  const callbackName = calls[0].replyHandler.slice('window.'.length)
  const callback = window[callbackName]

  assert.equal(cancelNativeContactConsumer(requestId), true)
  assert.equal(cancelNativeContactConsumer(requestId), false)
  assert.equal(cancelNativeContactConsumer(''), false)
  assert.equal(getNativeContactRegistrySize(), 1)
  assert.equal(typeof window[callbackName], 'function')

  callback(createReply(requestId, 'ERR_USER_CANCELLED'))

  assert.deepEqual(results, [])
  assert.deepEqual(failures, [])
  assert.equal(getNativeContactRegistrySize(), 0)
  assert.equal(typeof window[callbackName], 'undefined')
})

test('isolates consumer exceptions after cleaning the terminal registration', () => {
  const calls = installBridge()
  const requestId = selectContactNative(() => { throw new Error('consumer failed') })
  const callbackName = calls[0].replyHandler.slice('window.'.length)

  assert.doesNotThrow(() => window[callbackName](createReply(requestId)))
  assert.equal(getNativeContactRegistrySize(), 0)
})
