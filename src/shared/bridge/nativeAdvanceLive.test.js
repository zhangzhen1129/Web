import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cancelNativeAdvanceLiveConsumer,
  getNativeAdvanceLiveRegistrySize,
  openAdvanceLivePageNat,
} from './nativeAdvanceLive.js'

const VALID_URL = 'https://live.example.com/session/start?token=masked#check'

function installBridge({ rawResult, handler } = {}) {
  const calls = []
  globalThis.window = {
    plahub: {
      openAdvanceLivePage(payload) {
        const request = JSON.parse(payload)
        calls.push(request)
        if (handler) return handler(request)
        if (typeof rawResult !== 'undefined') return rawResult
        return JSON.stringify({
          action: 'openAdvanceLivePage',
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

test.afterEach(() => {
  if (globalThis.window?.advanceCallBack && getNativeAdvanceLiveRegistrySize() === 1) {
    globalThis.window.advanceCallBack('{"type":2}')
  }
  delete globalThis.window
})

test('sends only requestId and URL, then delivers type 1 from the shared string callback', () => {
  const calls = installBridge()
  const results = []
  const failures = []
  const requestId = openAdvanceLivePageNat(
    VALID_URL,
    (result) => results.push(result),
    { onFailure: (failure) => failures.push(failure) },
  )

  assert.equal(calls.length, 1)
  assert.deepEqual(Object.keys(calls[0]).sort(), ['requestId', 'url'])
  assert.equal(calls[0].requestId, requestId)
  assert.equal(calls[0].url, VALID_URL)
  assert.equal(typeof window.advanceCallBack, 'function')
  assert.equal(getNativeAdvanceLiveRegistrySize(), 1)

  window.advanceCallBack('{"type":1}')

  assert.deepEqual(results, [{ type: 1 }])
  assert.deepEqual(failures, [])
  assert.equal(getNativeAdvanceLiveRegistrySize(), 0)
  assert.equal(typeof window.advanceCallBack, 'undefined')
})

test('delivers type 2 as the terminal retry result and permits a new call', () => {
  const calls = installBridge()
  const results = []
  const firstRequestId = openAdvanceLivePageNat(VALID_URL, (result) => results.push(result))
  window.advanceCallBack('{"type":2}')
  const secondRequestId = openAdvanceLivePageNat(VALID_URL, (result) => results.push(result))

  assert.notEqual(firstRequestId, secondRequestId)
  assert.equal(calls.length, 2)
  window.advanceCallBack('{"type":1}')
  assert.deepEqual(results, [{ type: 2 }, { type: 1 }])
})

test('rejects a concurrent call without replacing the active consumer or calling Android', () => {
  const calls = installBridge()
  const results = []
  const failures = []
  const requestId = openAdvanceLivePageNat(VALID_URL, (result) => results.push(result))
  const duplicate = openAdvanceLivePageNat(
    VALID_URL,
    () => assert.fail('concurrent consumer must not run'),
    { onFailure: (failure) => failures.push(failure) },
  )

  assert.ok(requestId)
  assert.equal(duplicate, null)
  assert.equal(calls.length, 1)
  assert.deepEqual(failures, [{ code: 'REQUEST_ACTIVE', capability: 'openAdvanceLivePage' }])
  window.advanceCallBack('{"type":1}')
  assert.deepEqual(results, [{ type: 1 }])
})

test('validates the HTTPS public URL before registration or Android invocation', () => {
  const calls = installBridge()
  const invalidUrls = [
    '',
    ' https://live.example.com/start',
    'http://live.example.com/start',
    'https://localhost/start',
    'https://127.0.0.1/start',
    'https://10.0.0.1/start',
    'https://172.16.0.1/start',
    'https://192.168.0.1/start',
    'https://169.254.1.1/start',
    'https://[::1]/start',
    'https://[fc00::1]/start',
    'https://user:secret@live.example.com/start',
    'https://live.example.com\\start',
    'not-a-url',
  ]

  for (const url of invalidUrls) {
    const failures = []
    assert.equal(openAdvanceLivePageNat(url, () => {}, {
      onFailure: (failure) => failures.push(failure),
    }), null)
    assert.deepEqual(failures, [{ code: 'INVALID_ARGUMENT', capability: 'openAdvanceLivePage' }])
  }
  assert.equal(calls.length, 0)
  assert.equal(getNativeAdvanceLiveRegistrySize(), 0)
  assert.equal(typeof window.advanceCallBack, 'undefined')
})

test('reports invalid options, unavailable Bridge, and callback name conflicts', () => {
  installBridge()
  const invalidFailures = []
  assert.equal(openAdvanceLivePageNat(VALID_URL, null, {
    onFailure: (failure) => invalidFailures.push(failure),
  }), null)
  assert.deepEqual(invalidFailures, [{ code: 'INVALID_ARGUMENT', capability: 'openAdvanceLivePage' }])
  assert.equal(openAdvanceLivePageNat(VALID_URL, () => {}, { onFailure: 'invalid' }), null)

  delete globalThis.window
  const unavailableFailures = []
  assert.equal(openAdvanceLivePageNat(VALID_URL, () => {}, {
    onFailure: (failure) => unavailableFailures.push(failure),
  }), null)
  assert.deepEqual(unavailableFailures, [{ code: 'BRIDGE_UNAVAILABLE', capability: 'openAdvanceLivePage' }])

  installBridge()
  window.advanceCallBack = () => {}
  const conflictFailures = []
  assert.equal(openAdvanceLivePageNat(VALID_URL, () => {}, {
    onFailure: (failure) => conflictFailures.push(failure),
  }), null)
  assert.deepEqual(conflictFailures, [{ code: 'BRIDGE_CALL_FAILED', capability: 'openAdvanceLivePage' }])
  delete window.advanceCallBack
})

test('contains callback registration and request serialization failures', () => {
  let bridgeCalls = 0
  const baseWindow = {
    plahub: { openAdvanceLivePage() { bridgeCalls += 1 } },
    dispatchEvent() {},
  }
  globalThis.window = new Proxy(baseWindow, {
    set(target, property, value, receiver) {
      if (property === 'advanceCallBack') throw new Error('registration failed')
      return Reflect.set(target, property, value, receiver)
    },
  })
  const registrationFailures = []
  assert.equal(openAdvanceLivePageNat(VALID_URL, () => {}, {
    onFailure: (failure) => registrationFailures.push(failure),
  }), null)
  assert.deepEqual(registrationFailures, [{ code: 'BRIDGE_CALL_FAILED', capability: 'openAdvanceLivePage' }])
  assert.equal(bridgeCalls, 0)

  installBridge({ handler: () => { bridgeCalls += 1 } })
  const originalStringify = JSON.stringify
  const serializationFailures = []
  try {
    JSON.stringify = () => { throw new Error('serialization failed') }
    assert.equal(openAdvanceLivePageNat(VALID_URL, () => {}, {
      onFailure: (failure) => serializationFailures.push(failure),
    }), null)
  } finally {
    JSON.stringify = originalStringify
  }
  assert.deepEqual(serializationFailures, [{ code: 'BRIDGE_CALL_FAILED', capability: 'openAdvanceLivePage' }])
  assert.equal(bridgeCalls, 0)
  assert.equal(getNativeAdvanceLiveRegistrySize(), 0)
  assert.equal(typeof window.advanceCallBack, 'undefined')
})

test('maps malformed, non-accepted, mismatched, and throwing synchronous results', () => {
  const scenarios = [
    {
      expected: 'BRIDGE_NOT_ACCEPTED',
      handler: (request) => JSON.stringify({
        action: 'openAdvanceLivePage',
        requestId: request.requestId,
        status: 'invalid_param',
        message: 'rejected',
      }),
    },
    { expected: 'BRIDGE_CALL_FAILED', rawResult: 'not-json' },
    { expected: 'BRIDGE_CALL_FAILED', rawResult: JSON.stringify({ status: 'accepted' }) },
    {
      expected: 'BRIDGE_CALL_FAILED',
      handler: (request) => JSON.stringify({
        action: 'openAdvanceLivePage',
        requestId: `${request.requestId}-other`,
        status: 'accepted',
        message: 'accepted',
      }),
    },
    { expected: 'BRIDGE_CALL_FAILED', handler: () => { throw new Error('host failed') } },
  ]

  for (const scenario of scenarios) {
    installBridge(scenario)
    const failures = []
    assert.equal(openAdvanceLivePageNat(VALID_URL, () => {}, {
      onFailure: (failure) => failures.push(failure),
    }), null)
    assert.deepEqual(failures, [{ code: scenario.expected, capability: 'openAdvanceLivePage' }])
    assert.equal(getNativeAdvanceLiveRegistrySize(), 0)
    assert.equal(typeof window.advanceCallBack, 'undefined')
  }
})

test('fails an associated malformed callback once and cleans the shared registration', () => {
  const malformedResults = [
    { value: { type: 1 } },
    { value: 'not-json' },
    { value: '{"type":3}' },
    { value: '{"type":"1"}' },
    { value: '{"type":1,"extra":true}' },
  ]

  for (const scenario of malformedResults) {
    installBridge()
    const results = []
    const failures = []
    openAdvanceLivePageNat(
      VALID_URL,
      (result) => results.push(result),
      { onFailure: (failure) => failures.push(failure) },
    )
    window.advanceCallBack(scenario.value)

    assert.deepEqual(results, [])
    assert.deepEqual(failures, [{ code: 'INVALID_CALLBACK', capability: 'openAdvanceLivePage' }])
    assert.equal(getNativeAdvanceLiveRegistrySize(), 0)
    assert.equal(typeof window.advanceCallBack, 'undefined')
  }
})

test('consumer detachment keeps the shared callback until the terminal result', () => {
  const calls = installBridge()
  const results = []
  const failures = []
  const requestId = openAdvanceLivePageNat(
    VALID_URL,
    (result) => results.push(result),
    { onFailure: (failure) => failures.push(failure) },
  )

  assert.equal(cancelNativeAdvanceLiveConsumer(requestId), true)
  assert.equal(cancelNativeAdvanceLiveConsumer(requestId), false)
  assert.equal(cancelNativeAdvanceLiveConsumer('other'), false)
  assert.equal(calls.length, 1)
  assert.equal(getNativeAdvanceLiveRegistrySize(), 1)

  window.advanceCallBack('{"type":2}')

  assert.deepEqual(results, [])
  assert.deepEqual(failures, [])
  assert.equal(getNativeAdvanceLiveRegistrySize(), 0)
  assert.equal(typeof window.advanceCallBack, 'undefined')
})

test('isolates consumer exceptions after terminal cleanup', () => {
  installBridge()
  openAdvanceLivePageNat(VALID_URL, () => { throw new Error('consumer failed') })

  assert.doesNotThrow(() => window.advanceCallBack('{"type":1}'))
  assert.equal(getNativeAdvanceLiveRegistrySize(), 0)
})
