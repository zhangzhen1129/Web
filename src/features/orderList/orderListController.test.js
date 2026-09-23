import assert from 'node:assert/strict'
import test from 'node:test'

import { createOrderListController } from './orderListController.js'
import { ORDER_LIST_ROOT_STATE } from './orderListConstants.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue
    reject = rejectValue
  })
  return { promise, resolve, reject }
}

function order(orderId, statusCode, overrides = {}) {
  return {
    key: orderId,
    orderId,
    productIconUrl: 'https://example.com/icon.png',
    productName: 'Prestamo',
    amountText: '1500',
    dateText: '2025-11-20',
    actionText: 'Pagar ahora',
    statusCode,
    filterKey: 'pendingPayment',
    cardMode: 'repayment',
    ...overrides,
  }
}

function createHarness(loadOrders) {
  const calls = []
  const service = {
    async loadOrders(request) {
      calls.push(['load', request])
      return loadOrders ? loadOrders(request, calls) : { type: 'success', orders: [] }
    },
  }
  const controller = createOrderListController({
    service,
    showNativeLoading: () => calls.push(['loading:show']),
    hideNativeLoading: () => calls.push(['loading:hide']),
    navigateOrderDetail: (payload) => calls.push(['detail', payload]),
    navigateHome: () => calls.push(['home']),
    onBusinessFailure: (message) => calls.push(['business-failure', message]),
    onRequestFailure: (message) => calls.push(['request-failure', message]),
  })
  return { controller, calls }
}

async function flush() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

function countOf(calls, name) {
  return calls.filter(([entry]) => entry === name).length
}

test('loads once on start, shows native loading and defaults to the pending payment filter', async () => {
  const { controller, calls } = createHarness(async () => ({
    type: 'success',
    orders: [order('ORDER-10', 10), order('ORDER-80', 80), order('ORDER-90', 90)],
  }))

  controller.start()
  assert.equal(controller.getState().rootState, ORDER_LIST_ROOT_STATE.LOADING)
  await flush()

  const state = controller.getState()
  assert.equal(countOf(calls, 'load'), 1)
  assert.equal(countOf(calls, 'loading:show'), 1)
  assert.equal(countOf(calls, 'loading:hide'), 1)
  assert.equal(state.rootState, ORDER_LIST_ROOT_STATE.LIST)
  assert.equal(state.activeFilter, 'pendingPayment')
  assert.deepEqual(state.visibleOrders.map((item) => item.orderId), ['ORDER-80', 'ORDER-90'])
  assert.deepEqual(state.allOrders.map((item) => item.orderId), ['ORDER-10', 'ORDER-80', 'ORDER-90'])
})

test('start is idempotent for the same page instance', async () => {
  const { controller, calls } = createHarness()
  controller.start()
  controller.start()
  await flush()

  assert.equal(countOf(calls, 'load'), 1)
})

test('empty success renders the empty root state', async () => {
  const { controller } = createHarness()
  controller.start()
  await flush()

  assert.equal(controller.getState().rootState, ORDER_LIST_ROOT_STATE.EMPTY)
})

test('filter switching only re-filters the confirmed collection without a new request', async () => {
  const { controller, calls } = createHarness(async () => ({
    type: 'success',
    orders: [order('ORDER-10', 10), order('ORDER-80', 80), order('ORDER-100', 100)],
  }))
  controller.start()
  await flush()

  assert.equal(controller.setFilter('reviewing'), true)
  assert.deepEqual(controller.getState().visibleOrders.map((item) => item.orderId), ['ORDER-10'])

  assert.equal(controller.setFilter('history'), true)
  assert.deepEqual(controller.getState().visibleOrders.map((item) => item.orderId), ['ORDER-100'])

  assert.equal(controller.setFilter('pendingPayment'), true)
  assert.deepEqual(controller.getState().visibleOrders.map((item) => item.orderId), ['ORDER-80'])

  assert.equal(countOf(calls, 'load'), 1)
  assert.equal(countOf(calls, 'loading:show'), 1)
  assert.equal(countOf(calls, 'loading:hide'), 1)
})

test('filter switching rejects unknown filters and is unavailable before a confirmed result', async () => {
  const pending = deferred()
  const { controller } = createHarness(() => pending.promise)
  controller.start()

  assert.equal(controller.setFilter('reviewing'), false)
  pending.resolve({ type: 'success', orders: [order('ORDER-80', 80)] })
  await flush()

  assert.equal(controller.setFilter('unknown'), false)
  assert.equal(controller.getState().activeFilter, 'pendingPayment')
})

