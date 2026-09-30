import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cancelNativeCachedMobileConsumer,
  cancelNativeCachedTokenConsumer,
  cancelNativeCachedUserIdConsumer,
  getNativeCachedMobile,
  getNativeCachedToken,
  getNativeCachedUserId,
  getNativePersistentCacheRegistrySize,
  setNativeCachedToken,
  setNativeCachedUserId,
} from './nativePersistentCache.js'

function installBridge() {
  const calls = []
  globalThis.window = {
    plahub: {
      handlePersistentCache(payload) {
        const request = JSON.parse(payload)
        calls.push(request)
        return JSON.stringify({ action: 'persistent_cache_handle', requestId: request.requestId, status: 'accepted', message: 'accepted' })
      },
    },
    dispatchEvent() {},
  }
  return calls
}

function createCacheReply(requestId, status = 'completed', cacheKey = 'Token') {
  return {
    action: 'persistent_cache_handle',
    requestId,
    status,
    message: status,
    operation: 'get',
    cacheKey,
    cacheValue: status === 'completed' ? 'redacted-test-value' : '',
    hit: status === 'completed',
    storagePolicy: status === 'completed' ? 'persistent' : '',
    expiresAtMillis: 0,
  }
}

function createSetReply(requestId, status = 'completed', cacheKey = 'Token') {
  return {
    action: 'persistent_cache_handle',
    requestId,
    status,
    message: status,
    operation: 'set',
    cacheKey,
    cacheValue: '',
    hit: false,
    storagePolicy: status === 'completed' ? 'persistent' : '',
    expiresAtMillis: 0,
  }
}

test('queries Token through the documented shared callback and cleans up after terminal reply', () => {
  const calls = installBridge()
  const results = []
  const first = getNativeCachedToken((reply) => results.push(reply))
  const second = getNativeCachedToken((reply) => results.push(reply))

  assert.equal(calls.length, 2)
  assert.notEqual(first, second)
  assert.deepEqual(calls.map(({ operation, cacheKey }) => ({ operation, cacheKey })), [
    { operation: 'get', cacheKey: 'Token' },
    { operation: 'get', cacheKey: 'Token' },
  ])
  assert.equal(calls[0].replyHandler, calls[1].replyHandler)
  assert.equal(getNativePersistentCacheRegistrySize(), 2)

  const reply = createCacheReply(first)
  globalThis.window[calls[0].replyHandler.replace('window.', '')](reply)
  assert.deepEqual(results, [reply])
  assert.equal(getNativePersistentCacheRegistrySize(), 1)

  globalThis.window[calls[0].replyHandler.replace('window.', '')](reply)
  assert.deepEqual(results, [reply])
  globalThis.window[calls[1].replyHandler.replace('window.', '')](createCacheReply(second, 'error'))
  assert.equal(getNativePersistentCacheRegistrySize(), 0)
  assert.equal(typeof globalThis.window.__dineroProPersistentCacheReply, 'undefined')
})

test('queries UserId and LoginPhoneNumber through the same controlled shared callback', () => {
  const calls = installBridge()
  const results = []
  const userIdRequestId = getNativeCachedUserId((reply) => results.push(reply))
  const mobileRequestId = getNativeCachedMobile((reply) => results.push(reply))

  assert.deepEqual(calls.map(({ operation, cacheKey }) => ({ operation, cacheKey })), [
    { operation: 'get', cacheKey: 'UserId' },
    { operation: 'get', cacheKey: 'LoginPhoneNumber' },
  ])
  for (const call of calls) {
    assert.deepEqual(Object.keys(call).sort(), ['cacheKey', 'operation', 'replyHandler', 'requestId'])
    assert.ok(call.requestId.length <= 64)
  }
  assert.equal(calls[0].replyHandler, calls[1].replyHandler)
  assert.equal(getNativePersistentCacheRegistrySize(), 2)

  const callback = window[calls[0].replyHandler.replace('window.', '')]
  const userIdReply = createCacheReply(userIdRequestId, 'completed', 'UserId')
  const mobileReply = createCacheReply(mobileRequestId, 'completed', 'LoginPhoneNumber')
  callback(mobileReply)
  callback(userIdReply)

  assert.deepEqual(results, [mobileReply, userIdReply])
  assert.equal(getNativePersistentCacheRegistrySize(), 0)
  assert.equal(typeof window.__dineroProPersistentCacheReply, 'undefined')
})

