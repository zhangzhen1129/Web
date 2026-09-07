import assert from 'node:assert/strict'
import test from 'node:test'
import { logNativeBridgeCall } from './nativeCallLog.js'

test('logs only the native method name', () => {
  const originalInfo = console.info
  const entries = []
  console.info = (...args) => entries.push(args)
  try {
    logNativeBridgeCall('triggerAppListFetch')
  } finally {
    console.info = originalInfo
  }
  assert.deepEqual(entries, [['[DineroPro][NativeBridge] call', 'triggerAppListFetch']])
})