test('a filter chosen during refresh is applied immediately and preserved by the refresh result', async () => {
  const refreshCall = deferred()
  let loadCount = 0
  const { controller, calls } = createHarness(() => {
    loadCount += 1
    if (loadCount === 1) {
      return Promise.resolve({
        type: 'success',
        orders: [order('ORDER-80', 80), order('ORDER-10', 10)],
      })
    }
    return refreshCall.promise
  })
  controller.start()
  await flush()

  assert.equal(controller.refresh(), true)
  assert.equal(controller.getState().rootState, ORDER_LIST_ROOT_STATE.LIST)
  assert.equal(controller.getState().refreshing, true)

  assert.equal(controller.setFilter('history'), true)
  assert.equal(controller.getState().rootState, ORDER_LIST_ROOT_STATE.EMPTY)
  assert.equal(countOf(calls, 'load'), 2)

  refreshCall.resolve({
    type: 'success',
    orders: [order('ORDER-80', 80), order('ORDER-100', 100)],
  })
  await flush()

  const state = controller.getState()
  assert.equal(state.activeFilter, 'history')
  assert.deepEqual(state.visibleOrders.map((item) => item.orderId), ['ORDER-100'])
  assert.equal(state.rootState, ORDER_LIST_ROOT_STATE.LIST)
  assert.equal(state.refreshing, false)
  assert.equal(countOf(calls, 'load'), 2)
})

test('business failure renders the fixed error text and keeps the server message in the toast only', async () => {
  const { controller, calls } = createHarness(async () => ({
    type: 'business_failure',
    message: 'Try again',
  }))
  controller.start()
  await flush()

  assert.deepEqual(calls.find(([name]) => name === 'business-failure'), ['business-failure', 'Try again'])
  assert.equal(controller.getState().rootState, ORDER_LIST_ROOT_STATE.ERROR)
  assert.equal(controller.getState().errorMessage, 'error')
})

test('request failure renders the fixed error text and reports the same controlled text', async () => {
  const { controller, calls } = createHarness(async () => {
    throw new Error('Network unavailable')
  })
  controller.start()
  await flush()

  assert.deepEqual(calls.find(([name]) => name === 'request-failure'), ['request-failure', 'error'])
  assert.equal(controller.getState().rootState, ORDER_LIST_ROOT_STATE.ERROR)
  assert.equal(controller.getState().errorMessage, 'error')
})

test('invalid response renders the fixed error text without a toast', async () => {
  const { controller, calls } = createHarness(async () => ({
    type: 'invalid_response',
    code: 'ORDER_LIST_STATUS_INVALID',
  }))
  controller.start()
  await flush()

  assert.equal(countOf(calls, 'business-failure'), 0)
  assert.equal(countOf(calls, 'request-failure'), 0)
  assert.equal(controller.getState().rootState, ORDER_LIST_ROOT_STATE.ERROR)
  assert.equal(controller.getState().errorMessage, 'error')
})

test('refresh keeps the confirmed content and root state until it resolves', async () => {
  const refreshCall = deferred()
  let loadCount = 0
  const { controller } = createHarness(() => {
    loadCount += 1
    if (loadCount === 1) return Promise.resolve({ type: 'success', orders: [order('ORDER-80', 80)] })
    return refreshCall.promise
  })
  controller.start()
  await flush()

  assert.equal(controller.refresh(), true)
  assert.equal(controller.getState().rootState, ORDER_LIST_ROOT_STATE.LIST)
  assert.deepEqual(controller.getState().visibleOrders.map((item) => item.orderId), ['ORDER-80'])
  assert.equal(controller.getState().refreshing, true)

  refreshCall.resolve({ type: 'invalid_response', code: 'ORDER_LIST_LIST_INVALID' })
  await flush()

  const state = controller.getState()
  assert.equal(state.rootState, ORDER_LIST_ROOT_STATE.LIST)
  assert.deepEqual(state.visibleOrders.map((item) => item.orderId), ['ORDER-80'])
  assert.equal(state.refreshing, false)
})

