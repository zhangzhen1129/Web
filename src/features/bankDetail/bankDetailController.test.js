import assert from 'node:assert/strict'
import test from 'node:test'
import { createBankDetailController } from './bankDetailController.js'

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function account(id, markLoanCard, overrides = {}) {
  return Object.freeze({
    id,
    bank: 'Bank',
    accountLast4: '3984',
    markLoanCard,
    ...overrides,
  })
}

function createHarness(options = {}) {
  const calls = []
  let abortCount = 0
  let loadCall = 0
  let submissionCall = 0
  const services = {
    async loadBankAccounts({ signal }) {
      loadCall += 1
      calls.push(`load:${Boolean(signal)}:${loadCall}`)
      if (options.loadBankAccounts) return options.loadBankAccounts({ signal, call: loadCall })
      return { type: 'success', accounts: options.accounts ?? [account('first', 1), account('second', 0)] }
    },
    async updateLoanCard({ accountId, signal }) {
      submissionCall += 1
      calls.push(`update:${accountId}:${Boolean(signal)}:${submissionCall}`)
      if (options.updateLoanCard) return options.updateLoanCard({ accountId, signal, call: submissionCall })
      return { type: 'success' }
    },
    ...options.services,
  }
  const controller = createBankDetailController({
    services,
    showNativeLoading: () => calls.push('loading:show'),
    hideNativeLoading: () => calls.push('loading:hide'),
    setPhysicalBackIntercept: (config) => {
      calls.push(`back:${config.enabled ? 'enable' : 'disable'}`)
      if (options.backResult === false) return null
      if (config.enabled && options.backEnableResult === false) return null
      if (!config.enabled && options.backDisableResult === false) return null
      return config.enabled ? 'back-request' : 'back-close'
    },
    createAbortController: () => {
      const controller = new AbortController()
      return {
        signal: controller.signal,
        abort() {
          abortCount += 1
          controller.abort()
        },
      }
    },
    onBusinessFailure: (message) => calls.push(`business:${message}`),
    onSuccessNotice: () => calls.push('toast:success'),
    onNavigateBack: () => calls.push('navigate:back'),
    onNavigateAddPaymentMethod: options.onNavigateAddPaymentMethod ?? (() => {
      calls.push('navigate:add')
      return true
    }),
    ...options.controller,
  })
  return { calls, controller, abortCount: () => abortCount, serviceCallCounts: () => ({ loadCall, submissionCall }) }
}

test('rejects malformed entry query without loading or requests', () => {
  for (const query of [undefined, null, [], { extra: 'x' }, { orderId: '' }, { orderId: 1 }]) {
    const harness = createHarness()
    assert.equal(harness.controller.initialize(query), false)
    assert.deepEqual(harness.calls, [])
    assert.equal(harness.controller.getState().rootState, 'empty')
  }
})

test('loads accounts once, enables physical back once, and selects the first marked card only', async () => {
  const harness = createHarness({
    accounts: [account('first', 0), account('second', 1), account('third', 1)],
  })
  assert.equal(harness.controller.initialize({ orderId: 'order-1' }), true)
  assert.equal(harness.controller.initialize({ orderId: 'order-2' }), false)
  await flush()

  assert.deepEqual(harness.calls.slice(0, 3), ['back:enable', 'loading:show', 'load:true:1'])
  assert.equal(harness.controller.getState().rootState, 'list')
  assert.equal(harness.controller.getState().selectedAccountId, 'second')
  assert.equal(harness.calls.filter((call) => call === 'back:enable').length, 1)
  assert.equal(harness.calls.filter((call) => call === 'loading:show').length, 1)
  assert.equal(harness.calls.filter((call) => call === 'loading:hide').length, 1)
})

test('maps empty and business-failure results to empty state and prompts only business failure', async () => {
  const empty = createHarness({ accounts: [] })
  empty.controller.initialize({})
  await flush()
  assert.equal(empty.controller.getState().rootState, 'empty')
  assert.deepEqual(empty.calls.filter((call) => call.startsWith('business:')), [])

  const failure = createHarness({
    loadBankAccounts: async () => ({ type: 'business_failure', message: 'Try later.' }),
  })
  failure.controller.initialize({})
  await flush()
  assert.equal(failure.controller.getState().rootState, 'empty')
  assert.equal(failure.calls.includes('business:Try later.'), true)
  assert.equal(failure.calls.indexOf('loading:hide') < failure.calls.indexOf('business:Try later.'), true)
})

test('request failure maps to empty without a success or business toast', async () => {
  const harness = createHarness({
    loadBankAccounts: async () => { throw new Error('offline') },
  })
  harness.controller.initialize({})
  await flush()
  assert.equal(harness.controller.getState().rootState, 'empty')
  assert.equal(harness.calls.some((call) => call.startsWith('business:')), false)
  assert.equal(harness.calls.includes('toast:success'), false)
})

test('selection updates only the selected account id and never changes the response order', async () => {
  const harness = createHarness({
    accounts: [account('first', 1), account('second', 0), account('third', 0)],
  })
  harness.controller.initialize({})
  await flush()
  assert.equal(harness.controller.selectAccount('second'), true)
  assert.equal(harness.controller.selectAccount('second'), false)
  assert.equal(harness.controller.selectAccount('missing'), false)
  assert.deepEqual(harness.controller.getState().accounts.map((item) => item.id), ['first', 'second', 'third'])
  assert.equal(harness.controller.getState().selectedAccountId, 'second')
  assert.equal(harness.serviceCallCounts().loadCall, 1)
})

