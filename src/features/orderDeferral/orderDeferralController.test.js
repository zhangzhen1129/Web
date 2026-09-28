import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createOrderDeferralController,
  ORDER_DEFERRAL_PHASE,
} from './orderDeferralController.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function detailResult(overrides = {}) {
  return {
    type: 'success',
    detail: {
      billId: 'bill-001',
      applicationDate: '2025-11-20',
      dueDate: '2025-11-27',
      extensionDays: 7,
      paymentAmount: 20000,
      serviceFee: 1500,
      overdueFee: 300,
      ...overrides,
    },
  }
}

function createHarness({
  loadDeferralDetail = async () => detailResult(),
  submitDeferral = async () => ({
    type: 'success',
    paymentUrl: 'https://payments.example.test/order',
  }),
  openPaymentPage = () => true,
} = {}) {
  const events = []
  const requests = []
  let backCount = 0
  let helpCount = 0
  let interceptConfig = null
  const controller = createOrderDeferralController({
    services: {
      loadDeferralDetail(input) {
        requests.push({ type: 'detail', input })
        return loadDeferralDetail(input)
      },
      submitDeferral(input) {
        requests.push({ type: 'submit', input })
        return submitDeferral(input)
      },
    },
    showNativeLoading() {
      events.push('show')
    },
    hideNativeLoading() {
      events.push('hide')
    },
    openPaymentPage(url) {
      events.push(`open:${url}`)
      return openPaymentPage(url)
    },
    setPhysicalBackIntercept(config) {
      interceptConfig = config
      events.push(config.enabled ? 'back-enable' : 'back-disable')
      return config.enabled ? 'physical-back-request' : null
    },
    onBusinessFailure(message) {
      events.push(`business:${message}`)
    },
    onRequestFailure(message) {
      events.push(`request-error:${message}`)
    },
    onNavigateBack() {
      backCount += 1
      events.push('navigate-back')
    },
    onNavigateHelpCenter() {
      helpCount += 1
      events.push('navigate-help')
    },
  })
  const states = []
  const unsubscribe = controller.subscribe((state) => states.push(state))
  return {
    controller,
    events,
    requests,
    states,
    unsubscribe,
    get backCount() { return backCount },
    get helpCount() { return helpCount },
    get interceptConfig() { return interceptConfig },
  }
}

test('rejects every invalid route query shape without loading or requesting data', async () => {
  const invalidQueries = [
    {},
    { orderId: '' },
    { orderId: '   ' },
    { orderId: ['route-order-001'] },
    { orderId: 'route-order-001', extra: 'x' },
  ]

  for (const query of invalidQueries) {
    const harness = createHarness()
    assert.equal(harness.controller.initialize(query), false)
    await flush()
    assert.equal(harness.requests.length, 0)
    assert.deepEqual(harness.events, [])
  }
})

test('loads details once and enters the default collapsed ready state', async () => {
  const harness = createHarness()
  assert.equal(harness.controller.initialize({ orderId: 'route-order-001' }), true)
  const loadingState = harness.controller.getState()
  assert.equal(loadingState.phase, ORDER_DEFERRAL_PHASE.LOADING)
  assert.equal(loadingState.displayModel.extensionDaysText, '--')
  assert.equal(loadingState.displayModel.applicationDate, '--')
  assert.equal(loadingState.displayModel.dueDate, '--')
  assert.equal(loadingState.displayModel.paymentAmountText, '--')
  assert.equal(harness.controller.requestSubmit(), false)
  assert.equal(harness.requests.filter((request) => request.type === 'submit').length, 0)
  assert.equal(harness.states.at(-1).phase, ORDER_DEFERRAL_PHASE.LOADING)
  assert.deepEqual(harness.events.slice(0, 3), ['show', 'back-enable'])
  await flush()
  const state = harness.controller.getState()
  assert.equal(state.phase, ORDER_DEFERRAL_PHASE.READY)
  assert.equal(state.expanded, false)
  assert.equal(state.displayModel.extensionDaysText, '7')
  assert.equal(state.displayModel.paymentAmountText, 'S/ 20,000')
  assert.deepEqual(harness.requests.map((request) => request.type), ['detail'])
  assert.deepEqual(harness.requests[0].input, {
    orderId: 'route-order-001',
    signal: harness.requests[0].input.signal,
  })
  assert.equal(harness.events.includes('hide'), true)
})

