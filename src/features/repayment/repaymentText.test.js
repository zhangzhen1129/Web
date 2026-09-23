import assert from 'node:assert/strict'
import test from 'node:test'

import { getRepaymentStatusText } from './repaymentText.js'

test('maps repayment order status codes to project messages for the active language', () => {
  assert.equal(getRepaymentStatusText(80), 'Reembolsando')
  assert.equal(getRepaymentStatusText(90), 'Atrasado')
})

test('selects repayment order status labels by language', () => {
  assert.equal(getRepaymentStatusText(80, 'en'), 'Repaying')
  assert.equal(getRepaymentStatusText(90, 'en'), 'overdue')
  assert.equal(getRepaymentStatusText(80, 'sw'), '')
})

test('does not map unknown order statuses to a repayment label', () => {
  assert.equal(getRepaymentStatusText(70), '')
  assert.equal(getRepaymentStatusText('80'), '')
})