test('refresh is unavailable during the first loading cycle and while another refresh runs', async () => {
  const pending = deferred()
  const { controller } = createHarness(() => pending.promise)
  controller.start()

  assert.equal(controller.refresh(), false)

  pending.resolve({ type: 'success', orders: [order('ORDER-80', 80)] })
  await flush()

  const second = deferred()
  let loadCount = 0
  const harness = createHarness(() => {
    loadCount += 1
    if (loadCount === 1) return Promise.resolve({ type: 'success', orders: [order('ORDER-80', 80)] })
    return second.promise
  })
  harness.controller.start()
  await flush()

  assert.equal(harness.controller.refresh(), true)
  assert.equal(harness.controller.refresh(), false)
})

test('refresh recovers from the first-load error state', async () => {
  let loadCount = 0
  const { controller } = createHarness(() => {
    loadCount += 1
    if (loadCount === 1) return Promise.resolve({ type: 'invalid_response', code: 'ORDER_LIST_RESPONSE_INVALID' })
    return Promise.resolve({ type: 'success', orders: [order('ORDER-80', 80)] })
  })
  controller.start()
  await flush()
  assert.equal(controller.getState().rootState, ORDER_LIST_ROOT_STATE.ERROR)

  assert.equal(controller.refresh(), true)
  assert.equal(controller.getState().rootState, ORDER_LIST_ROOT_STATE.ERROR)
  await flush()

  assert.equal(controller.getState().rootState, ORDER_LIST_ROOT_STATE.LIST)
})

test('order detail navigation trims the order id and locks repeated navigation', async () => {
  const { controller, calls } = createHarness(async () => ({
    type: 'success',
    orders: [order('ORDER-80', 80)],
  }))
  controller.start()
  await flush()

  assert.equal(controller.requestOrderDetail(' ORDER-80 '), true)
  assert.equal(controller.requestOrderDetail('ORDER-80'), false)
  assert.deepEqual(calls.find(([name]) => name === 'detail'), ['detail', { orderId: 'ORDER-80' }])
  assert.equal(countOf(calls, 'detail'), 1)
})

test('order detail navigation rejects an empty order id', async () => {
  const { controller, calls } = createHarness()
  controller.start()
  await flush()

  assert.equal(controller.requestOrderDetail('   '), false)
  assert.equal(countOf(calls, 'detail'), 0)
})

test('card action routes status 10 to home and every other status to order detail', async () => {
  const { controller, calls } = createHarness()
  controller.start()
  await flush()

  assert.equal(controller.requestOrderAction(order('ORDER-10', 10)), true)
  assert.deepEqual(calls.find(([name]) => name === 'home'), ['home'])
  assert.equal(countOf(calls, 'detail'), 0)

  const second = createHarness()
  second.controller.start()
  await flush()

  assert.equal(second.controller.requestOrderAction(order('ORDER-80', 80)), true)
  assert.deepEqual(second.calls.find(([name]) => name === 'detail'), ['detail', { orderId: 'ORDER-80' }])
  assert.equal(countOf(second.calls, 'home'), 0)
})

test('card action ignores an unusable order payload', async () => {
  const { controller, calls } = createHarness()
  controller.start()
  await flush()

  assert.equal(controller.requestOrderAction(null), false)
  assert.equal(controller.requestOrderAction({ statusCode: 80, orderId: '' }), false)
  assert.equal(countOf(calls, 'detail'), 0)
  assert.equal(countOf(calls, 'home'), 0)
})

test('home navigation locks repeated navigation', async () => {
  const { controller, calls } = createHarness()
  controller.start()
  await flush()

  assert.equal(controller.requestHome(), true)
  assert.equal(controller.requestHome(), false)
  assert.equal(countOf(calls, 'home'), 1)
})

test('dispose cancels the active request and ignores a late result', async () => {
  const pending = deferred()
  const { controller, calls } = createHarness(() => pending.promise)
  controller.start()

  controller.dispose()
  pending.resolve({ type: 'success', orders: [order('ORDER-80', 80)] })
  await flush()

  assert.equal(countOf(calls, 'loading:hide'), 1)
  assert.equal(controller.getState().rootState, ORDER_LIST_ROOT_STATE.LOADING)
})

test('subscribers receive the initial state immediately', () => {
  const { controller } = createHarness()
  const seen = []
  const unsubscribe = controller.subscribe((nextState) => seen.push(nextState.rootState))

  assert.deepEqual(seen, [ORDER_LIST_ROOT_STATE.LOADING])
  unsubscribe()
})
