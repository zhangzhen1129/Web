import assert from 'node:assert/strict'
import test from 'node:test'
import { createOrderDetailController } from './orderDetailController.js'

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function displayModel(overrides = {}) {
  return Object.freeze({
    orderNo: 'order-001',
    billId: 'bill-001',
    productId: 'product-001',
    productName: 'Product',
    companyName: 'Company',
    orderStatus: 80,
    rootState: 'repaying',
    loanAmount: '2000',
    serviceFee: '100',
    receivedAmount: '1900',
    interest: '80',
    penaltyFee: 0,
    repaymentAmount: '2100',
    actualRepaymentAmount: 0,
    remainingRepaymentAmount: 0,
    bankName: 'AFIRME',
    bankAccount: '1212 1212 1212 1212',
    applicationDate: '2025-11-20',
    disbursementDate: '2025-11-21',
    dueDate: '2025-12-20',
    repaymentDate: '',
    arrivalDate: '2025-11-21',
    lastUpdatedAt: '2025-11-21',
    extensionFlag: 1,
    ...overrides,
  })
}

function createHarness(overrides = {}) {
  const calls = []
  let abortCount = 0
  const services = {
    async loadOrderDetail({ orderId, signal }) {
      calls.push(`detail:${orderId}:${Boolean(signal)}`)
      return { type: 'success', rootState: 'repaying', displayModel: displayModel() }
    },
    async loadExtensionHistory({ orderId, signal }) {
      calls.push(`history:${orderId}:${Boolean(signal)}`)
      return { type: 'success', historyCount: 2 }
    },
    async requestRepayment({ billId, signal }) {
      calls.push(`repay:${billId}:${Boolean(signal)}`)
      return { type: 'success', repaymentUrl: 'https://pay.example.test/session' }
    },
    ...overrides.services,
  }
  const controller = createOrderDetailController({
    services,
    showNativeLoading: () => calls.push('loading:show'),
    hideNativeLoading: () => calls.push('loading:hide'),
    openPaymentPage: overrides.openPaymentPage ?? ((url) => {
      calls.push(`open:${url}`)
      return true
    }),
    createAbortController: () => ({
      signal: { aborted: false },
      abort() { this.signal.aborted = true; abortCount += 1 },
    }),
    onBusinessFailure: (message) => calls.push(`business:${message}`),
    onRequestFailure: (message) => calls.push(`request:${message}`),
    onNavigateBack: () => calls.push('navigate:back'),
    onNavigateDeferDetail: ({ orderId }) => calls.push(`navigate:defer:${orderId}`),
    onNavigateDeferHistory: (query) => calls.push(`navigate:history:${query.orderId}:${query.productId ?? ''}:${query.orderStatus}`),
    onNavigateBankDetail: ({ orderId }) => calls.push(`navigate:bank:${orderId}`),
    onNavigateHome: () => calls.push('navigate:home'),
    onNavigateHelpCenter: () => calls.push('navigate:help'),
    ...overrides,
  })
  return { calls, controller, abortCount: () => abortCount }
}

test('rejects invalid entry parameters without requests or navigation', () => {
  for (const query of [undefined, {}, { orderId: '' }, { orderId: 1 }, { orderId: 'order-1', extra: 'x' }]) {
    const harness = createHarness()
    assert.equal(harness.controller.initialize(query), false)
    assert.deepEqual(harness.calls, [])
  }
})

test('loads detail once, hides loading, then loads history without replacing the main state', async () => {
  const harness = createHarness()
  assert.equal(harness.controller.initialize({ orderId: 'route-order' }), true)
  await flush()
  const state = harness.controller.getState()
  assert.equal(state.rootState, 'repaying')
  assert.equal(state.displayModel.orderNo, 'order-001')
  assert.equal(state.historyCount, 2)
  assert.equal(state.historyVisible, true)
  assert.equal(harness.calls.includes('detail:route-order:true'), true)
  assert.equal(harness.calls.includes('history:route-order:true'), true)
  assert.equal(harness.calls.includes('loading:show'), true)
  assert.equal(harness.calls.includes('loading:hide'), true)
})

