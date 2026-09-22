import assert from 'node:assert/strict'
import test from 'node:test'
import { amountWithCurrency } from './orderDetailDisplay.js'

test('adds the Figma currency prefix once and keeps invalid values empty', () => {
  assert.equal(amountWithCurrency('20,000'), 'S/ 20,000')
  assert.equal(amountWithCurrency('S/ 20,000'), 'S/ 20,000')
  assert.equal(amountWithCurrency(''), '')
  assert.equal(amountWithCurrency(null), '')
})