test('isolates a matching request with the wrong fixed cache key', () => {
  const calls = installBridge()
  const results = []
  const failures = []
  const requestId = getNativeCachedUserId(
    (reply) => results.push(reply),
    { onFailure: (failure) => failures.push(failure) },
  )
  const callback = window[calls[0].replyHandler.replace('window.', '')]

  callback(createCacheReply(requestId, 'completed', 'LoginPhoneNumber'))
  callback(createCacheReply(requestId, 'completed', 'UserId'))

  assert.deepEqual(results, [])
  assert.deepEqual(failures, [{ capability: 'handlePersistentCache', code: 'INVALID_CALLBACK' }])
  assert.equal(getNativePersistentCacheRegistrySize(), 0)
})

test('detaches only the matching cached value consumer', () => {
  const calls = installBridge()
  const results = []
  const userIdRequestId = getNativeCachedUserId((reply) => results.push(reply))
  const mobileRequestId = getNativeCachedMobile((reply) => results.push(reply))
  const callback = window[calls[0].replyHandler.replace('window.', '')]

  assert.equal(cancelNativeCachedMobileConsumer(userIdRequestId), false)
  assert.equal(cancelNativeCachedUserIdConsumer(userIdRequestId), true)
  assert.equal(cancelNativeCachedTokenConsumer(mobileRequestId), false)
  assert.equal(cancelNativeCachedMobileConsumer(mobileRequestId), true)
  assert.equal(getNativePersistentCacheRegistrySize(), 2)

  callback(createCacheReply(userIdRequestId, 'completed', 'UserId'))
  callback(createCacheReply(mobileRequestId, 'completed', 'LoginPhoneNumber'))

  assert.deepEqual(results, [])
  assert.equal(getNativePersistentCacheRegistrySize(), 0)
})

test('reports exact unavailable failures for the added fixed-key APIs', () => {
  const failures = []
  globalThis.window = { dispatchEvent() {} }

  assert.equal(getNativeCachedUserId(() => {}, {
    onFailure: (failure) => failures.push(failure),
  }), null)
  assert.equal(getNativeCachedMobile(() => {}, {
    onFailure: (failure) => failures.push(failure),
  }), null)

  assert.deepEqual(failures, [
    { capability: 'handlePersistentCache', code: 'BRIDGE_UNAVAILABLE' },
    { capability: 'handlePersistentCache', code: 'BRIDGE_UNAVAILABLE' },
  ])
  assert.equal(getNativePersistentCacheRegistrySize(), 0)
})

test('does not register callbacks when bridge is unavailable, incomplete, or throws', () => {
  globalThis.window = { dispatchEvent() {} }
  assert.equal(getNativeCachedToken(() => {}), null)
  assert.equal(getNativePersistentCacheRegistrySize(), 0)

  globalThis.window = { dispatchEvent() {}, plahub: {} }
  assert.equal(getNativeCachedToken(() => {}), null)
  assert.equal(getNativePersistentCacheRegistrySize(), 0)

  globalThis.window = {
    dispatchEvent() {},
    plahub: { handlePersistentCache() { throw new Error('host failure') } },
  }
  assert.equal(getNativeCachedToken(() => {}), null)
  assert.equal(getNativePersistentCacheRegistrySize(), 0)
})

test('ignores malformed and unknown callbacks without delivering results', () => {
  const calls = installBridge()
  const results = []
  getNativeCachedToken((reply) => results.push(reply))
  const callback = globalThis.window[calls[0].replyHandler.replace('window.', '')]
  callback({ status: 'completed' })
  callback({ action: 'persistent_cache_handle', requestId: 'unknown', status: 'completed', operation: 'get', cacheKey: 'Token' })
  assert.deepEqual(results, [])
  assert.equal(getNativePersistentCacheRegistrySize(), 1)
  callback({ requestId: calls[0].requestId, status: 'completed' })
  assert.equal(getNativePersistentCacheRegistrySize(), 0)
  assert.equal(typeof globalThis.window.__dineroProPersistentCacheReply, 'undefined')
})