test('maps API-001 business and request failures to controlled error with the declared notices', async () => {
  const business = createHarness({
    services: {
      async loadOrderDetail() { return { type: 'business_failure', message: 'Try again.' } },
      async loadExtensionHistory() { throw new Error('not called') },
      async requestRepayment() { throw new Error('not called') },
    },
  })
  business.controller.initialize({ orderId: 'route-order' })
  await flush()
  assert.equal(business.controller.getState().rootState, 'error')
  assert.equal(business.calls.includes('business:Try again.'), true)

  const request = createHarness({
    services: {
      async loadOrderDetail() { throw Object.assign(new Error('offline'), { displayMessage: 'Network unavailable.' }) },
      async loadExtensionHistory() { throw new Error('not called') },
      async requestRepayment() { throw new Error('not called') },
    },
  })
  request.controller.initialize({ orderId: 'route-order' })
  await flush()
  assert.equal(request.controller.getState().rootState, 'error')
  assert.equal(request.calls.includes('request:Network unavailable.'), true)
})

test('keeps history hidden on API-002 failure and never overwrites the main state', async () => {
  const harness = createHarness({
    services: {
      async loadOrderDetail() {
        return { type: 'success', rootState: 'repaying', displayModel: displayModel() }
      },
      async loadExtensionHistory() { return { type: 'business_failure', message: 'History unavailable.' } },
      async requestRepayment() { return { type: 'success', repaymentUrl: 'https://pay.example.test/session' } },
    },
  })
  harness.controller.initialize({ orderId: 'route-order' })
  await flush()
  assert.equal(harness.controller.getState().rootState, 'repaying')
  assert.equal(harness.controller.getState().historyVisible, false)
  assert.equal(harness.calls.includes('business:History unavailable.'), true)
})

test('queries extension history silently only for repayment-related order statuses', async () => {
  for (const orderStatus of [80, 90, 100, 101]) {
    const rootState = {
      80: 'repaying', 90: 'overdue', 100: 'completed', 101: 'completed',
    }[orderStatus]
    const harness = createHarness({
      services: {
        async loadOrderDetail() {
          return { type: 'success', rootState, displayModel: displayModel({ orderStatus, rootState }) }
        },
        async loadExtensionHistory({ orderId, signal }) {
          harness.calls.push(`history:${orderId}:${Boolean(signal)}`)
          return { type: 'success', historyCount: 0 }
        },
        async requestRepayment() { return { type: 'success', repaymentUrl: 'https://pay.example.test/session' } },
      },
    })
    harness.controller.initialize({ orderId: 'route-order' })
    await flush()
    assert.equal(harness.calls.filter((call) => call.startsWith('history:')).length, 1)
    assert.equal(harness.calls.filter((call) => call === 'loading:show').length, 1)
    assert.equal(harness.calls.filter((call) => call === 'loading:hide').length, 1)
    assert.equal(harness.calls.some((call) => call.startsWith('business:')), false)
    assert.equal(harness.calls.some((call) => call.startsWith('request:')), false)
  }
})

test('does not query extension history for order statuses outside 80, 90, 100, and 101', async () => {
  for (const orderStatus of [20, 21, 30, 40, 70, 110]) {
    const rootState = {
      20: 'reviewing', 21: 'reviewing', 30: 'disbursing', 40: 'rejected', 70: 'disbursing',
      110: 'transfer_failed',
    }[orderStatus]
    const harness = createHarness({
      services: {
        async loadOrderDetail() {
          return { type: 'success', rootState, displayModel: displayModel({ orderStatus, rootState }) }
        },
        async loadExtensionHistory() {
          harness.calls.push('history:unexpected')
          return { type: 'success', historyCount: 0 }
        },
        async requestRepayment() { return { type: 'success', repaymentUrl: 'https://pay.example.test/session' } },
      },
    })
    harness.controller.initialize({ orderId: 'route-order' })
    await flush()
    assert.equal(harness.calls.some((call) => call.startsWith('history:')), false)
    assert.equal(harness.calls.filter((call) => call === 'loading:show').length, 1)
    assert.equal(harness.calls.filter((call) => call === 'loading:hide').length, 1)
    assert.equal(harness.controller.getState().rootState, rootState)
    assert.equal(harness.controller.getState().historyVisible, false)
  }
})

