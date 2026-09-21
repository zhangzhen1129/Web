import assert from 'node:assert/strict'
import test from 'node:test'
import { formatAmountText } from './homeAmountText.js'

test('renders one currency prefix for amount nodes and keeps existing prefixed text stable', () => {
  assert.equal(formatAmountText('5,000'), 'S/ 5,000')
  assert.equal(formatAmountText('S/ 5,000'), 'S/ 5,000')
  assert.equal(formatAmountText(''), '')
})