test('keeps the rendered frame and placeholders after detail failure', async () => {
  const harness = createHarness({
    loadDeferralDetail: async () => ({ type: 'business_failure', message: 'No disponible' }),
  })
  harness.controller.initialize({ orderId: 'route-order-001' })
  await flush()
  const state = harness.controller.getState()
  assert.equal(state.phase, ORDER_DEFERRAL_PHASE.ERROR)
  assert.equal(state.displayModel.extensionDaysText, '--')
  assert.equal(state.displayModel.applicationDate, '--')
  assert.equal(state.displayModel.paymentAmountText, '--')
  assert.equal(harness.controller.toggleDetails(), true)
  assert.equal(harness.controller.getState().expanded, true)
  assert.equal(harness.controller.requestSubmit(), false)
  assert.equal(harness.requests.filter((request) => request.type === 'submit').length, 0)
})
test('toggles cost details locally without API or route effects', async () => {
  const harness = createHarness()
  harness.controller.initialize({ orderId: 'route-order-001' })
  const requestCount = harness.requests.length
  assert.equal(harness.controller.toggleDetails(), true)
  assert.equal(harness.controller.getState().expanded, true)
  assert.equal(harness.controller.toggleDetails(), true)
  assert.equal(harness.controller.getState().expanded, false)
  await flush()
  assert.equal(harness.requests.length, requestCount)
  assert.equal(harness.backCount, 0)
  assert.equal(harness.helpCount, 0)
})

test('prevents duplicate submission and supports separate later rounds', async () => {
  const first = deferred()
  const second = deferred()
  let submitCount = 0
  const harness = createHarness({
    submitDeferral: async () => {
      submitCount += 1
      return submitCount === 1 ? first.promise : second.promise
    },
  })
  harness.controller.initialize({ orderId: 'route-order-001' })
  await flush()

  assert.equal(harness.controller.requestSubmit(), true)
  assert.equal(harness.controller.requestSubmit(), false)
  assert.equal(harness.controller.getState().submitting, true)
  first.resolve({ type: 'success', paymentUrl: 'https://payments.example.test/first' })
  await flush()
  assert.equal(harness.controller.getState().submitting, false)
  assert.equal(harness.events.filter((event) => event.startsWith('open:')).length, 1)

  assert.equal(harness.controller.requestSubmit(), true)
  second.resolve({ type: 'success', paymentUrl: 'https://payments.example.test/second' })
  await flush()
  assert.equal(harness.controller.getState().submitting, false)
  assert.equal(harness.events.filter((event) => event.startsWith('open:')).length, 2)
  assert.equal(harness.requests.filter((request) => request.type === 'submit').length, 2)
})

test('hides loading and reports only business failures and request exceptions', async () => {
  const harness = createHarness({
    submitDeferral: async () => ({ type: 'business_failure', message: 'business failed' }),
  })
  harness.controller.initialize({ orderId: 'route-order-001' })
  await flush()
  harness.controller.requestSubmit()
  await flush()
  assert.equal(harness.controller.getState().submitting, false)
  assert.equal(harness.controller.getState().phase, ORDER_DEFERRAL_PHASE.READY)
  assert.equal(harness.events.includes('business:business failed'), true)
  assert.equal(harness.events.includes('hide'), true)
  assert.equal(harness.events.some((event) => event.startsWith('open:')), false)

  const requestHarness = createHarness({
    submitDeferral: async () => {
      const error = new Error('request failed')
      error.displayMessage = 'safe request failed'
      error.category = 'network'
      throw error
    },
  })
  requestHarness.controller.initialize({ orderId: 'route-order-001' })
  await flush()
  requestHarness.controller.requestSubmit()
  await flush()
  assert.equal(requestHarness.events.includes('request-error:safe request failed'), true)
  assert.equal(requestHarness.controller.getState().submitting, false)
})

test('uses one controlled return path for visible and physical back', async () => {
  const harness = createHarness()
  harness.controller.initialize({ orderId: 'route-order-001' })
  await flush()
  const enabledConfig = harness.interceptConfig
  assert.equal(enabledConfig.enabled, true)
  enabledConfig.onIntercept()
  enabledConfig.onIntercept()
  assert.equal(harness.backCount, 1)
  assert.equal(harness.events.includes('back-disable'), true)
  assert.equal(harness.events.includes('hide'), true)
})

test('locks help navigation and ignores late detail results after dispose', async () => {
  const pending = deferred()
  const harness = createHarness({ loadDeferralDetail: () => pending.promise })
  harness.controller.initialize({ orderId: 'route-order-001' })
  assert.equal(harness.controller.requestHelp(), true)
  assert.equal(harness.controller.requestHelp(), false)
  assert.equal(harness.helpCount, 1)
  assert.equal(harness.controller.getState().navigationLocked, true)

  const disposeHarness = createHarness({ loadDeferralDetail: () => pending.promise })
  disposeHarness.controller.initialize({ orderId: 'route-order-002' })
  disposeHarness.controller.dispose()
  pending.resolve(detailResult())
  await flush()
  assert.equal(disposeHarness.controller.getState().phase, ORDER_DEFERRAL_PHASE.INACTIVE)
  assert.equal(disposeHarness.events.includes('back-disable'), true)
  assert.equal(disposeHarness.events.includes('hide'), true)
})
