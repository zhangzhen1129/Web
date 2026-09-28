import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFER_HISTORY_PHASE } from './deferHistoryConstants.js'
import { createDeferHistoryController } from './deferHistoryController.js'

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

function record(overrides = {}) {
  return {
    approvalDate: '2031-04-05',
    amount: 1234,
    extendedTerm: 11,
    updatedDueDate: '2031-04-16',
    ...overrides,
  }
}

function createHarness(overrides = {}) {
  const calls = []
  const requests = []
  let abortCount = 0
  let enabledConfig = null
  const loadDeferHistory = overrides.loadDeferHistory
    ?? (async () => ({ type: 'success', records: [] }))

  const controller = createDeferHistoryController({
    services: {
      loadDeferHistory(input) {
        requests.push(input)
        return loadDeferHistory(input)
      },
    },
    showNativeLoading() {
      calls.push('show')
    },
    hideNativeLoading() {
      calls.push('hide')
    },
    setPhysicalBackIntercept(config) {
      if (config.enabled) enabledConfig = config
      calls.push(config.enabled ? 'back:enable' : 'back:disable')
      if (config.enabled && overrides.failPhysicalBackEnable) throw new Error('bridge unavailable')
      return config.enabled ? 'back-request' : null
    },
    createAbortController() {
      const signal = { aborted: false }
      return {
        signal,
        abort() {
          signal.aborted = true
          abortCount += 1
        },
      }
    },
    onBusinessFailure(message) {
      calls.push(`business:${message}`)
    },
    onRequestFailure(message) {
      calls.push(`request:${message}`)
    },
    onNavigateBack() {
      calls.push('navigate:back')
    },
  })

  const states = []
  const unsubscribe = controller.subscribe((state) => states.push(state))
  return {
    calls,
    requests,
    controller,
    states,
    unsubscribe,
    enabledConfig: () => enabledConfig,
    abortCount: () => abortCount,
  }
}

test('rejects invalid query contracts without loading, requests, or bridge setup', () => {
  const queries = [
    undefined,
    {},
    { orderId: '', orderStatus: '80' },
    { orderId: 'order-1' },
    { orderId: 'order-1', orderStatus: 80 },
    { orderId: 'order-1', orderStatus: '8.0' },
    { orderId: 'order-1', orderStatus: '80', productId: 1 },
    { orderId: 'order-1', orderStatus: '80', extra: 'x' },
  ]

  queries.forEach((query) => {
    const harness = createHarness()
    assert.equal(harness.controller.initialize(query), false)
    assert.equal(harness.requests.length, 0)
    assert.deepEqual(harness.calls, [])
    assert.equal(harness.controller.getState().phase, DEFER_HISTORY_PHASE.INACTIVE)
  })
})

test('emits the loading shell synchronously, then emits ready records and closes loading once', async () => {
  const pending = deferred()
  const harness = createHarness({ loadDeferHistory: () => pending.promise })

  assert.equal(harness.controller.initialize({
    orderId: 'order-1',
    productId: 'product-1',
    orderStatus: '80',
  }), true)

  assert.equal(harness.controller.getState().phase, DEFER_HISTORY_PHASE.LOADING)
  assert.deepEqual(harness.controller.getState().records, [])
  assert.equal(harness.requests.length, 1)
  assert.equal(harness.calls.filter((call) => call === 'show').length, 1)
  assert.equal(harness.calls.filter((call) => call === 'back:enable').length, 1)

  pending.resolve({ type: 'success', records: [record()] })
  await flush()

  const state = harness.controller.getState()
  assert.equal(state.phase, DEFER_HISTORY_PHASE.READY)
  assert.equal(state.records.length, 1)
  assert.equal(state.records[0].amountText, 'S/ 1,234')
  assert.equal(state.records[0].extendedTermText, '11 días')
  assert.equal(harness.calls.filter((call) => call === 'hide').length, 1)
  assert.equal(harness.controller.initialize({ orderId: 'order-2', orderStatus: '80' }), false)
  assert.equal(harness.requests.length, 1)
})

test('uses explicit terminal handling for business failures and invalid results', async () => {
  const business = createHarness({
    loadDeferHistory: async () => ({ type: 'business_failure', message: '  Try again.  ' }),
  })
  business.controller.initialize({ orderId: 'order-1', orderStatus: '80' })
  await flush()
  assert.equal(business.controller.getState().phase, DEFER_HISTORY_PHASE.ERROR)
  assert.equal(business.calls.filter((call) => call === 'business:Try again.').length, 1)
  assert.equal(business.calls.filter((call) => call === 'hide').length, 1)

  const invalidMessage = createHarness({
    loadDeferHistory: async () => ({ type: 'business_failure', message: 42 }),
  })
  invalidMessage.controller.initialize({ orderId: 'order-1', orderStatus: '80' })
  await flush()
  assert.equal(invalidMessage.controller.getState().phase, DEFER_HISTORY_PHASE.ERROR)
  assert.equal(invalidMessage.calls.some((call) => call.startsWith('business:')), false)

  const invalidResponse = createHarness({
    loadDeferHistory: async () => ({ type: 'invalid_response', message: 'must not display' }),
  })
  invalidResponse.controller.initialize({ orderId: 'order-1', orderStatus: '80' })
  await flush()
  assert.equal(invalidResponse.controller.getState().phase, DEFER_HISTORY_PHASE.ERROR)
  assert.equal(invalidResponse.calls.some((call) => call.startsWith('business:')), false)
  assert.equal(invalidResponse.calls.filter((call) => call === 'hide').length, 1)
})

