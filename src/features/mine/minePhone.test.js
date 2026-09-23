import assert from 'node:assert/strict'
import test from 'node:test'

import { maskMobile } from './minePhone.js'

test('masks a valid mobile value in one controlled place', () => {
  assert.equal(maskMobile('980123400'), '980****00')
  assert.equal(maskMobile('9801234598'), '980*****98')
  assert.equal(maskMobile('+51 980-123-400'), '519******00')
})

test('rejects missing and too-short mobile values', () => {
  assert.equal(maskMobile(null), '')
  assert.equal(maskMobile('123456'), '')
})
