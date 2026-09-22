import assert from 'node:assert/strict'
import test from 'node:test'

import { createRepaymentController } from './repaymentController.js'
import { REPAYMENT_ROOT_STATE } from './repaymentConstants.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue
    reject = rejectValue
  })
  return { promise, resolve, reject }
}

function createHarness(serviceOverrides = {}) {
  const calls = []
  const service = {
    async loadOrders(request) {
      calls.push(['load', request])
      return serviceOverrides.loadOrders ? serviceOverrides.loadOrders(request) : { type: 'success', orders: [] }
    },
  }
  const controller = createRepaymentController({
    service,
    showNativeLoading: () => calls.push(['loading:show']),
    hideNativeLoading: () => calls.push(['loading:hide']),
    setRepaymentCount: (value) => {
      calls.push(['count', value])
      return true
    },
    navigateOrderDetail: (payload) => calls.push(['detail', payload]),
    navigateHome: () => calls.push(['home']),
    onBusinessFailure: (message) => calls.push(['business-failure', message]),
    onRequestFailure: (message) => calls.push(['request-failure', message]),
  })
  return { controller, calls }
}

async function flush() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve()
}

test('loads once on start and publishes a non-empty list count', async () => {
  const { controller, calls } = createHarness({
    loadOrders: async () => ({ type: 'success', orders: [{ key: '0', orderId: 'ORDER-1' }] }),
  })

  controller.start()
  assert.equal(controller.getState().rootState, REPAYMENT_ROOT_STATE.LOADING)
  await flush()

  assert.deepEqual(calls.filter(([name]) => name === 'load').length, 1)
  assert.deepEqual(calls.filter(([name]) => name === 'loading:show').length, 1)
  assert.deepEqual(calls.find(([name]) => name === 'count'), ['count', 1])
  assert.equal(controller.getState().rootState, REPAYMENT_ROOT_STATE.LIST)
  assert.deepEqual(calls.filter(([name]) => name === 'loading:hide').length, 1)
})

test('empty success publishes zero and renders the empty root state', async () => {
  const { controller, calls } = createHarness()
  controller.start()
  await flush()

  assert.deepEqual(calls.find(([name]) => name === 'count'), ['count', 0])
  assert.equal(controller.getState().rootState, REPAYMENT_ROOT_STATE.EMPTY)
})

test('business failure preserves the previous count and renders error', async () => {
  const { controller, calls } = createHarness({
    loadOrders: async () => ({ type: 'business_failure', message: 'Try again' }),
  })
  controller.start()
  await flush()

  assert.equal(calls.some(([name]) => name === 'count'), false)
  assert.deepEqual(calls.find(([name]) => name === 'business-failure'), ['business-failure', 'Try again'])
  assert.equal(controller.getState().rootState, REPAYMENT_ROOT_STATE.ERROR)
  assert.equal(controller.getState().errorMessage, 'Try again')
})

test('request exception renders error without publishing a count', async () => {
  const { controller, calls } = createHarness({
    loadOrders: async () => {
      const error = new Error('Network unavailable')
      throw error
    },
  })
  controller.start()
  await flush()

  assert.equal(calls.some(([name]) => name === 'count'), false)
  assert.deepEqual(calls.find(([name]) => name === 'request-failure'), ['request-failure', 'No se pudieron cargar los pedidos.'])
  assert.equal(controller.getState().rootState, REPAYMENT_ROOT_STATE.ERROR)
})

test('invalid response renders error without a toast', async () => {
  const { controller, calls } = createHarness({
    loadOrders: async () => ({ type: 'invalid_response', code: 'REPAYMENT_ORDER_LIST_INVALID' }),
  })
  controller.start()
  await flush()

  assert.equal(calls.some(([name]) => name === 'request-failure'), false)
  assert.equal(calls.some(([name]) => name === 'business-failure'), false)
  assert.equal(controller.getState().rootState, REPAYMENT_ROOT_STATE.ERROR)
  assert.equal(controller.getState().errorMessage, 'No se pudieron cargar los pedidos.')
})

test('activation before the first terminal keeps the skeleton and ignores the stale result', async () => {
  const first = deferred()
  const second = deferred()
  const service = {
    loadOrders: async () => (service.calls++ === 0 ? first.promise : second.promise),
    calls: 0,
  }
  const { controller, calls } = createHarness({ loadOrders: service.loadOrders })

  controller.start()
  assert.equal(controller.getState().rootState, REPAYMENT_ROOT_STATE.LOADING)
  controller.activate()
  assert.equal(controller.getState().rootState, REPAYMENT_ROOT_STATE.LOADING)

  first.resolve({ type: 'success', orders: [{ key: 'old', orderId: 'OLD' }] })
  await flush()
  assert.equal(controller.getState().orders.length, 0)
  assert.equal(calls.some(([name, value]) => name === 'count' && value === 1), false)

  second.resolve({ type: 'success', orders: [{ key: 'new', orderId: 'NEW' }] })
  await flush()
  assert.equal(controller.getState().orders[0].orderId, 'NEW')
  assert.equal(controller.getState().rootState, REPAYMENT_ROOT_STATE.LIST)
})

