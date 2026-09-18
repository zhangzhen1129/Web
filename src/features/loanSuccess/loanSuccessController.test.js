import assert from 'node:assert/strict'
import test from 'node:test'
import { createLoanSuccessController } from './loanSuccessController.js'

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return
    await flush()
  }
}

function createHarness(overrides = {}) {
  const calls = []
  let backConfig = null
  let abortCount = 0
  const products = [
    { id: 'p1', productName: 'One', minAmount: '1500', icon: 'https://cdn.example.com/1.png' },
    { id: 'p2', productName: 'Two', minAmount: '2500', icon: 'https://cdn.example.com/2.png' },
  ]
  const services = {
    async loadRecommendedProducts() {
      calls.push('api:products')
      return { type: 'success', products }
    },
    async loadOrders({ startApplyTime }) {
      calls.push(`api:orders:${startApplyTime}`)
      return { type: 'success', orders: [{ orderId: 'order-1', productName: 'One', approvalAmount: '1500', orderStatusText: 'Evaluando' }] }
    },
    async preApply({ productIds }) {
      calls.push(`api:pre:${productIds.join(',')}`)
      return { type: 'success', orderIds: ['o1'] }
    },
    async apply({ orderIds }) {
      calls.push(`api:apply:${orderIds.join(',')}`)
      return { type: 'success', orderIds }
    },
    async getReviewPromptEnabled() {
      calls.push('api:review-prompt')
      return { type: 'success', enabled: true }
    },
    async saveReview({ grade, content }) {
      calls.push(`api:save:${grade}:${content}`)
      return { type: 'success' }
    },
    ...overrides.services,
  }
  const controller = createLoanSuccessController({
    services,
    triggerUpload: overrides.triggerUpload ?? (async ({ operationId, onStatus }) => {
      calls.push(`upload:${operationId}`)
      onStatus?.('collecting')
      onStatus?.('uploading')
      return { status: 'success' }
    }),
    uploadFailureMessage: 'Carga fallida',
    showNativeLoading: () => calls.push('loading:show'),
    hideNativeLoading: () => calls.push('loading:hide'),
    setPhysicalBackIntercept(config) {
      calls.push(config.enabled ? 'back:on' : 'back:off')
      backConfig = config
      return config.enabled ? 'enable-id' : 'disable-id'
    },
    openGooglePlay: () => calls.push('google-play'),
    copyText: overrides.copyText ?? (async () => true),
    createAbortController: () => ({
      signal: { aborted: false },
      abort() { this.signal.aborted = true; abortCount += 1 },
    }),
    createOperation: (id) => `operation-${id}`,
    random: () => 0,
    onBusinessFailure: (message) => calls.push(`business:${message}`),
    onUploadFailure: (message) => calls.push(`upload-failure:${message}`),
    onSuccessNotice: () => calls.push('success-notice'),
    onCopySuccess: () => calls.push('copy-success'),
    onCopyFailure: () => calls.push('copy-failure'),
    onNavigateOrderList: () => calls.push('navigate:order-list'),
    onNavigateOrderDetail: ({ orderId }) => calls.push(`navigate:order-detail:${orderId}`),
    onNavigateBack: () => calls.push('navigate:back'),
    ...overrides,
  })
  return { calls, controller, getBackConfig: () => backConfig, abortCount: () => abortCount }
}

test('rejects invalid entry parameters without requests or navigation', () => {
  for (const query of [undefined, {}, { systemTime: '-1' }, { systemTime: '1.5' }, { systemTime: '1', extra: 'x' }]) {
    const harness = createHarness()
    assert.equal(harness.controller.initialize(query), false)
    assert.deepEqual(harness.calls, [])
  }
})

test('loads products, defaults to all selected, and protects the final selection', async () => {
  const harness = createHarness()
  assert.equal(harness.controller.initialize({ systemTime: '123' }), true)
  await flush()
  let state = harness.controller.getState()
  assert.equal(state.rootState, 'recommendation')
  assert.equal(state.selectedCount, 2)
  assert.equal(state.selectedAmount, '4,000')
  assert.equal(harness.controller.toggleProduct('p2'), true)
  state = harness.controller.getState()
  assert.equal(state.selectedCount, 1)
  assert.equal(state.selectedAmount, '1,500')
  assert.equal(harness.controller.toggleProduct('p1'), false)
  assert.equal(harness.controller.getState().selectedCount, 1)
})

test('falls back to order list or empty result when product data is empty', async () => {
  const orderHarness = createHarness({
    services: {
      async loadRecommendedProducts() { return { type: 'empty' } },
      async loadOrders() { return { type: 'success', orders: [{ orderId: 'o1', productName: 'One', approvalAmount: '1', orderStatusText: 'Evaluando' }] } },
      async preApply() { return { type: 'success', orderIds: [] } },
      async apply() { return { type: 'success' } },
      async getReviewPromptEnabled() { return { type: 'success', enabled: false } },
      async saveReview() { return { type: 'success' } },
    },
  })
  orderHarness.controller.initialize({ systemTime: '123' })
  await flush()
  assert.equal(orderHarness.controller.getState().rootState, 'order_list')

  const emptyHarness = createHarness({
    services: {
      async loadRecommendedProducts() { return { type: 'empty' } },
      async loadOrders() { return { type: 'empty' } },
      async preApply() { return { type: 'success', orderIds: [] } },
      async apply() { return { type: 'success' } },
      async getReviewPromptEnabled() { return { type: 'success', enabled: false } },
      async saveReview() { return { type: 'success' } },
    },
  })
  emptyHarness.controller.initialize({ systemTime: '123' })
  await flush()
  assert.equal(emptyHarness.controller.getState().rootState, 'empty_result')
})

