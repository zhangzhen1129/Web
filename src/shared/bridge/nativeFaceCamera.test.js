import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cancelNativeFaceCameraConsumer,
  getNativeFaceCameraRegistrySize,
  openFaceCameraNative,
} from './nativeFaceCamera.js'

const TERMINAL_STATUSES = ['success', 'cancel', 'permission_denied', 'error']

function createReply(requestId, status = 'success') {
  const success = status === 'success'
  return {
    action: 'openFaceCamera',
    requestId,
    status,
    message: status,
    imageBase64: success ? 'ZmFjZS1pbWFnZQ==' : '',
    mimeType: success ? 'image/jpeg' : '',
    originalBytes: success ? 20 : 0,
    compressedBytes: success ? 10 : 0,
  }
}

function installBridge({ rawResult, handler } = {}) {
  const calls = []
  globalThis.window = {
    plahub: {
      openFaceCamera(payload) {
        const request = JSON.parse(payload)
        calls.push(request)
        if (handler) return handler(request)
        if (typeof rawResult !== 'undefined') return rawResult
        return JSON.stringify({
          action: 'openFaceCamera',
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

test('registers a unique callback and delivers the documented face image result once', () => {
  const calls = installBridge()
  const results = []
  const failures = []
  const requestId = openFaceCameraNative(
    (reply) => results.push(reply),
    { onFailure: (failure) => failures.push(failure) },
  )

  assert.equal(calls.length, 1)
  assert.equal(calls[0].requestId, requestId)
  assert.ok(requestId.length <= 128)
  assert.deepEqual(Object.keys(calls[0]).sort(), ['replyHandler', 'requestId'])
  assert.match(calls[0].replyHandler, /^window\.__dineroProFaceCameraReply_[a-z0-9]+$/)
  assert.ok(calls[0].replyHandler.length <= 160)
  assert.equal(getNativeFaceCameraRegistrySize(), 1)

  const callbackName = calls[0].replyHandler.slice('window.'.length)
  const callback = window[callbackName]
  const reply = createReply(requestId)
  callback(reply)
  callback(reply)

  assert.deepEqual(results, [reply])
  assert.deepEqual(failures, [])
  assert.equal(getNativeFaceCameraRegistrySize(), 0)
  assert.equal(typeof window[callbackName], 'undefined')
})

test('delivers every documented face camera status as a business result', () => {
  for (const status of TERMINAL_STATUSES) {
    const calls = installBridge()
    const results = []
    const failures = []
    const requestId = openFaceCameraNative(
      (reply) => results.push(reply),
      { onFailure: (failure) => failures.push(failure) },
    )

    window[calls[0].replyHandler.slice('window.'.length)](createReply(requestId, status))

    assert.equal(results.length, 1)
    assert.equal(results[0].status, status)
    assert.deepEqual(failures, [])
    assert.equal(getNativeFaceCameraRegistrySize(), 0)
  }
})

test('reports invalid arguments and unavailable Bridge methods without registration', () => {
  installBridge()
  const invalidFailures = []
  assert.equal(openFaceCameraNative(null, {
    onFailure: (failure) => invalidFailures.push(failure),
  }), null)
  assert.deepEqual(invalidFailures, [{ code: 'INVALID_ARGUMENT', capability: 'openFaceCamera' }])
  assert.equal(openFaceCameraNative(() => {}, { onFailure: 'invalid' }), null)

  delete globalThis.window
  const unavailableFailures = []
  assert.equal(openFaceCameraNative(() => {}, {
    onFailure: (failure) => unavailableFailures.push(failure),
  }), null)
  assert.deepEqual(unavailableFailures, [{ code: 'BRIDGE_UNAVAILABLE', capability: 'openFaceCamera' }])

  globalThis.window = { plahub: {}, dispatchEvent() {} }
  assert.equal(openFaceCameraNative(() => {}, {
    onFailure: (failure) => unavailableFailures.push(failure),
  }), null)
  assert.equal(unavailableFailures.length, 2)
  assert.equal(getNativeFaceCameraRegistrySize(), 0)
})

test('maps registration and serialization failures to BRIDGE_CALL_FAILED', () => {
  let bridgeCalls = 0
  const baseWindow = {
    plahub: { openFaceCamera() { bridgeCalls += 1 } },
    dispatchEvent() {},
  }
  globalThis.window = new Proxy(baseWindow, {
    get(target, property, receiver) {
      if (typeof property === 'string' && property.startsWith('__dineroProFaceCameraReply_')) return () => {}
      return Reflect.get(target, property, receiver)
    },
  })
  const registrationFailures = []
  assert.equal(openFaceCameraNative(() => {}, {
    onFailure: (failure) => registrationFailures.push(failure),
  }), null)
  assert.deepEqual(registrationFailures, [{ code: 'BRIDGE_CALL_FAILED', capability: 'openFaceCamera' }])
  assert.equal(bridgeCalls, 0)

  globalThis.window = new Proxy(baseWindow, {
    set(target, property, value, receiver) {
      if (typeof property === 'string' && property.startsWith('__dineroProFaceCameraReply_')) {
        throw new Error('registration failed')
      }
      return Reflect.set(target, property, value, receiver)
    },
  })
  const assignmentFailures = []
  assert.equal(openFaceCameraNative(() => {}, {
    onFailure: (failure) => assignmentFailures.push(failure),
  }), null)
  assert.deepEqual(assignmentFailures, [{ code: 'BRIDGE_CALL_FAILED', capability: 'openFaceCamera' }])
  assert.equal(bridgeCalls, 0)

  installBridge({ handler: () => { bridgeCalls += 1 } })
  const originalStringify = JSON.stringify
  const serializationFailures = []
  try {
    JSON.stringify = () => { throw new Error('serialization failed') }
    assert.equal(openFaceCameraNative(() => {}, {
      onFailure: (failure) => serializationFailures.push(failure),
    }), null)
  } finally {
    JSON.stringify = originalStringify
  }
  assert.deepEqual(serializationFailures, [{ code: 'BRIDGE_CALL_FAILED', capability: 'openFaceCamera' }])
  assert.equal(bridgeCalls, 0)
  assert.equal(getNativeFaceCameraRegistrySize(), 0)
})

test('separates non-acceptance from malformed and throwing synchronous results', () => {
  const scenarios = [
    {
      expected: 'BRIDGE_NOT_ACCEPTED',
      handler: (request) => JSON.stringify({
        action: 'openFaceCamera',
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
    assert.equal(openFaceCameraNative(() => {}, {
      onFailure: (failure) => failures.push(failure),
    }), null)
    assert.deepEqual(failures, [{ code: scenario.expected, capability: 'openFaceCamera' }])
    assert.equal(getNativeFaceCameraRegistrySize(), 0)
    assert.equal(Object.keys(window).some((key) => key.startsWith('__dineroProFaceCameraReply_')), false)
  }
})

test('isolates mismatched callbacks and fails an associated invalid payload', () => {
  const calls = installBridge()
  const results = []
  const failures = []
  const requestId = openFaceCameraNative(
    (reply) => results.push(reply),
    { onFailure: (failure) => failures.push(failure) },
  )
  const callback = window[calls[0].replyHandler.slice('window.'.length)]

  callback(createReply('another-request'))
  assert.equal(getNativeFaceCameraRegistrySize(), 1)
  assert.deepEqual(results, [])
  assert.deepEqual(failures, [])

  const invalid = createReply(requestId)
  invalid.compressedBytes = '10'
  callback(invalid)
  callback(createReply(requestId))

  assert.deepEqual(results, [])
  assert.deepEqual(failures, [{ code: 'INVALID_CALLBACK', capability: 'openFaceCamera' }])
  assert.equal(getNativeFaceCameraRegistrySize(), 0)
})

test('does not parse or transform the Base64 payload', () => {
  const calls = installBridge()
  const results = []
  const requestId = openFaceCameraNative((reply) => results.push(reply))
  const reply = createReply(requestId)
  reply.imageBase64 = 'cHVyZS1iYXNlNjQ='

  window[calls[0].replyHandler.slice('window.'.length)](reply)

  assert.equal(results[0].imageBase64, 'cHVyZS1iYXNlNjQ=')
  assert.equal(results[0].mimeType, 'image/jpeg')
})

test('consumer detachment preserves registration until Android terminal cleanup', () => {
  const calls = installBridge()
  const results = []
  const failures = []
  const requestId = openFaceCameraNative(
    (reply) => results.push(reply),
    { onFailure: (failure) => failures.push(failure) },
  )
  const callbackName = calls[0].replyHandler.slice('window.'.length)

  assert.equal(cancelNativeFaceCameraConsumer(requestId), true)
  assert.equal(cancelNativeFaceCameraConsumer(requestId), false)
  assert.equal(cancelNativeFaceCameraConsumer(''), false)
  assert.equal(getNativeFaceCameraRegistrySize(), 1)

  window[callbackName](createReply(requestId, 'cancel'))

  assert.deepEqual(results, [])
  assert.deepEqual(failures, [])
  assert.equal(getNativeFaceCameraRegistrySize(), 0)
  assert.equal(typeof window[callbackName], 'undefined')
})

test('isolates consumer exceptions after cleaning the terminal registration', () => {
  const calls = installBridge()
  const requestId = openFaceCameraNative(() => { throw new Error('consumer failed') })
  const callbackName = calls[0].replyHandler.slice('window.'.length)

  assert.doesNotThrow(() => window[callbackName](createReply(requestId)))
  assert.equal(getNativeFaceCameraRegistrySize(), 0)
})