test('reports extension history request failures once without touching native loading', async () => {
  const harness = createHarness({
    services: {
      async loadOrderDetail() {
        return { type: 'success', rootState: 'repaying', displayModel: displayModel() }
      },
      async loadExtensionHistory() {
        throw Object.assign(new Error('offline'), { displayMessage: 'History network unavailable.' })
      },
      async requestRepayment() { return { type: 'success', repaymentUrl: 'https://pay.example.test/session' } },
    },
  })
  harness.controller.initialize({ orderId: 'route-order' })
  await flush()
  assert.equal(harness.controller.getState().rootState, 'repaying')
  assert.equal(harness.controller.getState().historyVisible, false)
  assert.equal(harness.calls.includes('request:History network unavailable.'), true)
  assert.equal(harness.calls.filter((call) => call === 'loading:show').length, 1)
  assert.equal(harness.calls.filter((call) => call === 'loading:hide').length, 1)
})

test('opens repayment once, sends only the bill id, and restores the action after host acceptance', async () => {
  const harness = createHarness()
  harness.controller.initialize({ orderId: 'route-order' })
  await flush()
  const loadingShowsBeforePayment = harness.calls.filter((call) => call === 'loading:show').length
  const loadingHidesBeforePayment = harness.calls.filter((call) => call === 'loading:hide').length
  assert.equal(harness.controller.requestPayment(), true)
  assert.equal(harness.controller.requestPayment(), false)
  await flush()
  const paymentShowIndex = harness.calls.indexOf('loading:show', loadingShowsBeforePayment)
  const paymentHideIndex = harness.calls.indexOf('loading:hide', paymentShowIndex + 1)
  assert.equal(harness.calls.includes('repay:bill-001:true'), true)
  assert.equal(harness.calls.includes('open:https://pay.example.test/session'), true)
  assert.equal(harness.calls.filter((call) => call === 'loading:show').length, loadingShowsBeforePayment + 1)
  assert.equal(harness.calls.filter((call) => call === 'loading:hide').length, loadingHidesBeforePayment + 1)
  assert.equal(paymentShowIndex < harness.calls.indexOf('repay:bill-001:true'), true)
  assert.equal(paymentHideIndex < harness.calls.indexOf('open:https://pay.example.test/session'), true)
  assert.equal(harness.controller.getState().paymentSubmitting, false)
})

test('keeps a controlled failure when repayment is rejected or not accepted by the host', async () => {
  const business = createHarness({
    services: {
      async loadOrderDetail() { return { type: 'success', rootState: 'repaying', displayModel: displayModel() } },
      async loadExtensionHistory() { return { type: 'success', historyCount: 0 } },
      async requestRepayment() { return { type: 'business_failure', message: 'Payment unavailable.' } },
    },
  })
  business.controller.initialize({ orderId: 'route-order' })
  await flush()
  const businessShowIndex = business.calls.filter((call) => call === 'loading:show').length - 1
  business.controller.requestPayment()
  await flush()
  const businessPaymentShowIndex = business.calls.indexOf('loading:show', businessShowIndex + 1)
  const businessHideIndex = business.calls.indexOf('loading:hide', businessPaymentShowIndex + 1)
  const businessFailureIndex = business.calls.indexOf('business:Payment unavailable.')
  assert.equal(businessPaymentShowIndex > -1, true)
  assert.equal(businessHideIndex > businessPaymentShowIndex, true)
  assert.equal(businessHideIndex < businessFailureIndex, true)
  assert.equal(business.calls.includes('business:Payment unavailable.'), true)
  assert.equal(business.controller.getState().paymentSubmitting, false)

  const rejected = createHarness({
    openPaymentPage: () => false,
  })
  rejected.controller.initialize({ orderId: 'route-order' })
  await flush()
  rejected.controller.requestPayment()
  await flush()
  assert.equal(rejected.calls.some((call) => call.startsWith('request:')), false)
  assert.equal(rejected.controller.getState().paymentSubmitting, false)
  assert.equal(rejected.calls[rejected.calls.length - 1], 'loading:hide')
})