test('does not overwrite an existing callback with the controlled callback name', () => {
  const calls = installBridge()
  globalThis.window.__dineroProPersistentCacheReply = () => {}
  assert.equal(getNativeCachedToken(() => {}), null)
  assert.equal(calls.length, 0)
  assert.equal(getNativePersistentCacheRegistrySize(), 0)
})

test('cleans up immediately when the synchronous response rejects or mismatches the request', () => {
  globalThis.window = {
    dispatchEvent() {},
    plahub: {
      handlePersistentCache(payload) {
        const request = JSON.parse(payload)
        return JSON.stringify({ action: 'persistent_cache_handle', requestId: `${request.requestId}-other`, status: 'error' })
      },
    },
  }

  assert.equal(getNativeCachedToken(() => {}), null)
  assert.equal(getNativePersistentCacheRegistrySize(), 0)
  assert.equal(typeof globalThis.window.__dineroProPersistentCacheReply, 'undefined')
})

test('rejects an accepted synchronous response missing its required message', () => {
  globalThis.window = {
    dispatchEvent() {},
    plahub: {
      handlePersistentCache(payload) {
        const request = JSON.parse(payload)
        return JSON.stringify({
          action: 'persistent_cache_handle',
          requestId: request.requestId,
          status: 'accepted',
        })
      },
    },
  }

  assert.equal(getNativeCachedToken(() => {}), null)
  assert.equal(getNativePersistentCacheRegistrySize(), 0)
  assert.equal(typeof globalThis.window.__dineroProPersistentCacheReply, 'undefined')
})

test('reports exact failures and detaches the token consumer', () => {
  const failures = []
  globalThis.window = { dispatchEvent() {} }
  assert.equal(getNativeCachedToken(() => {}, { onFailure: (failure) => failures.push(failure) }), null)
  assert.deepEqual(failures.pop(), { capability: 'handlePersistentCache', code: 'BRIDGE_UNAVAILABLE' })

  globalThis.window = {
    dispatchEvent() {},
    plahub: {
      handlePersistentCache(payload) {
        const request = JSON.parse(payload)
        return JSON.stringify({ action: 'persistent_cache_handle', requestId: request.requestId, status: 'busy', message: 'busy' })
      },
    },
  }
  assert.equal(getNativeCachedToken(() => {}, { onFailure: (failure) => failures.push(failure) }), null)
  assert.deepEqual(failures.pop(), { capability: 'handlePersistentCache', code: 'BRIDGE_NOT_ACCEPTED' })

  globalThis.window.plahub.handlePersistentCache = () => '{invalid-json'
  assert.equal(getNativeCachedToken(() => {}, { onFailure: (failure) => failures.push(failure) }), null)
  assert.deepEqual(failures.pop(), { capability: 'handlePersistentCache', code: 'BRIDGE_CALL_FAILED' })

  installBridge()
  const originalStringify = JSON.stringify
  try {
    JSON.stringify = () => { throw new Error('serialization failure') }
    assert.equal(getNativeCachedToken(() => {}, { onFailure: (failure) => failures.push(failure) }), null)
  } finally {
    JSON.stringify = originalStringify
  }
  assert.deepEqual(failures.pop(), { capability: 'handlePersistentCache', code: 'BRIDGE_CALL_FAILED' })

  const calls = installBridge()
  const invalidRequestId = getNativeCachedToken(() => {}, { onFailure: (failure) => failures.push(failure) })
  const callback = window[calls[0].replyHandler.replace('window.', '')]
  callback({ requestId: invalidRequestId, status: 'completed' })
  assert.deepEqual(failures.pop(), { capability: 'handlePersistentCache', code: 'INVALID_CALLBACK' })

  const nextCalls = installBridge()
  const results = []
  const requestId = getNativeCachedToken((reply) => results.push(reply), { onFailure: (failure) => failures.push(failure) })
  const nextCallback = window[nextCalls[0].replyHandler.replace('window.', '')]
  assert.equal(cancelNativeCachedTokenConsumer(requestId), true)
  assert.equal(cancelNativeCachedTokenConsumer(requestId), true)
  nextCallback(createCacheReply(requestId))
  assert.deepEqual(results, [])
  assert.deepEqual(failures, [])
  assert.equal(getNativePersistentCacheRegistrySize(), 0)
  assert.equal(cancelNativeCachedTokenConsumer(requestId), false)
})