test('reports normalized request exceptions once and skips handled or canceled errors', async () => {
  const requestHarness = createHarness({
    loadDeferHistory: async () => {
      const error = new Error('internal message')
      error.displayMessage = '  Network unavailable.  '
      throw error
    },
  })
  requestHarness.controller.initialize({ orderId: 'order-1', orderStatus: '80' })
  await flush()
  assert.equal(requestHarness.controller.getState().phase, DEFER_HISTORY_PHASE.ERROR)
  assert.equal(requestHarness.calls.filter((call) => call === 'request:Network unavailable.').length, 1)
  assert.equal(requestHarness.calls.filter((call) => call === 'hide').length, 1)

  const handledHarness = createHarness({
    loadDeferHistory: async () => {
      const error = new Error('global handling')
      error.businessHandled = true
      error.displayMessage = 'Global business message.'
      throw error
    },
  })
  handledHarness.controller.initialize({ orderId: 'order-1', orderStatus: '80' })
  await flush()
  assert.equal(handledHarness.controller.getState().phase, DEFER_HISTORY_PHASE.ERROR)
  assert.equal(handledHarness.calls.some((call) => call.startsWith('request:')), false)
  assert.equal(handledHarness.calls.filter((call) => call === 'hide').length, 1)

  const canceledHarness = createHarness({
    loadDeferHistory: async () => {
      const error = new Error('canceled')
      error.category = 'canceled'
      throw error
    },
  })
  canceledHarness.controller.initialize({ orderId: 'order-1', orderStatus: '80' })
  await flush()
  assert.equal(canceledHarness.controller.getState().phase, DEFER_HISTORY_PHASE.LOADING)
  assert.equal(canceledHarness.calls.some((call) => call.startsWith('request:')), false)
  assert.equal(canceledHarness.calls.filter((call) => call === 'hide').length, 1)
  canceledHarness.controller.requestBack()
})

test('uses one controlled cleanup for physical and visible back', async () => {
  const pending = deferred()
  const harness = createHarness({ loadDeferHistory: () => pending.promise })
  harness.controller.initialize({ orderId: 'order-1', orderStatus: '80' })

  const enabledConfig = harness.enabledConfig()
  enabledConfig.onIntercept()
  enabledConfig.onIntercept()
  assert.equal(harness.controller.requestBack(), false)
  assert.equal(harness.calls.filter((call) => call === 'navigate:back').length, 1)
  assert.equal(harness.calls.filter((call) => call === 'back:disable').length, 1)
  assert.equal(harness.calls.filter((call) => call === 'hide').length, 1)
  assert.equal(harness.abortCount(), 1)
  assert.equal(harness.controller.getState().navigationLocked, true)

  pending.resolve({ type: 'success', records: [record()] })
  await flush()
  assert.equal(harness.controller.getState().phase, DEFER_HISTORY_PHASE.INACTIVE)
  assert.deepEqual(harness.controller.getState().records, [])
})

test('ignores canceled results and all late results after back or dispose', async () => {
  const canceled = deferred()
  const canceledHarness = createHarness({ loadDeferHistory: () => canceled.promise })
  canceledHarness.controller.initialize({ orderId: 'order-1', orderStatus: '80' })
  canceled.resolve({ type: 'canceled' })
  await flush()
  assert.equal(canceledHarness.controller.getState().phase, DEFER_HISTORY_PHASE.LOADING)
  assert.equal(canceledHarness.calls.filter((call) => call === 'hide').length, 1)
  assert.equal(canceledHarness.calls.some((call) => call.startsWith('business:')), false)

  const late = deferred()
  const lateHarness = createHarness({ loadDeferHistory: () => late.promise })
  lateHarness.controller.initialize({ orderId: 'order-1', orderStatus: '80' })
  lateHarness.controller.requestBack()
  late.resolve({ type: 'success', records: [record()] })
  await flush()
  assert.equal(lateHarness.controller.getState().phase, DEFER_HISTORY_PHASE.INACTIVE)
  assert.deepEqual(lateHarness.controller.getState().records, [])

  const disposed = deferred()
  const disposedHarness = createHarness({ loadDeferHistory: () => disposed.promise })
  disposedHarness.controller.initialize({ orderId: 'order-1', orderStatus: '80' })
  assert.equal(disposedHarness.controller.dispose(), true)
  disposed.resolve({ type: 'success', records: [record()] })
  await flush()
  assert.equal(disposedHarness.controller.getState().phase, DEFER_HISTORY_PHASE.INACTIVE)
  assert.equal(disposedHarness.calls.includes('navigate:back'), false)
  assert.equal(disposedHarness.calls.filter((call) => call === 'hide').length, 1)
})

test('does not block visible return when physical back setup fails', async () => {
  const pending = deferred()
  const harness = createHarness({
    loadDeferHistory: () => pending.promise,
    failPhysicalBackEnable: true,
  })
  harness.controller.initialize({ orderId: 'order-1', orderStatus: '80' })
  assert.equal(harness.controller.requestBack(), true)
  assert.equal(harness.calls.filter((call) => call === 'navigate:back').length, 1)
  assert.equal(harness.calls.filter((call) => call === 'hide').length, 1)
})


