import assert from 'node:assert/strict'
import test from 'node:test'

import { APP_MODE, readInitialAppMode, setAppMode, shouldShowRepaymentTab } from './appModeStore.js'

test('app mode controls repayment tab visibility', () => {
  assert.equal(shouldShowRepaymentTab(APP_MODE.CASH_LOAN), false)
  assert.equal(shouldShowRepaymentTab(APP_MODE.REPAYMENT_VISIBLE), true)
  assert.equal(shouldShowRepaymentTab(APP_MODE.REPAYMENT_HIDDEN), false)
  assert.equal(shouldShowRepaymentTab(APP_MODE.MULTI_PUSH), true)
})

test('invalid app mode falls back to hidden repayment tab', () => {
  assert.equal(setAppMode('2'), true)
  assert.equal(shouldShowRepaymentTab(), true)
  assert.equal(setAppMode('unexpected'), false)
  assert.equal(shouldShowRepaymentTab(), false)
})

test('initial app mode can be read from router query value', () => {
  assert.equal(readInitialAppMode('2'), APP_MODE.REPAYMENT_VISIBLE)
  assert.equal(readInitialAppMode(['3']), APP_MODE.REPAYMENT_HIDDEN)
  assert.equal(readInitialAppMode('missing'), APP_MODE.CASH_LOAN)
})

test('multi-push app mode is accepted without changing cash-loan fallback behavior', () => {
  assert.equal(setAppMode('1'), true)
  assert.equal(shouldShowRepaymentTab(), true)
  assert.equal(setAppMode('0'), true)
  assert.equal(shouldShowRepaymentTab(), false)
})
