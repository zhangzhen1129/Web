import assert from 'node:assert/strict'
import test from 'node:test'
import { createLoanSuccessController } from './loanSuccessController.js'
import { createLoanSuccessServices } from './services/loanSuccessServices.js'

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return
    await flush()
  }
  throw new Error('Timed out waiting for test condition')
}

function createHarness(overrides = {}) {
  const calls = []
  const { services: serviceOverrides, ...controllerOverrides } = overrides
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
    ...serviceOverrides,
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
    loadRecommendedComments: overrides.loadRecommendedComments ?? (async () => ['First comment', 'Last comment']),
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
    ...controllerOverrides,
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
  assert.equal(harness.controller.getState().loadingBarStatus, null)
})

test('refreshes recommendations and accepts consecutive submissions', async () => {
  let productLoadCount = 0
  let applyCount = 0
  const productCycles = [
    [{ id: 'p1', productName: 'One', minAmount: '1500', icon: 'https://cdn.example.com/1.png' }],
    [{ id: 'p2', productName: 'Two', minAmount: '2500', icon: 'https://cdn.example.com/2.png' }],
    [{ id: 'p3', productName: 'Three', minAmount: '3500', icon: 'https://cdn.example.com/3.png' }],
  ]
  const harness = createHarness({
    services: {
      async loadRecommendedProducts() {
        const products = productCycles[Math.min(productLoadCount, productCycles.length - 1)]
        productLoadCount += 1
        return { type: 'success', products }
      },
      async loadOrders() { return { type: 'empty' } },
      async preApply() { return { type: 'success', orderIds: ['o1'] } },
      async apply() {
        applyCount += 1
        return { type: 'success', orderIds: [`o${applyCount}`] }
      },
      async getReviewPromptEnabled() { return { type: 'success', enabled: false } },
      async saveReview() { return { type: 'success' } },
    },
  })

  harness.controller.initialize({ systemTime: '123' })
  await waitFor(() => productLoadCount === 1 && harness.controller.getState().rootState === 'recommendation')
  assert.equal(harness.controller.getState().products[0].id, 'p1')

  assert.equal(harness.controller.submitRecommendation(), true)
  await waitFor(() => productLoadCount === 2
    && harness.controller.getState().rootState === 'recommendation'
    && harness.controller.getState().submitting === false)
  assert.equal(harness.controller.getState().products[0].id, 'p2')
  assert.equal(harness.controller.getState().loadingBarStatus, null)

  assert.equal(harness.controller.submitRecommendation(), true)
  await waitFor(() => productLoadCount === 3
    && harness.controller.getState().rootState === 'recommendation'
    && harness.controller.getState().submitting === false)
  assert.equal(harness.controller.getState().products[0].id, 'p3')
  assert.equal(harness.controller.getState().loadingBarStatus, null)
  assert.equal(applyCount, 2)
})

test('ignores a pending load cycle after navigation invalidates the page instance', async () => {
  let productLoadCount = 0
  let resolvePendingProducts = null
  const harness = createHarness({
    services: {
      async loadRecommendedProducts() {
        productLoadCount += 1
        if (productLoadCount === 1) {
          return {
            type: 'success',
            products: [{ id: 'p1', productName: 'One', minAmount: '1500', icon: 'https://cdn.example.com/1.png' }],
          }
        }
        return new Promise((resolve) => { resolvePendingProducts = resolve })
      },
      async loadOrders() { return { type: 'empty' } },
      async preApply() { return { type: 'success', orderIds: ['o1'] } },
      async apply() { return { type: 'success', orderIds: ['o1'] } },
      async getReviewPromptEnabled() { return { type: 'success', enabled: false } },
      async saveReview() { return { type: 'success' } },
    },
  })

  harness.controller.initialize({ systemTime: '123' })
  await waitFor(() => productLoadCount === 1 && harness.controller.getState().rootState === 'recommendation')
  harness.controller.submitRecommendation()
  await waitFor(() => productLoadCount === 2 && harness.controller.getState().rootState === 'loading')

  assert.equal(harness.controller.requestBack(), true)
  assert.equal(harness.calls.includes('navigate:back'), true)
  assert.equal(harness.controller.getState().rootState, 'inactive')

  resolvePendingProducts({
    type: 'success',
    products: [{ id: 'p2', productName: 'Two', minAmount: '2500', icon: 'https://cdn.example.com/2.png' }],
  })
  await flush()
  assert.equal(harness.controller.getState().rootState, 'inactive')
  assert.equal(harness.controller.getState().products.length, 0)
  assert.equal(harness.controller.getState().loadingBarStatus, null)
})

