import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getNativeCachedToken,
  getNativePersistentCacheRegistrySize,
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

function createCacheReply(requestId, status = 'completed') {
  return {
    action: 'persistent_cache_handle',
    requestId,
    status,
    message: status,
    operation: 'get',
    cacheKey: 'Token',
    cacheValue: status === 'completed' ? 'redacted-test-value' : '',
    hit: status === 'completed',
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
