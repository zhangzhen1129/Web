import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDeferralDisplayModel,
  fillDeferralTemplate,
  formatCurrencyAmount,
} from './orderDeferralDisplay.js'

test('formats numeric display values without recalculating business values', () => {
  assert.equal(formatCurrencyAmount(20000), 'S/ 20,000')
  assert.equal(formatCurrencyAmount(1500.5), 'S/ 1,500.5')
  assert.equal(formatCurrencyAmount('S/ 20,000'), 'S/ 20,000')
  assert.equal(formatCurrencyAmount(''), '--')
  assert.equal(formatCurrencyAmount(null), '--')
})

test('builds a view model with raw dates, days, and display-only money strings', () => {
  assert.deepEqual(buildDeferralDisplayModel({
    billId: 'bill-001',
    applicationDate: '2025-11-20',
    dueDate: '2025-11-27',
    extensionDays: 7,
    paymentAmount: 20000,
    serviceFee: 1500,
    overdueFee: 300,
  }), {
    billId: 'bill-001',
    applicationDate: '2025-11-20',
    dueDate: '2025-11-27',
    extensionDays: 7,
    extensionDaysText: '7',
    paymentAmountText: 'S/ 20,000',
    serviceFeeText: 'S/ 1,500',
    overdueFeeText: 'S/ 300',
  })
})

test('renders missing display fields independently as placeholders', () => {
  assert.deepEqual(buildDeferralDisplayModel({
    billId: 'bill-001',
    applicationDate: null,
    dueDate: '2025-11-30',
    extensionDays: null,
    paymentAmount: null,
    serviceFee: null,
    overdueFee: 300,
  }), {
    billId: 'bill-001',
    applicationDate: '--',
    dueDate: '2025-11-30',
    extensionDays: null,
    extensionDaysText: '--',
    paymentAmountText: '--',
    serviceFeeText: '--',
    overdueFeeText: 'S/ 300',
  })
})
test('fills repeated template values without changing the template text', () => {
  assert.equal(
    fillDeferralTemplate('{days} days and {amount} for {days} total', {
      days: 7,
      amount: 'S/ 20,000',
    }),
    '7 days and S/ 20,000 for 7 total',
  )
})
