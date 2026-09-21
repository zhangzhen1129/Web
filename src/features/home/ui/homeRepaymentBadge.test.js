import assert from 'node:assert/strict'
import test from 'node:test'

import { getRepaymentBadgeText } from './homeRepaymentBadge.js'

test('maps repayment counts to the approved badge text', () => {
  assert.equal(getRepaymentBadgeText(undefined), null)
  assert.equal(getRepaymentBadgeText(-1), null)
  assert.equal(getRepaymentBadgeText(1.5), null)
  assert.equal(getRepaymentBadgeText(Number.MAX_SAFE_INTEGER + 1), null)
  assert.equal(getRepaymentBadgeText(0), null)
  assert.equal(getRepaymentBadgeText(1), '1')
  assert.equal(getRepaymentBadgeText(99), '99')
  assert.equal(getRepaymentBadgeText(100), '99+')
  assert.equal(getRepaymentBadgeText(1000), '99+')
})
