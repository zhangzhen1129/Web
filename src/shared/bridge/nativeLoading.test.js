import test from 'node:test'
import assert from 'node:assert/strict'
import { hideNativeLoading, showNativeLoading } from './nativeLoading.js'

test('loading bridge sends a fresh JSON request id and ignores synchronous result', () => {
  const calls = []
  globalThis.window = {
    plahub: {
      showLoading(payload) {
        calls.push(['showLoading', payload])
        return '{"status":"error"}'
      },
      hideLoading(payload) {
        calls.push(['hideLoading', payload])
        return '{"status":"accepted"}'
      },
    },
  }

  assert.doesNotThrow(() => showNativeLoading())
  assert.doesNotThrow(() => hideNativeLoading())
  assert.equal(calls.length, 2)
  assert.notEqual(JSON.parse(calls[0][1]).requestId, JSON.parse(calls[1][1]).requestId)
  assert.equal(JSON.parse(calls[0][1]).requestId.startsWith('h5-show-'), true)
  assert.equal(JSON.parse(calls[1][1]).requestId.startsWith('h5-hide-'), true)
})

test('missing bridge and throwing methods are isolated from the page', () => {
  globalThis.window = {}
  assert.doesNotThrow(() => showNativeLoading())

  globalThis.window = {
    plahub: {
      hideLoading() {
        throw new Error('host failure')
      },
    },
  }
  assert.doesNotThrow(() => hideNativeLoading())
})

