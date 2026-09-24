import assert from 'node:assert/strict'
import test from 'node:test'
import { createLoanSuccessController } from '../loanSuccess/loanSuccessController.js'
import {
  createMultiPushResultServices,
  multiPushResultProtocolPaths,
} from './services/multiPushResultServices.js'

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

function envelope(returnCode, extra = {}) {
  return {
    cyiUgNvO2EPltj: { atY3WWbXIN: returnCode },
    pl9xRlV: '',
    ...extra,
  }
}

function createHarness(options = {}) {
  const calls = []
  const productCycles = options.productCycles ?? [[
    { id: 'p1', productName: 'One', minAmount: '1500', icon: 'https://cdn.example.com/1.png' },
    { id: 'p2', productName: 'Two', minAmount: '2500', icon: 'https://cdn.example.com/2.png' },
  ]]
  let productIndex = 0
  const client = {
    async request(config) {
      calls.push(`${config.protocolId}:${config.path}`)
      if (config.protocolId === 'API-001') {
        const products = productCycles[Math.min(productIndex, productCycles.length - 1)]
        productIndex += 1
        return { data: envelope(2000, { boxeqivkXywlXvshygxTmwx: products }) }
      }
      if (config.protocolId === 'API-002') {
        return { data: envelope(2000, { ik803hS46CSFXi8: ['o1', 'o2'] }) }
      }
      if (config.protocolId === 'API-003') {
        return { data: envelope(2000, { aewM: ['o1', 'o2'] }) }
      }
      if (config.protocolId === 'API-004') {
        return {
          data: envelope(2000, {
            qrAbsjzu7WLU: {
              baIJ: options.orders ?? [{
                productIconImageUrl: 'https://cdn.example.com/icon.png',
                orderNo: 'order-1',
                productName: 'One',
                approvalAmount: '1500',
                orderStatusStr: 'Evaluando',
              }],
            },
          }),
        }
      }
      if (config.protocolId === 'API-005') {
        return { data: envelope(2000, { aewM: options.reviewEnabled === true }) }
      }
      if (config.protocolId === 'API-006') {
        return { data: envelope(2000, { data: {} }) }
      }
      throw new Error(`Unexpected protocol ${config.protocolId}`)
    },
  }
  const services = createMultiPushResultServices({
    client,
    getGlobalState: () => ({ afId: 'af', gaId: 'ga', fbId: 'fb', appName: 'DineroPro', appVersion: '1.0', packageName: 'com.example', token: 'token' }),
  })
  const controller = createLoanSuccessController({
    services,
    triggerUpload: async ({ onStatus }) => {
      calls.push('upload')
      onStatus?.('collecting')
      onStatus?.('uploading')
      return { status: 'success' }
    },
    uploadFailureMessage: 'Carga fallida',
    showNativeLoading: () => calls.push('loading:show'),
    hideNativeLoading: () => calls.push('loading:hide'),
    setPhysicalBackIntercept: () => 'back-id',
    openGooglePlay: () => calls.push('google-play'),
    copyText: async () => true,
    loadRecommendedComments: async () => ['First comment', 'Last comment'],
    createAbortController: () => ({ signal: { aborted: false }, abort() {} }),
    random: () => 0,
    onSuccessNotice: () => calls.push('success-notice'),
    onNavigateOrderList: () => calls.push('navigate:order-list'),
    onNavigateOrderDetail: ({ orderId }) => calls.push(`navigate:order-detail:${orderId}`),
    onNavigateBack: () => calls.push('navigate:back'),
  })
  return { calls, controller }
}

test('rejects an entry without exactly one valid systemTime query', () => {
  for (const query of [undefined, {}, { systemTime: '-1' }, { systemTime: '1.5' }, { systemTime: '1', single: 'true' }]) {
    const harness = createHarness()
    assert.equal(harness.controller.initialize(query), false)
    assert.deepEqual(harness.calls, [])
  }
})

test('loads products from the multi push protocol and defaults to every product selected', async () => {
  const harness = createHarness()
  assert.equal(harness.controller.initialize({ systemTime: '123' }), true)
  await flush()
  const state = harness.controller.getState()
  assert.equal(state.rootState, 'recommendation')
  assert.equal(state.selectedCount, 2)
  assert.equal(state.selectedAmount, '4,000')
  assert.equal(harness.calls.includes(`API-001:${multiPushResultProtocolPaths.PRODUCT_PATH}`), true)
})