test('stores Token with the persistent policy and omits TTL fields', () => {
  const calls = installBridge()
  assert.equal(setNativeCachedToken('redacted-token-value'), true)
  assert.equal(calls.length, 1)

  const request = calls[0]
  assert.deepEqual(Object.keys(request).sort(), [
    'cacheKey',
    'cacheValue',
    'operation',
    'replyHandler',
    'requestId',
    'storagePolicy',
  ])
  assert.deepEqual({
    operation: request.operation,
    cacheKey: request.cacheKey,
    cacheValue: request.cacheValue,
    storagePolicy: request.storagePolicy,
  }, {
    operation: 'set',
    cacheKey: 'Token',
    cacheValue: 'redacted-token-value',
    storagePolicy: 'persistent',
  })
  assert.equal(Object.hasOwn(request, 'ttlMillis'), false)
  assert.equal(getNativePersistentCacheRegistrySize(), 1)

  const callback = globalThis.window[request.replyHandler.replace('window.', '')]
  callback(createSetReply(request.requestId))
  assert.equal(getNativePersistentCacheRegistrySize(), 0)
  assert.equal(typeof globalThis.window.__dineroProPersistentCacheReply, 'undefined')
})

test('stores UserId without creating a business callback or crossing shared replies', () => {
  const calls = installBridge()
  const results = []
  const getRequestId = getNativeCachedToken((reply) => results.push(reply))
  assert.equal(setNativeCachedUserId('redacted-user-id'), true)
  assert.equal(getNativePersistentCacheRegistrySize(), 2)

  const setRequest = calls.find((request) => request.operation === 'set')
  const getRequest = calls.find((request) => request.operation === 'get')
  assert.equal(setRequest.cacheKey, 'UserId')
  assert.equal(setRequest.storagePolicy, 'persistent')
  assert.equal(Object.hasOwn(setRequest, 'ttlMillis'), false)
  assert.equal(setRequest.replyHandler, getRequest.replyHandler)

  const callback = globalThis.window[setRequest.replyHandler.replace('window.', '')]
  callback(createSetReply(setRequest.requestId, 'completed', 'UserId'))
  assert.equal(results.length, 0)
  assert.equal(getNativePersistentCacheRegistrySize(), 1)
  callback(createCacheReply(getRequestId, 'completed', 'Token'))
  assert.equal(results.length, 1)
  assert.equal(getNativePersistentCacheRegistrySize(), 0)
})

test('rejects invalid or unavailable setters without registering callbacks', () => {
  globalThis.window = { dispatchEvent() {} }
  assert.equal(setNativeCachedToken(''), false)
  assert.equal(setNativeCachedToken('redacted-token-value'), false)
  assert.equal(setNativeCachedUserId(1), false)
  assert.equal(getNativePersistentCacheRegistrySize(), 0)

  globalThis.window = {
    dispatchEvent() {},
    plahub: {
      handlePersistentCache(payload) {
        const request = JSON.parse(payload)
        return JSON.stringify({
          action: 'persistent_cache_handle',
          requestId: request.requestId,
          status: 'error',
          message: 'host rejected request',
        })
      },
    },
  }
  assert.equal(setNativeCachedUserId('redacted-user-id'), false)
  assert.equal(getNativePersistentCacheRegistrySize(), 0)
  assert.equal(typeof globalThis.window.__dineroProPersistentCacheReply, 'undefined')
})

test('cleans setter records when the callback reports a non-persistent policy', () => {
  const calls = installBridge()
  assert.equal(setNativeCachedToken('redacted-token-value'), true)
  const callback = globalThis.window[calls[0].replyHandler.replace('window.', '')]
  callback({
    ...createSetReply(calls[0].requestId),
    storagePolicy: 'ttl',
    expiresAtMillis: 1,
  })
  assert.equal(getNativePersistentCacheRegistrySize(), 0)
  assert.equal(typeof globalThis.window.__dineroProPersistentCacheReply, 'undefined')
})
