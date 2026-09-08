import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getPhysicalBackInterceptRegistrySize,
  setPhysicalBackIntercept,
} from './nativePhysicalBackIntercept.js'

function installBridge(resultFactory = (request) => ({
  action: 'setPhysicalBackInterceptConfig',
  requestId: request.requestId,
  status: 'success',
  message: 'saved',
})) {
  const calls = []
  globalThis.window = {
    dispatchEvent() {},
    plahub: {
      setPhysicalBackInterceptConfig(payload) {
        const request = JSON.parse(payload)
        calls.push(request)
        return JSON.stringify(resultFactory(request))
      },
    },
  }
  return calls
}

function sendIntercept(requestId, overrides = {}) {
  window.__dineroProPhysicalBackInterceptReply({
    action: 'physicalBackIntercepted',
    requestId,
    status: 'intercepted',
    message: 'consumed',
    ...overrides,
  })
}

test.afterEach(() => {
  delete globalThis.window
  assert.equal(getPhysicalBackInterceptRegistrySize(), 0)
})

test('enables one continuous physical-back configuration and delivers every valid event', () => {
  const calls = installBridge()
  const events = []
  const requestId = setPhysicalBackIntercept({ enabled: true, onIntercept: (event) => events.push(event) })

  assert.match(requestId, /^h5-physical-back-enable-/)
  assert.deepEqual(calls[0], {
    requestId,
    enabled: true,
    callbackPath: 'window.__dineroProPhysicalBackInterceptReply',
  })
  assert.equal(getPhysicalBackInterceptRegistrySize(), 1)
  sendIntercept(requestId)
  sendIntercept(requestId)
  assert.equal(events.length, 2)
  assert.equal(getPhysicalBackInterceptRegistrySize(), 1)

  const disableId = setPhysicalBackIntercept({ enabled: false })
  assert.match(disableId, /^h5-physical-back-disable-/)
  assert.deepEqual(calls[1], { requestId: disableId, enabled: false })
  assert.equal(getPhysicalBackInterceptRegistrySize(), 0)
  assert.equal(typeof window.__dineroProPhysicalBackInterceptReply, 'undefined')
})

test('refuses a second enable without calling Android or replacing the active consumer', () => {
  const calls = installBridge()
  const firstEvents = []
  const failures = []
  const requestId = setPhysicalBackIntercept({ enabled: true, onIntercept: (event) => firstEvents.push(event) })
  const second = setPhysicalBackIntercept(
    { enabled: true, onIntercept: () => assert.fail('second consumer must not replace the active consumer') },
    { onFailure: (failure) => failures.push(failure) },
  )

  assert.equal(second, null)
  assert.equal(calls.length, 1)
  assert.deepEqual(failures, [{ capability: 'setPhysicalBackInterceptConfig', code: 'CONFIG_ACTIVE' }])
  sendIntercept(requestId)
  assert.equal(firstEvents.length, 1)
  assert.notEqual(setPhysicalBackIntercept({ enabled: false }), null)
})

test('keeps the active configuration when Android does not accept a close request', () => {
  const calls = installBridge((request) => ({
    action: 'setPhysicalBackInterceptConfig',
    requestId: request.requestId,
    status: request.enabled ? 'success' : 'invalid_param',
    message: 'saved',
  }))
  const failures = []
  const events = []
  const requestId = setPhysicalBackIntercept({ enabled: true, onIntercept: (event) => events.push(event) })

  assert.equal(setPhysicalBackIntercept({ enabled: false }, { onFailure: (failure) => failures.push(failure) }), null)
  assert.equal(getPhysicalBackInterceptRegistrySize(), 1)
  assert.equal(typeof window.__dineroProPhysicalBackInterceptReply, 'function')
  assert.deepEqual(failures, [{ capability: 'setPhysicalBackInterceptConfig', code: 'BRIDGE_NOT_ACCEPTED' }])
  sendIntercept(requestId)
  assert.equal(events.length, 1)
  assert.equal(calls.length, 2)

  window.plahub.setPhysicalBackInterceptConfig = (payload) => {
    const request = JSON.parse(payload)
    calls.push(request)
    return JSON.stringify({ action: 'setPhysicalBackInterceptConfig', requestId: request.requestId, status: 'success', message: 'saved' })
  }
  assert.notEqual(setPhysicalBackIntercept({ enabled: false }), null)
})

