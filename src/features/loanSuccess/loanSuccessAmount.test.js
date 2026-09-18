import assert from 'node:assert/strict'
import test from 'node:test'
import { addDecimalStrings, formatDecimalString, isDecimalString } from './loanSuccessAmount.js'

test('formats decimal strings without floating point conversion', () => {
  assert.equal(formatDecimalString('0001500'), '1,500')
  assert.equal(formatDecimalString('1500.00'), '1,500')
  assert.equal(formatDecimalString('1500.50'), '1,500.5')
  assert.equal(formatDecimalString('0.0001'), '0.0001')
})

test('adds decimal strings using integer arithmetic', () => {
  assert.equal(addDecimalStrings(['1', '2.5', '0.05']), '3.55')
  assert.equal(addDecimalStrings(['0.1', '0.2']), '0.3')
  assert.equal(addDecimalStrings(['999999999999999999999', '1']), '1,000,000,000,000,000,000,000')
})

test('rejects non-decimal values', () => {
  assert.equal(isDecimalString('1e3'), false)
  assert.equal(isDecimalString('-1'), false)
  assert.equal(isDecimalString('1.'), false)
  assert.equal(addDecimalStrings(['1', 'bad']), '')
})
