import assert from 'node:assert/strict'
import test from 'node:test'

import { maskMobile } from './minePhone.js'

test('masks a valid mobile value in one controlled place', () => {
  assert.equal(maskMobile('678123989'), '678****989')
  assert.equal(maskMobile('+51 678-123-989'), '516****989')
})

test('rejects missing and too-short mobile values', () => {
  assert.equal(maskMobile(null), '')
  assert.equal(maskMobile('123456'), '')
})
