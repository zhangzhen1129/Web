import assert from 'node:assert/strict'
import test from 'node:test'
import { createLoanConfirmController } from './loanConfirmController.js'

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function createHarness(overrides = {}) {
  const calls = []
  let backConfig = null
  let abortCount = 0
  const services = {
    async loadConfirmInfo({ orderId, signal }) {
      calls.push(`load:${orderId}:${Boolean(signal)}`)
      return {
        type: 'success',
        displayModel: {
          loanAmount: '1,000 - 5,000',
          receivedAmount: '900',
          repaymentAmount: '1,100',
          applicationDate: '2025-11-20',
          repaymentDate: '2025-12-20',
          bankName: 'AFIRME',
          bankAccount: '1212 1212 1212 1212',
        },
      }
    },
    async submitApplication({ orderId, signal }) {
      calls.push(`apply:${orderId}:${Boolean(signal)}`)
      return { type: 'success' }
    },
    ...overrides.services,
  }
  const controller = createLoanConfirmController({
    services,
    triggerUpload: overrides.triggerUpload ?? (async ({ operationId, onStatus }) => {
      calls.push(`upload:${operationId}`)
      onStatus?.('collecting')
      onStatus?.('uploading')
      return { operationId, status: 'success' }
    }),
    uploadFailureMessage: 'Carga fallida, inténtelo más tarde.',
    showNativeLoading: () => calls.push('loading:show'),
    hideNativeLoading: () => calls.push('loading:hide'),
    setPhysicalBackIntercept(config) {
      calls.push(config.enabled ? 'back:on' : 'back:off')
      backConfig = config
      return config.enabled ? 'enable-id' : 'disable-id'
    },
    createAbortController: () => ({
      signal: { aborted: false },
      abort() { this.signal.aborted = true; abortCount += 1 },
    }),
    createOperation: (id) => `operation-${id}`,
    onBusinessFailure: (message) => calls.push(`business:${message}`),
    onUploadFailure: (message) => calls.push(`upload-failure:${message}`),
    onNavigateLoanSuccess: ({ systemTime }) => calls.push(`navigate:success:${systemTime}`),
    onNavigateLoanFail: ({ orderId }) => calls.push(`navigate:fail:${orderId}`),
    onNavigateBack: () => calls.push('navigate:back'),
    ...overrides,
  })
  return { calls, controller, getBackConfig: () => backConfig, abortCount: () => abortCount }
}

test('rejects invalid or extra entry parameters without requests, writes, or navigation', () => {
  for (const query of [undefined, {}, { orderId: '' }, { orderId: 1 }, { orderId: 'order-1', extra: 'x' }]) {
    const harness = createHarness()
    assert.equal(harness.controller.initialize(query), false)
    assert.equal(harness.controller.getState().entryValid, false)
    assert.deepEqual(harness.calls, [])
  }
})

test('enables physical back once and loads the confirmation model once', async () => {
  const harness = createHarness()
  assert.equal(harness.controller.initialize({ orderId: 'order-1' }), true)
  assert.equal(harness.calls.includes('back:on'), true)
  assert.equal(harness.calls.includes('loading:show'), true)
  await flush()
  const state = harness.controller.getState()
  assert.equal(state.entryValid, true)
  assert.equal(state.initialLoading, false)
  assert.equal(state.displayModel.loanAmount, '1,000 - 5,000')
  assert.equal(harness.calls.includes('load:order-1:true'), true)
  assert.equal(harness.calls.includes('loading:hide'), true)
})

test('keeps empty fields and the button available after an API-001 business failure', async () => {
  const harness = createHarness({
    services: {
      async loadConfirmInfo() { return { type: 'business_failure', message: 'Try again.' } },
      async submitApplication() { return { type: 'success' } },
    },
  })
  harness.controller.initialize({ orderId: 'order-1' })
  await flush()
  assert.equal(harness.controller.getState().displayModel.loanAmount, '')
  assert.equal(harness.controller.getState().submitting, false)
  assert.equal(harness.calls.includes('business:Try again.'), true)
})

test('runs upload before application and replaces to loanSuccess with only systemTime', async () => {
  const loadingStates = []
  const harness = createHarness()
  const unsubscribe = harness.controller.subscribe((state) => {
    if (state.loadingBarStatus) loadingStates.push(state.loadingBarStatus)
  })
  harness.controller.initialize({ orderId: 'order-1' })
  await flush()
  assert.equal(harness.controller.confirmApplication(), true)
  await flush()

  const uploadIndex = harness.calls.findIndex((call) => call.startsWith('upload:'))
  const applyIndex = harness.calls.findIndex((call) => call.startsWith('apply:'))
  assert.equal(uploadIndex >= 0 && uploadIndex < applyIndex, true)
  assert.equal(loadingStates.includes('collecting'), true)
  assert.equal(loadingStates.includes('uploading'), true)
  assert.equal(loadingStates.includes('applying'), true)
  assert.equal(harness.calls.includes('back:off'), true)
  assert.equal(harness.calls.some((call) => /^navigate:success:\d+$/.test(call)), true)
  assert.equal(harness.controller.getState().loadingBarStatus, null)
  unsubscribe()
})