test('allows a second repayment attempt after the first one reaches its terminal state', async () => {
  const harness = createHarness()
  harness.controller.initialize({ orderId: 'route-order' })
  await flush()
  const showsBefore = harness.calls.filter((call) => call === 'loading:show').length
  const hidesBefore = harness.calls.filter((call) => call === 'loading:hide').length

  assert.equal(harness.controller.requestPayment(), true)
  await flush()
  assert.equal(harness.controller.getState().paymentSubmitting, false)

  assert.equal(harness.controller.requestPayment(), true)
  await flush()
  assert.equal(harness.controller.getState().paymentSubmitting, false)

  assert.equal(harness.calls.filter((call) => call === 'repay:bill-001:true').length, 2)
  assert.equal(harness.calls.filter((call) => call === 'loading:show').length, showsBefore + 2)
  assert.equal(harness.calls.filter((call) => call === 'loading:hide').length, hidesBefore + 2)
  assert.equal(harness.calls.filter((call) => call.startsWith('open:')).length, 2)
})

test('lets a new repayment attempt start after the host refuses the previous payment page', async () => {
  const harness = createHarness({ openPaymentPage: () => false })
  harness.controller.initialize({ orderId: 'route-order' })
  await flush()
  const showsBefore = harness.calls.filter((call) => call === 'loading:show').length
  const hidesBefore = harness.calls.filter((call) => call === 'loading:hide').length

  assert.equal(harness.controller.requestPayment(), true)
  await flush()
  assert.equal(harness.controller.getState().paymentSubmitting, false)

  assert.equal(harness.controller.requestPayment(), true)
  await flush()
  assert.equal(harness.controller.getState().paymentSubmitting, false)

  assert.equal(harness.calls.filter((call) => call === 'repay:bill-001:true').length, 2)
  assert.equal(harness.calls.filter((call) => call === 'loading:show').length, showsBefore + 2)
  assert.equal(harness.calls.filter((call) => call === 'loading:hide').length, hidesBefore + 2)
})

test('hides repayment loading before reporting a request failure', async () => {
  const harness = createHarness({
    services: {
      async loadOrderDetail() { return { type: 'success', rootState: 'repaying', displayModel: displayModel() } },
      async loadExtensionHistory() { return { type: 'success', historyCount: 0 } },
      async requestRepayment() {
        throw Object.assign(new Error('offline'), { displayMessage: 'Network unavailable.' })
      },
    },
  })
  harness.controller.initialize({ orderId: 'route-order' })
  await flush()
  const showIndex = harness.calls.filter((call) => call === 'loading:show').length - 1
  harness.controller.requestPayment()
  await flush()
  const paymentShowIndex = harness.calls.indexOf('loading:show', showIndex + 1)
  const hideIndex = harness.calls.indexOf('loading:hide', paymentShowIndex + 1)
  assert.equal(paymentShowIndex > -1, true)
  assert.equal(hideIndex > paymentShowIndex, true)
  assert.equal(hideIndex < harness.calls.indexOf('request:Network unavailable.'), true)
  assert.equal(harness.controller.getState().paymentSubmitting, false)
})

test('routes extension, history, bank account, reapply, help, and back with controlled parameters', async () => {
  const harness = createHarness()
  harness.controller.initialize({ orderId: 'route-order' })
  await flush()
  assert.equal(harness.controller.requestExtension(), true)
  assert.equal(harness.calls.includes('navigate:defer:order-001'), true)

  const history = createHarness()
  history.controller.initialize({ orderId: 'route-order' })
  await flush()
  assert.equal(history.controller.requestHistory(), true)
  assert.equal(history.calls.includes('navigate:history:order-001:product-001:80'), true)

  const bank = createHarness({
    services: {
      async loadOrderDetail() {
        return {
          type: 'success',
          rootState: 'transfer_failed',
          displayModel: displayModel({ orderStatus: 110, rootState: 'transfer_failed', extensionFlag: 0 }),
        }
      },
      async loadExtensionHistory() { return { type: 'success', historyCount: 0 } },
      async requestRepayment() { return { type: 'success', repaymentUrl: 'https://pay.example.test/session' } },
    },
  })
  bank.controller.initialize({ orderId: 'route-order' })
  await flush()
  assert.equal(bank.controller.requestBankDetail(), true)
  assert.equal(bank.calls.includes('navigate:bank:order-001'), true)

  const completed = createHarness({
    services: {
      async loadOrderDetail() {
        return {
          type: 'success',
          rootState: 'completed',
          displayModel: displayModel({ orderStatus: 100, rootState: 'completed' }),
        }
      },
      async loadExtensionHistory() { return { type: 'success', historyCount: 0 } },
      async requestRepayment() { return { type: 'success', repaymentUrl: 'https://pay.example.test/session' } },
    },
  })
  completed.controller.initialize({ orderId: 'route-order' })
  await flush()
  assert.equal(completed.controller.requestReapply(), true)
  assert.equal(completed.calls.includes('navigate:home'), true)

  const help = createHarness()
  help.controller.initialize({ orderId: 'route-order' })
  assert.equal(help.controller.requestHelp(), true)
  assert.equal(help.calls.includes('navigate:help'), true)

  const back = createHarness()
  back.controller.initialize({ orderId: 'route-order' })
  await flush()
  assert.equal(back.controller.requestBack(), true)
  assert.equal(back.calls.includes('navigate:back'), true)
})

