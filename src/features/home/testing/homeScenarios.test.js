import assert from 'node:assert/strict'
import test from 'node:test'

import { createHomeController } from '../index.js'
import { createLocalHomeViewProvider } from '../providers/localHomeViewProvider.js'
import { createLocalMultiPushHomeViewData } from '../providers/localMultiPushHomeViewData.js'
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

test('multi-push loading keeps its mode while returning to the cached home tab', () => {
  const scheduledCallbacks = []
  const controller = createHomeController()
  const provider = createLocalHomeViewProvider(controller, {
    initialMode: 'multi_push',
    schedule(callback) {
      scheduledCallbacks.push(callback)
      return scheduledCallbacks.length
    },
    clearSchedule() {},
  })

  provider.start()
  scheduledCallbacks[0]()
  assert.equal(controller.getState().homeMode, 'multi_push')

  provider.reload()
  assert.equal(controller.getState().pageStatus, 'loading')
  assert.equal(controller.getState().homeMode, 'multi_push')

  provider.destroy()
  controller.destroy()
})

test('local provider reloads multi-push credit data for the dedicated refresh operation', () => {
  const scheduledCallbacks = []
  let provider
  const controller = createHomeController({
    onOperation(operation) { provider.handleOperation(operation) },
  })
  provider = createLocalHomeViewProvider(controller, {
    initialMode: 'multi_push',
    initialLoading: false,
    schedule(callback) {
      scheduledCallbacks.push(callback)
      return scheduledCallbacks.length
    },
    clearSchedule() {},
  })

  provider.start()
  assert.equal(controller.getState().pageStatus, 'content')
  const refreshOperationId = controller.refreshCredit()
  assert.equal(controller.getState().pageStatus, 'loading')
  assert.equal(controller.getState().sourceOperationId, refreshOperationId)
  assert.equal(controller.getState().homeMode, 'multi_push')
  scheduledCallbacks[0]()
  assert.equal(controller.getState().pageStatus, 'content')
  assert.equal(controller.getState().isCreditRefreshPending, false)

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

test('rejected status only emits the page operation and does not initiate a permission flow', () => {
  let provider
  const operations = []
  const controller = createHomeController({ onOperation: (operation) => {
    operations.push(operation)
    provider.handleOperation(operation)
  } })
  provider = createLocalHomeViewProvider(controller, {
    initialMode: 'rejected',
    initialLoading: false,
    schedule: () => 0,
  })

  provider.start()
  assert.equal(controller.getState().overlayNotice, null)
  controller.primaryAction()
  assert.equal(controller.getState().overlayNotice, null)
  assert.equal(operations.length, 1)
  assert.equal(operations[0].type, 'primary_action')

  provider.destroy()
  controller.destroy()
})

test('multi-push empty selected products shows the configured toast without an overlay', () => {
  let provider
  const base = createLocalMultiPushHomeViewData('multi-available-only')
  const emptyProductsData = {
    ...base,
    availableProductCount: 1,
    activeLoanCount: 0,
    allProcessing: false,
    primaryAction: 'apply',
    products: [],
    selectedProductCount: 0,
    selectedMinimumAmount: 'S/ 0',
    minimumSelectionCount: 0,
  }
  const controller = createHomeController({ onOperation: (operation) => provider.handleOperation(operation) })
  provider = createLocalHomeViewProvider(controller, {
    initialMode: 'multi_push',
    initialLoading: false,
    multiPushData: emptyProductsData,
  })

  provider.start()
  controller.primaryAction()
  assert.equal(controller.getState().overlayNotice, null)
  assert.deepEqual(controller.getState().toastNotice, {
    noticeId: 'local-home-toast-1',
    messageId: '10',
    text: 'No hay productos disponibles. Inténtalo mañana.',
  })

  provider.destroy()
  controller.destroy()
})

test('home notice payloads only accept their configured message ids', () => {
  const controller = createHomeController()
  controller.updateHomeView({
    ...createLocalContentPayload('apply', 'notice-contract-cash'),
    overlayNotice: { noticeId: 'notice-1', messageId: '10', text: 'invalid' },
  })
  assert.equal(controller.getState().pageStatus, 'error')

  const multiPushData = createLocalMultiPushHomeViewData('multi-available-only')
  const multiPushController = createHomeController()
  multiPushController.updateHomeView({
    requestId: 'notice-contract-multi',
    pageStatus: 'content',
    homeMode: 'multi_push',
    multiPushViewData: multiPushData,
    toastNotice: { noticeId: 'toast-1', messageId: '20', text: 'invalid' },
  })
  assert.equal(multiPushController.getState().pageStatus, 'error')
  controller.destroy()
  multiPushController.destroy()
})

test('multi-push provider enforces minimum selection and submits ordered unique ids', () => {
  const operations = []
  let provider
  const controller = createHomeController({ onOperation: (operation) => {
    operations.push(operation)
    provider.handleOperation(operation)
  } })
  const base = createLocalMultiPushHomeViewData('multi-available-only')
  const multiPushData = {
    ...base,
    availableProductCount: 2,
    products: base.products.slice(0, 2).map((item, index) => ({
      ...item,
      id: `product-${String(index + 1).padStart(3, '0')}`,
      name: index === 0 ? item.name : 'Segunda solución',
      selected: true,
    })),
    selectedProductCount: 2,
    selectedMinimumAmount: 'S/ 200',
    availableAmount: 'S/ 200',
  }
  provider = createLocalHomeViewProvider(controller, {
    initialMode: 'multi_push',
    initialLoading: false,
    multiPushData,
  })
  provider.start()

  controller.toggleProductSelection('product-001', false)
  assert.equal(controller.getState().multiPushViewData.selectedProductCount, 1)
  controller.toggleProductSelection('product-002', false)
  assert.equal(controller.getState().multiPushViewData.selectedProductCount, 1)
  assert.equal(operations.filter(({ type }) => type === 'toggle_product_selection').length, 1)

  controller.toggleProductSelection('product-001', true)
  controller.submitSelectedProducts(['product-001', 'product-002', 'product-001'])
  assert.equal(operations.at(-1).type, 'submit_selected_products')
  assert.deepEqual(operations.at(-1).data.productIds, ['product-001', 'product-002'])

  controller.destroy()
})