test('keeps an accepted configuration after invalid, unknown, and consumer-throwing callbacks', () => {
  installBridge()
  const failures = []
  const events = []
  const requestId = setPhysicalBackIntercept(
    { enabled: true, onIntercept: (event) => events.push(event) },
    { onFailure: (failure) => failures.push(failure) },
  )

  sendIntercept('h5-other')
  sendIntercept(requestId, { status: 'unexpected' })
  sendIntercept(requestId, { action: 'wrong' })
  assert.deepEqual(failures, [{ capability: 'setPhysicalBackInterceptConfig', code: 'INVALID_CALLBACK' }])
  assert.equal(getPhysicalBackInterceptRegistrySize(), 1)
  sendIntercept(requestId)
  assert.equal(events.length, 1)
  assert.notEqual(setPhysicalBackIntercept({ enabled: false }), null)

  installBridge()
  const consumerFailureRequestId = setPhysicalBackIntercept({ enabled: true, onIntercept: () => { throw new Error('consumer failed') } })
  assert.doesNotThrow(() => sendIntercept(consumerFailureRequestId))
  assert.equal(getPhysicalBackInterceptRegistrySize(), 1)
  assert.notEqual(setPhysicalBackIntercept({ enabled: false }), null)
})

test('isolates invalid arguments, unavailable methods, callback conflicts, rejected results, and exceptions', () => {
  const failures = []
  assert.equal(setPhysicalBackIntercept({ enabled: true }, { onFailure: (failure) => failures.push(failure) }), null)
  assert.deepEqual(failures.splice(0), [{ capability: 'setPhysicalBackInterceptConfig', code: 'INVALID_ARGUMENT' }])

  globalThis.window = { dispatchEvent() {} }
  assert.equal(setPhysicalBackIntercept({ enabled: true, onIntercept() {} }, { onFailure: (failure) => failures.push(failure) }), null)
  assert.deepEqual(failures.splice(0), [{ capability: 'setPhysicalBackInterceptConfig', code: 'BRIDGE_UNAVAILABLE' }])

  installBridge()
  window.__dineroProPhysicalBackInterceptReply = () => {}
  assert.equal(setPhysicalBackIntercept({ enabled: true, onIntercept() {} }, { onFailure: (failure) => failures.push(failure) }), null)
  assert.deepEqual(failures.splice(0), [{ capability: 'setPhysicalBackInterceptConfig', code: 'BRIDGE_CALL_FAILED' }])
  delete window.__dineroProPhysicalBackInterceptReply

  installBridge((request) => ({ action: 'setPhysicalBackInterceptConfig', requestId: request.requestId, status: 'invalid_param', message: 'rejected' }))
  assert.equal(setPhysicalBackIntercept({ enabled: true, onIntercept() {} }, { onFailure: (failure) => failures.push(failure) }), null)
  assert.deepEqual(failures.splice(0), [{ capability: 'setPhysicalBackInterceptConfig', code: 'BRIDGE_NOT_ACCEPTED' }])

  installBridge()
  window.plahub.setPhysicalBackInterceptConfig = () => { throw new Error('host failed') }
  assert.equal(setPhysicalBackIntercept({ enabled: true, onIntercept() {} }, { onFailure: (failure) => failures.push(failure) }), null)
  assert.deepEqual(failures, [{ capability: 'setPhysicalBackInterceptConfig', code: 'BRIDGE_CALL_FAILED' }])
})
