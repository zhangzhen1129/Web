import assert from 'node:assert/strict'
import test from 'node:test'

import {
  APP_MODE,
  appModeState,
  resetHomeTabs,
  setAppMode,
  setHomeTabs,
  shouldShowRepaymentTab,
  syncAppModeFromHomePayload,
} from './appModeStore.js'

test('provides safe cash tabs before a home response is available', () => {
  setAppMode(APP_MODE.CASH_LOAN)
  setHomeTabs(null)

  assert.deepEqual(appModeState.homeTabs.map((tab) => tab.key), ['home', 'account'])
  assert.equal(shouldShowRepaymentTab(), false)
})

test('app mode controls repayment tab visibility', () => {
  assert.equal(shouldShowRepaymentTab(APP_MODE.CASH_LOAN), false)
  assert.equal(shouldShowRepaymentTab(APP_MODE.REPAYMENT_VISIBLE), false)
  assert.equal(shouldShowRepaymentTab(APP_MODE.REPAYMENT_HIDDEN), false)
  assert.equal(shouldShowRepaymentTab(APP_MODE.MULTI_PUSH), false)
})

test('invalid app mode falls back to hidden repayment tab', () => {
  assert.equal(setAppMode('2'), true)
  assert.equal(shouldShowRepaymentTab(), false)
  assert.equal(setAppMode('unexpected'), false)
  assert.equal(shouldShowRepaymentTab(), false)
})

test('multi-push app mode is accepted without changing cash-loan fallback behavior', () => {
  assert.equal(setAppMode('1'), true)
  assert.equal(shouldShowRepaymentTab(APP_MODE.MULTI_PUSH, []), false)
  assert.equal(shouldShowRepaymentTab(APP_MODE.MULTI_PUSH, [{ key: 'repayment', enabled: true }]), true)
  assert.equal(setAppMode('0'), true)
  assert.equal(shouldShowRepaymentTab(), false)
})

test('resets an unknown or failed home display to the safe tab collection', () => {
  setAppMode(APP_MODE.MULTI_PUSH)
  setHomeTabs([{ key: 'home' }, { key: 'repayment' }, { key: 'account' }])

  resetHomeTabs()

  assert.equal(appModeState.mode, APP_MODE.CASH_LOAN)
  assert.deepEqual(appModeState.homeTabs.map((tab) => tab.key), ['home', 'account'])
})

test('keeps the confirmed multi-push middle tab during loading and refreshing models', () => {
  const tabs = [
    { key: 'home', text: 'Prestamos', iconResourceKey: 'home', active: true, enabled: true },
    { key: 'repayment', text: 'Reembolso', iconResourceKey: 'repayment', active: false, enabled: true },
    { key: 'account', text: 'Mi cuenta', iconResourceKey: 'account', active: false, enabled: true },
  ]
  setAppMode(APP_MODE.MULTI_PUSH)
  setHomeTabs(tabs)

  assert.equal(syncAppModeFromHomePayload({ pageStatus: 'loading', tabs }), true)
  assert.equal(appModeState.mode, APP_MODE.MULTI_PUSH)
  assert.deepEqual(appModeState.homeTabs.map((tab) => tab.key), ['home', 'repayment', 'account'])

  assert.equal(syncAppModeFromHomePayload({ pageStatus: 'refreshing', tabs }), true)
  assert.equal(appModeState.mode, APP_MODE.MULTI_PUSH)
  assert.deepEqual(appModeState.homeTabs.map((tab) => tab.key), ['home', 'repayment', 'account'])
})

test('keeps cash-loan mode stable when a loading model only carries the current tabs', () => {
  const tabs = [
    { key: 'home', text: 'Prestamos', iconResourceKey: 'home', active: true, enabled: true },
    { key: 'account', text: 'Mi cuenta', iconResourceKey: 'account', active: false, enabled: true },
  ]
  setAppMode(APP_MODE.CASH_LOAN)
  setHomeTabs(tabs)

  assert.equal(syncAppModeFromHomePayload({ pageStatus: 'loading', tabs }), true)
  assert.equal(appModeState.mode, APP_MODE.CASH_LOAN)
  assert.deepEqual(appModeState.homeTabs.map((tab) => tab.key), ['home', 'account'])
})