test('reactivation keeps the confirmed list visible until the refresh succeeds', async () => {
  const refresh = deferred()
  let callCount = 0
  const { controller, calls } = createHarness({
    loadOrders: async () => {
      callCount += 1
      if (callCount === 1) return { type: 'success', orders: [{ key: 'old', orderId: 'OLD' }] }
      return refresh.promise
    },
  })

  controller.start()
  await flush()
  assert.equal(controller.getState().rootState, REPAYMENT_ROOT_STATE.LIST)
  assert.equal(controller.getState().orders[0].orderId, 'OLD')

  controller.activate()
  assert.equal(controller.getState().rootState, REPAYMENT_ROOT_STATE.LIST)
  assert.equal(controller.getState().orders[0].orderId, 'OLD')
  assert.equal(controller.getState().refreshing, true)
  assert.equal(calls.filter(([name]) => name === 'loading:show').length, 2)

  refresh.resolve({ type: 'success', orders: [{ key: 'new', orderId: 'NEW' }] })
  await flush()
  assert.equal(controller.getState().rootState, REPAYMENT_ROOT_STATE.LIST)
  assert.equal(controller.getState().orders[0].orderId, 'NEW')
  assert.equal(controller.getState().refreshing, false)
})

test('failed reactivation keeps the confirmed list and reports only the refresh failure', async () => {
  let callCount = 0
  const { controller, calls } = createHarness({
    loadOrders: async () => {
      callCount += 1
      return callCount === 1
        ? { type: 'success', orders: [{ key: 'old', orderId: 'OLD' }] }
        : { type: 'business_failure', message: 'Try again' }
    },
  })

  controller.start()
  await flush()
  controller.activate()
  await flush()

  assert.equal(controller.getState().rootState, REPAYMENT_ROOT_STATE.LIST)
  assert.equal(controller.getState().orders[0].orderId, 'OLD')
  assert.equal(controller.getState().refreshing, false)
  assert.deepEqual(calls.find(([name]) => name === 'business-failure'), ['business-failure', 'Try again'])
})

test('invalid reactivation response keeps the confirmed list without a toast', async () => {
  let callCount = 0
  const { controller, calls } = createHarness({
    loadOrders: async () => {
      callCount += 1
      return callCount === 1
        ? { type: 'success', orders: [{ key: 'old', orderId: 'OLD' }] }
        : { type: 'invalid_response', code: 'REPAYMENT_ORDER_LIST_INVALID' }
    },
  })

  controller.start()
  await flush()
  controller.activate()
  await flush()

  assert.equal(controller.getState().rootState, REPAYMENT_ROOT_STATE.LIST)
  assert.equal(controller.getState().orders[0].orderId, 'OLD')
  assert.equal(calls.some(([name]) => name === 'request-failure' || name === 'business-failure'), false)
})

test('deactivation aborts the active request and hides loading once', async () => {
  const pending = deferred()
  const aborts = []
  const { controller, calls } = createHarness({
    loadOrders: async () => pending.promise,
  })
  const originalCreate = controller
  assert.equal(typeof originalCreate.start, 'function')

  const abortableController = createRepaymentController({
    service: { loadOrders: async () => pending.promise },
    createAbortController: () => ({
      signal: 'signal',
      abort: () => aborts.push('abort'),
    }),
    showNativeLoading: () => calls.push(['loading:show']),
    hideNativeLoading: () => calls.push(['loading:hide']),
    setRepaymentCount: () => true,
    navigateOrderDetail() {},
    navigateHome() {},
  })

  abortableController.start()
  abortableController.deactivate()
  assert.deepEqual(aborts, ['abort'])
  assert.equal(calls.filter(([name]) => name === 'loading:hide').length, 1)
})

test('order-detail navigation is accepted once until activation resets the lock', async () => {
  const { controller, calls } = createHarness({
    loadOrders: async () => ({ type: 'success', orders: [{ key: '0', orderId: 'ORDER-1' }] }),
  })
  controller.start()
  await flush()

  assert.equal(controller.requestOrderDetail('ORDER-1'), true)
  assert.equal(controller.requestOrderDetail('ORDER-1'), false)
  assert.deepEqual(calls.filter(([name]) => name === 'detail'), [['detail', { orderId: 'ORDER-1' }]])
})