test('submits through upload, pre-application, application, and a fresh product cycle', async () => {
  const harness = createHarness({
    productCycles: [
      [{ id: 'p1', productName: 'One', minAmount: '1500', icon: 'https://cdn.example.com/1.png' }],
      [{ id: 'p2', productName: 'Two', minAmount: '2500', icon: 'https://cdn.example.com/2.png' }],
    ],
  })
  harness.controller.initialize({ systemTime: '123' })
  await flush()
  assert.equal(harness.controller.submitRecommendation(), true)
  await waitFor(() => harness.controller.getState().rootState === 'recommendation'
    && harness.controller.getState().products[0]?.id === 'p2')

  const uploadIndex = harness.calls.indexOf('upload')
  const preIndex = harness.calls.indexOf(`API-002:${multiPushResultProtocolPaths.PRE_APPLICATION_PATH}`)
  const applyIndex = harness.calls.indexOf(`API-003:${multiPushResultProtocolPaths.APPLICATION_PATH}`)
  assert.equal(uploadIndex >= 0 && uploadIndex < preIndex && preIndex < applyIndex, true, JSON.stringify(harness.calls))
  assert.equal(harness.calls.includes('success-notice'), true)
  assert.equal(harness.calls.filter((call) => call === `API-001:${multiPushResultProtocolPaths.PRODUCT_PATH}`).length, 2)
  assert.equal(harness.controller.getState().loadingBarStatus, null)
})

test('keeps the recommendation visible while submitting and blocks a duplicate submission', async () => {
  let releaseUpload = null
  const services = createMultiPushResultServices({
    client: { async request() { return { data: envelope(2000, { boxeqivkXywlXvshygxTmwx: [{ id: 'p1', productName: 'One', minAmount: '1500', icon: 'https://cdn.example.com/1.png' }] }) } } },
    getGlobalState: () => ({ token: 'token' }),
  })
  const controller = createLoanSuccessController({
    services,
    triggerUpload: () => new Promise((resolve) => { releaseUpload = () => resolve({ status: 'success' }) }),
    uploadFailureMessage: 'Carga fallida',
    setPhysicalBackIntercept: () => 'back-id',
    createAbortController: () => ({ signal: { aborted: false }, abort() {} }),
  })
  controller.initialize({ systemTime: '123' })
  await flush()
  assert.equal(controller.submitRecommendation(), true)
  const submitting = controller.getState()
  assert.equal(submitting.rootState, 'submitting')
  assert.equal(submitting.submitting, true)
  assert.equal(submitting.products.length, 1)
  assert.equal(submitting.selectedCount, 1)
  assert.equal(controller.submitRecommendation(), false)
  releaseUpload()
  await waitFor(() => controller.getState().submitting === false)
})

test('falls back to the order list and opens the review gate from the main button', async () => {
  const harness = createHarness({ productCycles: [[]], reviewEnabled: true })
  harness.controller.initialize({ systemTime: '123' })
  await waitFor(() => harness.controller.getState().rootState === 'order_list')
  assert.equal(harness.calls.includes(`API-004:${multiPushResultProtocolPaths.ORDER_LIST_PATH}`), true)
  assert.equal(harness.controller.openReviewFromMain(), true)
  await waitFor(() => harness.controller.getState().overlay === 'review_prompt')
  assert.equal(harness.controller.getState().reviewOrigin, 'order_list_main')
  assert.equal(await harness.controller.submitReview(), true)
  assert.equal(harness.calls.includes('google-play'), true)
  assert.equal(harness.calls.includes('navigate:order-list'), true)
})

test('opens the recommendation intercept and returns only after an explicit cancel', async () => {
  const harness = createHarness()
  harness.controller.initialize({ systemTime: '123' })
  await flush()
  assert.equal(harness.controller.requestBack(), true)
  assert.equal(harness.controller.getState().overlay, 'back_intercept')
  assert.equal(harness.calls.includes('navigate:back'), false)
  assert.equal(harness.controller.closeBackIntercept(), true)
  assert.equal(harness.controller.getState().overlay, null)
  assert.equal(harness.calls.includes('navigate:back'), false)
  assert.equal(harness.controller.requestBack(), true)
  assert.equal(harness.controller.getState().overlay, 'back_intercept')
  assert.equal(harness.controller.cancelBackIntercept(), true)
  assert.equal(harness.calls.includes('navigate:back'), true)
})

test('navigates to the order detail with the order number and ignores an empty order number', async () => {
  const harness = createHarness({
    productCycles: [[]],
    orders: [
      { productIconImageUrl: 'https://cdn.example.com/icon.png', orderNo: 'order-9', productName: 'One', approvalAmount: '1500', orderStatusStr: 'Evaluando' },
      { productIconImageUrl: 'https://cdn.example.com/icon.png', orderNo: '', productName: 'Two', approvalAmount: '2500', orderStatusStr: 'Aprobado' },
    ],
  })
  harness.controller.initialize({ systemTime: '123' })
  await waitFor(() => harness.controller.getState().rootState === 'order_list')
  const orders = harness.controller.getState().orders
  assert.equal(orders[0].orderId, 'order-9')
  assert.equal(orders[1].orderId, '')
})
