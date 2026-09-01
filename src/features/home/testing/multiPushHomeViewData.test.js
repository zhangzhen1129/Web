import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createLocalMultiPushHomeViewData,
  getMultiPushPrimaryButtonText,
  getMultiPushHomeState,
} from '../providers/localMultiPushHomeViewData.js'
import { getProjectMessage } from '../../../shared/config/projectLanguage.js'

test('multi-push primary button text resolves through project language ids', () => {
  assert.equal(getMultiPushPrimaryButtonText('repay'), 'Ir a reembolsar')
  assert.equal(getMultiPushPrimaryButtonText('processing'), 'Evaluando')
  assert.equal(getMultiPushPrimaryButtonText('processing', 'disbursing'), 'Desembolsando')
  assert.equal(getMultiPushPrimaryButtonText('apply'), 'Aplicar ahora')
  assert.equal(getProjectMessage('30', 'en'), 'Go to repay')
  assert.equal(getProjectMessage('31', 'sw'), 'Inatathminiwa')
  assert.equal(getProjectMessage('32', 'en'), 'Disbursing')
  assert.equal(getProjectMessage('33', 'sw'), 'Omba sasa')
})

test('multi-push local scenarios map to the three declared view states', () => {
  assert.equal(getMultiPushHomeState(createLocalMultiPushHomeViewData('multi-available-only')), 'available-and-active')
  assert.equal(getMultiPushHomeState(createLocalMultiPushHomeViewData('multi-active-only')), 'active-only')
  assert.equal(getMultiPushHomeState(createLocalMultiPushHomeViewData('multi-processing')), 'processing-only')
  assert.equal(getMultiPushHomeState(createLocalMultiPushHomeViewData('multi-available-active')), 'available-and-active')
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
