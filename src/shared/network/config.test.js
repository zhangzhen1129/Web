import assert from 'node:assert/strict'
import test from 'node:test'

import { readNetworkSettings, validateNetworkSettings } from './config.js'

test('uses the shared hardcoded timeout in every runtime mode', () => {
  const settings = readNetworkSettings(() => 'https://api.example.test')
  assert.equal(settings.timeoutMs, 180_000)
})

test('rejects an invalid injected timeout', () => {
  const settings = { baseUrl: 'https://api.example.test', timeoutMs: 0 }
  assert.throws(() => validateNetworkSettings(settings), /Request timeout/)
})