test('ignores late upload status after a successful application', async () => {
  let emitLateStatus = () => {}
  const harness = createHarness({
    triggerUpload: async ({ onStatus }) => {
      onStatus?.('collecting')
      emitLateStatus = () => onStatus?.('uploading')
      return { status: 'success' }
    },
  })
  harness.controller.initialize({ systemTime: '123' })
  await flush()
  harness.controller.submitRecommendation()
  await waitFor(() => harness.calls.filter((call) => call === 'api:products').length === 2
    && harness.controller.getState().rootState === 'recommendation')
  emitLateStatus()
  await flush()
  assert.equal(harness.controller.getState().loadingBarStatus, null)
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

test('intercept countdown starts at ten and stops at zero without navigating', async () => {
  let tick = null
  const harness = createHarness({
    setTimer(callback) {
      tick = callback
      return 1
    },
    clearTimer() {},
  })
  harness.controller.initialize({ systemTime: '123' })
  await flush()
  harness.controller.requestBack()
  assert.equal(harness.controller.getState().interceptCountdown, 10)
  tick()
  assert.equal(harness.controller.getState().interceptCountdown, 9)
  for (let index = 0; index < 9; index += 1) tick()
  assert.equal(harness.controller.getState().interceptCountdown, 0)
  assert.equal(harness.controller.getState().overlay, 'back_intercept')
  assert.equal(harness.calls.includes('navigate:back'), false)
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
  await waitFor(() => harness.controller.getState().rootState === 'order_list')
  assert.equal(harness.controller.openReviewFromMain(), true)
  await waitFor(() => harness.controller.getState().overlay === 'review_prompt')
  assert.equal(harness.controller.getState().overlay, 'review_prompt')
  assert.equal(harness.controller.getState().reviewRating, 5)
  assert.equal(await harness.controller.submitReview(), true)
  await flush()
  assert.equal(harness.calls.includes('copy-success'), true)
  assert.equal(harness.calls.includes('google-play'), true)
  assert.equal(harness.calls.includes('navigate:order-list'), true)
})

test('saves a low rating without opening Google Play', async () => {
  const harness = createHarness({
    services: {
      async loadRecommendedProducts() { return { type: 'empty' } },
      async loadOrders() { return { type: 'empty' } },
    },
  })
  harness.controller.initialize({ systemTime: '123' })
  await waitFor(() => harness.controller.getState().rootState === 'empty_result')
  assert.equal(harness.controller.openReviewFromMain(), true)
  await waitFor(() => harness.controller.getState().overlay === 'review_prompt')
  assert.equal(harness.controller.setReviewRating(3), true)
  assert.equal(harness.controller.setReviewContent('User comment'), true)
  assert.equal(await harness.controller.submitReview(), true)
  await flush()
  assert.equal(harness.calls.includes('api:save:3:User comment'), true)
  assert.equal(harness.calls.includes('copy-success'), false)
  assert.equal(harness.calls.includes('google-play'), false)
  assert.equal(harness.calls.includes('navigate:order-list'), true)
})

test('closes the review and navigates when API-006 succeeds without a data field', async () => {
  const client = {
    async request(config) {
      if (config.protocolId === 'API-001' || config.protocolId === 'API-004') {
        return {
          data: {
            cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
            pl9xRlV: '',
            qrAbsjzu7WLU: { baIJ: [] },
          },
        }
      }
      if (config.protocolId === 'API-005') {
        return {
          data: {
            cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
            pl9xRlV: '',
            aewM: true,
          },
        }
      }
      if (config.protocolId === 'API-006') {
        return {
          data: {
            cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
            pl9xRlV: '',
          },
        }
      }
      throw new Error('Unexpected protocol request.')
    },
  }
  const services = createLoanSuccessServices({ client, getGlobalState: () => ({}) })
  const harness = createHarness({ services })
  harness.controller.initialize({ systemTime: '123' })
  await waitFor(() => harness.controller.getState().rootState === 'empty_result')
  assert.equal(harness.controller.openReviewFromMain(), true)
  await waitFor(() => harness.controller.getState().overlay === 'review_prompt')
  assert.equal(await harness.controller.submitReview(), true)
  assert.equal(harness.controller.getState().overlay, null)
  assert.equal(harness.calls.includes('navigate:order-list'), true)
})

test('refreshes the recommended comment by selecting from the local review resource', async () => {
  const randomValues = [0, 0.999999]
  const harness = createHarness({
    random: () => randomValues.shift() ?? 0,
    loadRecommendedComments: async () => ['First comment', 'Last comment'],
    services: {
      async loadRecommendedProducts() { return { type: 'empty' } },
      async loadOrders() { return { type: 'empty' } },
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
  const firstComment = harness.controller.getState().recommendedComment
  assert.equal(await harness.controller.refreshRecommendedComment(), true)
  const refreshedComment = harness.controller.getState().recommendedComment
  assert.notEqual(firstComment, '')
  assert.notEqual(refreshedComment, '')
  assert.notEqual(firstComment, refreshedComment)
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