test('maps upload failures to one configured notice and loanFail without applying', async () => {
  for (const status of ['upload_failed', 'collect_failed', 'unavailable']) {
    const harness = createHarness({
      triggerUpload: async ({ operationId }) => ({ operationId, status }),
    })
    harness.controller.initialize({ orderId: 'order-1' })
    await flush()
    harness.controller.confirmApplication()
    await flush()
    assert.equal(harness.calls.includes('upload-failure:Carga fallida, inténtelo más tarde.'), true)
    assert.equal(harness.calls.some((call) => call.startsWith('apply:')), false)
    assert.equal(harness.calls.includes('navigate:fail:order-1'), true)
  }
})

test('keeps cancellation silent and does not navigate', async () => {
  const harness = createHarness({
    triggerUpload: async ({ operationId }) => ({ operationId, status: 'cancelled' }),
  })
  harness.controller.initialize({ orderId: 'order-1' })
  await flush()
  harness.controller.confirmApplication()
  await flush()
  assert.equal(harness.calls.some((call) => call.startsWith('upload-failure:')), false)
  assert.equal(harness.calls.some((call) => call.startsWith('navigate:')), false)
})

test('maps application business failure to its message and request failure to a silent loanFail', async () => {
  const business = createHarness({
    services: {
      async loadConfirmInfo() { return { type: 'success', displayModel: {} } },
      async submitApplication() { return { type: 'business_failure', message: 'Application rejected.' } },
    },
  })
  business.controller.initialize({ orderId: 'order-1' })
  await flush()
  business.controller.confirmApplication()
  await flush()
  assert.equal(business.calls.includes('business:Application rejected.'), true)
  assert.equal(business.calls.includes('navigate:fail:order-1'), true)

  const requestFailure = createHarness({
    services: {
      async loadConfirmInfo() { return { type: 'success', displayModel: {} } },
      async submitApplication() { throw new Error('network down') },
    },
  })
  requestFailure.controller.initialize({ orderId: 'order-1' })
  await flush()
  requestFailure.controller.confirmApplication()
  await flush()
  assert.equal(requestFailure.calls.includes('navigate:fail:order-1'), true)
  assert.equal(requestFailure.calls.some((call) => call.startsWith('business:')), false)
})

test('prevents duplicate uploads and applications', async () => {
  let uploadCount = 0
  let applyCount = 0
  const harness = createHarness({
    triggerUpload: async ({ operationId }) => {
      uploadCount += 1
      await new Promise((resolve) => setTimeout(resolve, 5))
      return { operationId, status: 'success' }
    },
    services: {
      async loadConfirmInfo() { return { type: 'success', displayModel: {} } },
      async submitApplication() {
        applyCount += 1
        return { type: 'success' }
      },
    },
  })
  harness.controller.initialize({ orderId: 'order-1' })
  await flush()
  assert.equal(harness.controller.confirmApplication(), true)
  assert.equal(harness.controller.confirmApplication(), false)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(uploadCount, 1)
  assert.equal(applyCount, 1)
})

test('visible and physical back invalidate current work before navigating back', async () => {
  const harness = createHarness({
    triggerUpload: async () => new Promise(() => {}),
  })
  harness.controller.initialize({ orderId: 'order-1' })
  await flush()
  harness.controller.confirmApplication()
  const back = harness.getBackConfig()
  back.onIntercept()
  assert.equal(harness.abortCount(), 1)
  assert.equal(harness.calls.includes('back:off'), true)
  assert.equal(harness.calls.includes('navigate:back'), true)
  assert.equal(harness.controller.getState().loadingBarStatus, null)
})

test('dispose aborts active requests and releases loading and back registration', async () => {
  const harness = createHarness({
    services: {
      async loadConfirmInfo() { return new Promise(() => {}) },
      async submitApplication() { return { type: 'success' } },
    },
  })
  harness.controller.initialize({ orderId: 'order-1' })
  harness.controller.dispose()
  assert.equal(harness.abortCount(), 1)
  assert.equal(harness.calls.includes('back:off'), true)
  assert.equal(harness.calls.includes('loading:hide'), true)
})
