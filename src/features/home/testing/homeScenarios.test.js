import assert from 'node:assert/strict'
import test from 'node:test'

import { createHomeController } from '../index.js'
import { createLocalHomeViewProvider } from '../providers/localHomeViewProvider.js'
import {
  AMOUNT_MAXIMUM,
  AMOUNT_MINIMUM,
  AMOUNT_STEP,
  createLocalContentPayload,
  createLocalErrorPayload,
  createLocalLoadingPayload,
  localViewModes,
} from '../providers/localHomeViewData.js'
import { createRecordingPageLoadingAdapter } from './recordingPageLoadingAdapter.js'

test('isolated scenarios cover five views plus loading and error', () => {
  const controller = createHomeController()
  for (const mode of localViewModes) {
    controller.updateHomeView(createLocalContentPayload(mode, `scenario-test-${mode}`))
    assert.equal(controller.getState().viewMode, mode)
    assert.equal(controller.getState().diagnosticCode, null)
  }
  controller.updateHomeView(createLocalLoadingPayload('scenario-test-loading'))
  assert.equal(controller.getState().pageStatus, 'loading')
  controller.updateHomeView(createLocalErrorPayload('scenario-test-error'))
  assert.equal(controller.getState().pageStatus, 'error')
  controller.destroy()
})

test('recording adapter captures loading lifecycle outside production injection', () => {
  const loadingPort = createRecordingPageLoadingAdapter()
  const controller = createHomeController({ loadingPort })
  controller.updateHomeView(createLocalLoadingPayload('recorded-loading'))
  controller.updateHomeView(createLocalContentPayload('apply', 'recorded-content'))
  assert.deepEqual(loadingPort.calls, [
    { method: 'show', requestId: 'recorded-loading' },
    { method: 'hide', requestId: 'recorded-loading' },
  ])
  controller.destroy()
})

test('local provider supplies exact amount and term choices', () => {
  const payload = createLocalContentPayload('apply', 'selection-rules')
  const selection = payload.viewData.productSelection
  const amounts = selection.amountOptions.map(({ key }) => Number(key.replace('amount-', '')))

  assert.equal(amounts.length, ((AMOUNT_MAXIMUM - AMOUNT_MINIMUM) / AMOUNT_STEP) + 1)
  assert.equal(amounts[0], 100)
  assert.equal(amounts.at(-1), 5000)
  assert.ok(amounts.slice(1).every((amount, index) => amount - amounts[index] === 100))
  assert.equal(selection.selectedAmountKey, 'amount-5000')
  assert.deepEqual(selection.termOptions.map(({ key }) => key), ['term-91', 'term-120', 'term-180'])
  assert.equal(selection.selectedTermKey, 'term-91')
})

test('local provider exposes loading before initial and return content models and cleans its timer', () => {
  const scheduledCallbacks = []
  const clearedTimers = []
  const controller = createHomeController()
  const provider = createLocalHomeViewProvider(controller, {
    initialMode: 'apply',
    schedule(callback) {
      scheduledCallbacks.push(callback)
      return `initial-loading-timer-${scheduledCallbacks.length}`
    },
    clearSchedule(timerId) {
      clearedTimers.push(timerId)
    },
  })

  provider.start()
  assert.equal(controller.getState().pageStatus, 'loading')
  scheduledCallbacks[0]()
  assert.equal(controller.getState().pageStatus, 'content')

  provider.reload()
  assert.equal(controller.getState().pageStatus, 'loading')
  scheduledCallbacks[1]()
  assert.equal(controller.getState().pageStatus, 'content')

  provider.reload()
  provider.destroy()
  assert.deepEqual(clearedTimers, ['initial-loading-timer-3'])
  controller.destroy()
})

test('local provider switches pull refresh from content to an associated skeleton before completion', () => {
  const scheduledCallbacks = []
  let provider
  const controller = createHomeController({
    createRequestId: (() => { let sequence = 0; return () => `refresh-operation-${++sequence}` })(),
    onOperation(operation) {
      provider.handleOperation(operation)
    },
  })
  provider = createLocalHomeViewProvider(controller, {
    initialMode: 'apply',
    initialLoading: false,
    schedule(callback) {
      scheduledCallbacks.push(callback)
      return `refresh-loading-timer-${scheduledCallbacks.length}`
    },
    clearSchedule() {},
  })

  provider.start()
  assert.equal(controller.getState().pageStatus, 'content')
  const refreshOperationId = controller.refresh()
  assert.equal(controller.getState().pageStatus, 'loading')
  assert.equal(controller.getState().sourceOperationId, refreshOperationId)
  assert.equal(controller.getState().viewData, null)
  scheduledCallbacks[0]()
  assert.equal(controller.getState().pageStatus, 'content')
  assert.equal(controller.getState().isRefreshPending, false)
  provider.destroy()
  controller.destroy()
})

test('local provider reflects amount steps and term selection through new view models', () => {
  const operations = []
  let provider
  const controller = createHomeController({
    createRequestId: (() => { let sequence = 0; return () => `selection-operation-${++sequence}` })(),
    onOperation(operation) {
      operations.push(operation)
      provider.handleOperation(operation)
    },
  })
  provider = createLocalHomeViewProvider(controller, { initialMode: 'apply', initialLoading: false, schedule: () => 0 })
  provider.start()

  assert.equal(controller.getState().viewData.productSelection.selectedAmountKey, 'amount-5000')
  assert.equal(controller.selectAdjacentAmount('next'), undefined)
  assert.equal(operations.length, 0)

  controller.selectAdjacentAmount('previous')
  assert.equal(controller.getState().viewData.productSelection.selectedAmountKey, 'amount-4900')
  controller.selectAdjacentAmount('next')
  assert.equal(controller.getState().viewData.productSelection.selectedAmountKey, 'amount-5000')

  for (let amount = 4900; amount >= 100; amount -= 100) controller.selectAdjacentAmount('previous')
  assert.equal(controller.getState().viewData.productSelection.selectedAmountKey, 'amount-100')
  const operationCountAtMinimum = operations.length
  assert.equal(controller.selectAdjacentAmount('previous'), undefined)
  assert.equal(operations.length, operationCountAtMinimum)

  controller.selectTerm('term-120')
  controller.selectTerm('term-180')
  assert.equal(controller.getState().viewData.productSelection.selectedTermKey, 'term-180')
  controller.primaryAction()
  assert.deepEqual(operations.at(-1).data, { amountKey: 'amount-100', termKey: 'term-180' })

  controller.destroy()
})

test('local provider keeps product selections isolated by view mode', () => {
  let provider
  const controller = createHomeController({ onOperation: (operation) => provider.handleOperation(operation) })
  provider = createLocalHomeViewProvider(controller, { initialMode: 'apply', initialLoading: false, schedule: () => 0 })
  provider.start()
  controller.selectAmount('amount-1200')
  controller.selectTerm('term-120')

  assert.equal(provider.setMode('reviewing'), true)
  assert.equal(controller.getState().viewData.productSelection.selectedAmountKey, 'amount-5000')
  assert.equal(controller.getState().viewData.productSelection.selectedTermKey, 'term-91')
  assert.equal(provider.setMode('missing'), false)
  assert.equal(provider.setMode('apply'), true)
  assert.equal(controller.getState().viewData.productSelection.selectedAmountKey, 'amount-1200')
  assert.equal(controller.getState().viewData.productSelection.selectedTermKey, 'term-120')

  controller.destroy()
})
