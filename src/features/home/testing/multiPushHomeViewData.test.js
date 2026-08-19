import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createLocalMultiPushHomeViewData,
  getMultiPushHomeState,
} from '../providers/localMultiPushHomeViewData.js'

test('multi-push local scenarios map to all four states', () => {
  assert.equal(getMultiPushHomeState(createLocalMultiPushHomeViewData('multi-available-only')), 'available-only')
  assert.equal(getMultiPushHomeState(createLocalMultiPushHomeViewData('multi-active-only')), 'active-only')
  assert.equal(getMultiPushHomeState(createLocalMultiPushHomeViewData('multi-processing')), 'processing')
  assert.equal(getMultiPushHomeState(createLocalMultiPushHomeViewData('multi-available-active')), 'available-active')
})

test('empty products without an explicit processing flag stay invalid', () => {
  const data = createLocalMultiPushHomeViewData('multi-processing')
  assert.equal(getMultiPushHomeState({ ...data, allProcessing: false }), 'invalid')
})

test('invalid app mode and negative counts stay recoverable invalid state', () => {
  const data = createLocalMultiPushHomeViewData('multi-available-only')
  assert.equal(getMultiPushHomeState({ ...data, appMode: 'CASH_LOAN' }), 'invalid')
  assert.equal(getMultiPushHomeState({ ...data, availableProductCount: -1 }), 'invalid')
})
