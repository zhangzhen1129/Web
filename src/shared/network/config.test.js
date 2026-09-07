import assert from 'node:assert/strict'
import test from 'node:test'

import { readNetworkSettings, validateNetworkSettings } from './config.js'

test('requires a controlled timeout configuration', () => {
  const settings = readNetworkSettings({}, () => 'https://api.example.test')
  assert.equal(settings.timeoutMs, null)
  assert.throws(() => validateNetworkSettings(settings), /VITE_API_TIMEOUT_MS/)
})

test('preserves an explicitly configured timeout', () => {
  const settings = readNetworkSettings({ VITE_API_TIMEOUT_MS: '15000' }, () => 'https://api.example.test')
  assert.equal(settings.timeoutMs, 15_000)
})

test('does not hide an invalid explicit timeout', () => {
  const settings = readNetworkSettings({ VITE_API_TIMEOUT_MS: 'invalid' }, () => 'https://api.example.test')
  assert.throws(() => validateNetworkSettings(settings), /VITE_API_TIMEOUT_MS/)
})