test('submits the selected account once and closes loading before success toast and back', async () => {
  const harness = createHarness()
  harness.controller.initialize({})
  await flush()
  harness.calls.length = 0

  assert.equal(harness.controller.submit(), true)
  assert.equal(harness.controller.submit(), false)
  await flush()

  assert.deepEqual(harness.calls, [
    'loading:show',
    'update:first:true:1',
    'loading:hide',
    'toast:success',
    'navigate:back',
  ])
  assert.equal(harness.controller.getState().submitting, false)
  assert.equal(harness.controller.getState().navigationLocked, true)
})

test('does not submit without a valid selected account', async () => {
  const harness = createHarness({ accounts: [account('first', 0), account('second', 0)] })
  harness.controller.initialize({})
  await flush()
  const before = harness.calls.length
  assert.equal(harness.controller.submit(), false)
  await flush()
  assert.equal(harness.calls.length, before)
})

test('business failure keeps list and selection and does not navigate or show success', async () => {
  const harness = createHarness({
    updateLoanCard: async () => ({ type: 'business_failure', message: 'Card update failed.' }),
  })
  harness.controller.initialize({})
  await flush()
  harness.controller.selectAccount('second')
  assert.equal(harness.controller.submit(), true)
  await flush()

  assert.equal(harness.controller.getState().rootState, 'list')
  assert.equal(harness.controller.getState().selectedAccountId, 'second')
  assert.equal(harness.controller.getState().submitting, false)
  assert.equal(harness.calls.includes('business:Card update failed.'), true)
  assert.equal(harness.calls.includes('toast:success'), false)
  assert.equal(harness.calls.includes('navigate:back'), false)
})

test('add payment method locks one navigation and unlocks after a controlled navigation failure', async () => {
  let attempts = 0
  const harness = createHarness({
    onNavigateAddPaymentMethod: () => {
      attempts += 1
      harness.calls.push(`navigate:add:${attempts}`)
      return attempts > 1
    },
  })
  harness.controller.initialize({})
  await flush()

  await harness.controller.navigateAddPaymentMethod()
  assert.equal(harness.controller.getState().navigationLocked, false)
  await harness.controller.navigateAddPaymentMethod()
  assert.equal(harness.controller.getState().navigationLocked, true)
  assert.equal(attempts, 2)
})

test('request failure during submission keeps the list and selection without success effects', async () => {
  const harness = createHarness({
    updateLoanCard: async () => { throw new Error('offline') },
  })
  harness.controller.initialize({})
  await flush()
  harness.controller.selectAccount('second')
  assert.equal(harness.controller.submit(), true)
  await flush()

  assert.equal(harness.controller.getState().rootState, 'list')
  assert.equal(harness.controller.getState().selectedAccountId, 'second')
  assert.equal(harness.controller.getState().submitting, false)
  assert.equal(harness.calls.includes('toast:success'), false)
  assert.equal(harness.calls.includes('navigate:back'), false)
})

test('leave during submission hides loading before disabling back and ignores the late result', async () => {
  let resolveRequest
  const pending = new Promise((resolve) => {
    resolveRequest = resolve
  })
  const harness = createHarness({ updateLoanCard: () => pending })
  harness.controller.initialize({})
  await flush()
  harness.calls.length = 0
  assert.equal(harness.controller.submit(), true)
  assert.equal(harness.controller.requestBack(), true)
  assert.equal(harness.controller.requestBack(), false)
  resolveRequest({ type: 'success' })
  await flush()

  assert.deepEqual(harness.calls, [
    'loading:show',
    'update:first:true:1',
    'loading:hide',
    'back:disable',
    'navigate:back',
  ])
  assert.equal(harness.calls.includes('toast:success'), false)
})

test('back disable failure does not prevent the single controlled return', async () => {
  const harness = createHarness({ backDisableResult: false })
  harness.controller.initialize({})
  await flush()
  harness.calls.length = 0

  assert.equal(harness.controller.requestBack(), true)
  assert.equal(harness.controller.requestBack(), false)
  assert.deepEqual(harness.calls, ['back:disable', 'navigate:back'])
})

test('visible and physical return share one locked handler and close the intercept once', async () => {
  const harness = createHarness()
  harness.controller.initialize({})
  await flush()
  harness.calls.length = 0

  assert.equal(harness.controller.requestBack(), true)
  assert.equal(harness.controller.requestBack(), false)
  assert.equal(harness.controller.requestBack(), false)
  assert.deepEqual(harness.calls, ['back:disable', 'navigate:back'])
})

test('dispose aborts a pending request and ignores its late result', async () => {
  let resolveRequest
  const pending = new Promise((resolve) => {
    resolveRequest = resolve
  })
  const harness = createHarness({
    updateLoanCard: () => pending,
  })
  harness.controller.initialize({})
  await flush()
  harness.calls.length = 0
  assert.equal(harness.controller.submit(), true)
  harness.controller.dispose()
  resolveRequest({ type: 'success' })
  await flush()

  assert.equal(harness.controller.getState().submitting, true)
  assert.equal(harness.abortCount() >= 1, true)
  assert.equal(harness.calls.includes('toast:success'), false)
  assert.equal(harness.calls.includes('navigate:back'), false)
  assert.equal(harness.calls.filter((call) => call === 'loading:hide').length, 1)
})
