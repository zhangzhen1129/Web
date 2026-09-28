import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDeferHistoryDisplayModel,
  buildDeferHistoryRecordDisplayModel,
} from './deferHistoryDisplay.js'

test('builds a record display model with raw dates and the existing currency formatter', () => {
  const display = buildDeferHistoryRecordDisplayModel({
    approvalDate: '2031-04-05',
    amount: 1234.5,
    extendedTerm: 11,
    updatedDueDate: '2031-04-16',
  })

  assert.deepEqual(display, {
    approvalDate: '2031-04-05',
    amount: 1234.5,
    amountText: 'S/ 1,234.5',
    extendedTerm: 11,
    extendedTermText: '11 días',
    updatedDueDate: '2031-04-16',
  })
})

test('builds a list display model in the response order', () => {
  const display = buildDeferHistoryDisplayModel([
    {
      approvalDate: 'first-date',
      amount: 1000,
      extendedTerm: 3,
      updatedDueDate: 'first-due-date',
    },
    {
      approvalDate: 'second-date',
      amount: 2000,
      extendedTerm: 14,
      updatedDueDate: 'second-due-date',
    },
  ])

  assert.deepEqual(display.map((item) => item.approvalDate), ['first-date', 'second-date'])
  assert.equal(display[0].amountText, 'S/ 1,000')
  assert.equal(display[1].extendedTermText, '14 días')
})