test('ignores late API-001 and API-002 results after leaving the page', async () => {
  let resolveDetail
  let resolveHistory
  const harness = createHarness({
    services: {
      async loadOrderDetail() {
        return new Promise((resolve) => { resolveDetail = resolve })
      },
      async loadExtensionHistory() {
        return new Promise((resolve) => { resolveHistory = resolve })
      },
      async requestRepayment() { return { type: 'success', repaymentUrl: 'https://pay.example.test/session' } },
    },
  })
  harness.controller.initialize({ orderId: 'route-order' })
  resolveDetail({ type: 'success', rootState: 'repaying', displayModel: displayModel() })
  await flush()
  harness.controller.requestBack()
  resolveHistory({ type: 'success', historyCount: 2 })
  await flush()
  assert.equal(harness.controller.getState().rootState, 'inactive')
  assert.equal(harness.controller.getState().historyCount, null)
})

test('dispose aborts active requests and releases native loading', async () => {
  const harness = createHarness({
    services: {
      async loadOrderDetail() { return new Promise(() => {}) },
      async loadExtensionHistory() { return { type: 'success', historyCount: 0 } },
      async requestRepayment() { return { type: 'success', repaymentUrl: 'https://pay.example.test/session' } },
    },
  })
  harness.controller.initialize({ orderId: 'route-order' })
  harness.controller.dispose()
  assert.equal(harness.abortCount(), 1)
  assert.equal(harness.calls.includes('loading:hide'), true)
})

test('leaving during repayment hides native loading once and ignores the late result', async () => {
  let resolvePayment
  const harness = createHarness({
    services: {
      async loadOrderDetail() { return { type: 'success', rootState: 'repaying', displayModel: displayModel() } },
      async loadExtensionHistory() { return { type: 'success', historyCount: 0 } },
      async requestRepayment() {
        return new Promise((resolve) => { resolvePayment = resolve })
      },
    },
  })
  harness.controller.initialize({ orderId: 'route-order' })
  await flush()
  const showIndex = harness.calls.filter((call) => call === 'loading:show').length - 1
  harness.controller.requestPayment()
  const paymentShowIndex = harness.calls.indexOf('loading:show', showIndex + 1)
  harness.controller.requestBack()
  resolvePayment({ type: 'success', repaymentUrl: 'https://pay.example.test/session' })
  await flush()
  const hidesAfterPaymentShow = harness.calls
    .slice(paymentShowIndex + 1)
    .filter((call) => call === 'loading:hide')
  assert.equal(hidesAfterPaymentShow.length, 1)
  assert.equal(harness.calls.some((call) => call.startsWith('open:')), false)
  assert.equal(harness.controller.getState().rootState, 'inactive')
})

test('bank detail navigation sends only the order number', async () => {
  const queries = []
  const harness = createHarness({
    services: {
      async loadOrderDetail() {
        return {
          type: 'success',
          rootState: 'transfer_failed',
          displayModel: displayModel({ orderStatus: 110, rootState: 'transfer_failed', extensionFlag: 0 }),
        }
      },
      async loadExtensionHistory() { return { type: 'success', historyCount: 0 } },
      async requestRepayment() { return { type: 'success', repaymentUrl: 'https://pay.example.test/session' } },
    },
    onNavigateBankDetail: (query) => queries.push(query),
  })
  harness.controller.initialize({ orderId: 'route-order' })
  await flush()
  assert.equal(harness.controller.requestBankDetail(), true)
  assert.deepEqual(queries, [{ orderId: 'order-001' }])
})