test('runs upload, pre-application, application, success notice, and a new product cycle', async () => {
  const harness = createHarness()
  harness.controller.initialize({ systemTime: '123' })
  await flush()
  assert.equal(harness.controller.submitRecommendation(), true)
  await waitFor(() => harness.calls.filter((call) => call === 'api:products').length === 2
    && harness.controller.getState().rootState === 'recommendation')
  const uploadIndex = harness.calls.findIndex((call) => call.startsWith('upload:'))
  const preIndex = harness.calls.findIndex((call) => call.startsWith('api:pre:'))
  const applyIndex = harness.calls.findIndex((call) => call.startsWith('api:apply:'))
  assert.equal(uploadIndex >= 0 && uploadIndex < preIndex && preIndex < applyIndex, true, JSON.stringify(harness.calls))
  assert.equal(harness.calls.includes('success-notice'), true)
  assert.equal(harness.calls.filter((call) => call === 'api:products').length, 2)
  assert.equal(harness.controller.getState().rootState, 'recommendation')
})

test('keeps selection and skips application when upload fails', async () => {
  const harness = createHarness({
    triggerUpload: async () => ({ status: 'upload_failed' }),
  })
  harness.controller.initialize({ systemTime: '123' })
  await flush()
  harness.controller.submitRecommendation()
  await flush()
  assert.equal(harness.calls.includes('upload-failure:Carga fallida'), true)
  assert.equal(harness.calls.some((call) => call.startsWith('api:pre:')), false)
  assert.equal(harness.controller.getState().rootState, 'recommendation')
  assert.equal(harness.controller.getState().selectedCount, 2)
})

test('recommendation back opens intercept; cancel returns to the previous history item', async () => {
  const harness = createHarness()
  harness.controller.initialize({ systemTime: '123' })
  await flush()
  assert.equal(harness.controller.requestBack(), true)
  assert.equal(harness.controller.getState().overlay, 'back_intercept')
  assert.equal(harness.controller.closeBackIntercept(), true)
  assert.equal(harness.controller.getState().overlay, null)
  assert.equal(harness.controller.requestBack(), true)
  assert.equal(harness.controller.cancelBackIntercept(), true)
  assert.equal(harness.calls.includes('navigate:back'), true)
})

test('review gate opens the review and saves a high rating before Google Play', async () => {
  const harness = createHarness({
    services: {
      async loadRecommendedProducts() { return { type: 'empty' } },
      async loadOrders() { return { type: 'success', orders: [{ orderId: 'o1', productName: 'One', approvalAmount: '1500', orderStatusText: 'Evaluando' }] } },
      async preApply() { return { type: 'success', orderIds: [] } },
      async apply() { return { type: 'success' } },
      async getReviewPromptEnabled() { return { type: 'success', enabled: true } },
      async saveReview() { return { type: 'success' } },
    },
  })
  harness.controller.initialize({ systemTime: '123' })
  await flush()
  harness.controller.openReviewFromMain()
  await flush()
  assert.equal(harness.controller.getState().overlay, 'review_prompt')
  assert.equal(harness.controller.getState().reviewRating, 5)
  assert.equal(await harness.controller.submitReview(), true)
  await flush()
  assert.equal(harness.calls.includes('copy-success'), true)
  assert.equal(harness.calls.includes('google-play'), true)
  assert.equal(harness.calls.includes('navigate:order-list'), true)
})

test('review prompt false follows the origin navigation without opening the dialog', async () => {
  const harness = createHarness({
    services: {
      async loadRecommendedProducts() { return { type: 'empty' } },
      async loadOrders() { return { type: 'empty' } },
      async preApply() { return { type: 'success', orderIds: [] } },
      async apply() { return { type: 'success' } },
      async getReviewPromptEnabled() { return { type: 'success', enabled: false } },
      async saveReview() { return { type: 'success' } },
    },
  })
  harness.controller.initialize({ systemTime: '123' })
  await flush()
  harness.controller.requestBack()
  await flush()
  assert.equal(harness.calls.includes('navigate:back'), true)
  assert.equal(harness.controller.getState().overlay, null)
})

test('dispose aborts active work and releases loading and back registrations', async () => {
  const harness = createHarness({
    services: {
      async loadRecommendedProducts() { return new Promise(() => {}) },
      async loadOrders() { return { type: 'empty' } },
      async preApply() { return { type: 'success', orderIds: [] } },
      async apply() { return { type: 'success' } },
      async getReviewPromptEnabled() { return { type: 'success', enabled: false } },
      async saveReview() { return { type: 'success' } },
    },
  })
  harness.controller.initialize({ systemTime: '123' })
  harness.controller.dispose()
  assert.equal(harness.abortCount() >= 1, true)
  assert.equal(harness.calls.includes('back:off'), true)
  assert.equal(harness.calls.includes('loading:hide'), true)
})
