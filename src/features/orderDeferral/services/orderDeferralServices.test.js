import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDeferralDetailPayload,
  buildDeferralSubmitPayload,
  createOrderDeferralServices,
  mapDeferralDetailResponse,
  mapDeferralSubmitResponse,
  orderDeferralProtocolPaths,
} from './orderDeferralServices.js'

const globalState = Object.freeze({
  afId: 'af-value',
  gaId: 'ga-value',
  fbId: 'fb-value',
  appName: 'DineroPro',
  appVersion: '1.2.3',
  packageName: 'com.example.app',
  token: 'token-value',
})

function detailFixture(overrides = {}) {
  return {
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: 'details message',
    oi: 'private exception',
    vh9d4uTh7IYo1PT: 'bill-001',
    qmYkXDFBY7NwJ: '2025-11-20',
    tvBFCUlFBJlcCJPFBJ: '2025-11-27',
    kmeYZle281Z1I2caLJpH: { yc3NXMOMxN1V: 7 },
    vgDMkYy6x5: 20000,
    rkRqBuDuPCCDRZCuob29: { wso6AenfCBn6: 1500 },
    ej21XmNiglNAN5zMdK: { upWLpOW3Wy: 300 },
    ...overrides,
  }
}

test('builds API-001 payload from the route order id and controlled global state', () => {
  const payload = buildDeferralDetailPayload(globalState, { orderId: 'route-order-001' })
  assert.deepEqual(payload, {
    cvgH: 'af-value',
    rsbhpZ3X: { pwtL: 'ga-value' },
    bgU88QMO: { eybE: 'fb-value' },
    amHasFw: 'DineroPro',
    mmNUCmQdMioQ2O: { ux9jYLcC8H: '1.2.3' },
    qkNsXozI1oC5g3: { tf69g5Spk5: '2' },
    uxzfxbBMxhB: 'com.example.app',
    ulG: '',
    vqfH0gehfvNYrW: { rpryc7q8rm: '' },
    yjDnG: 'token-value',
    ca: 'route-order-001',
  })
})

test('builds API-002 payload with only the bill id', () => {
  assert.deepEqual(buildDeferralSubmitPayload({ billId: 'bill-001' }), { ca: 'bill-001' })
})

test('maps API-001 success without requiring the unused interest field', () => {
  const result = mapDeferralDetailResponse(detailFixture())
  assert.deepEqual(result, {
    type: 'success',
    detail: {
      billId: 'bill-001',
      applicationDate: '2025-11-20',
      dueDate: '2025-11-27',
      extensionDays: 7,
      paymentAmount: 20000,
      serviceFee: 1500,
      overdueFee: 300,
    },
  })
})

test('keeps core detail values when optional fee values are missing', () => {
  const result = mapDeferralDetailResponse(detailFixture({
    rkRqBuDuPCCDRZCuob29: { wso6AenfCBn6: null },
    ej21XmNiglNAN5zMdK: { upWLpOW3Wy: null },
  }))
  assert.equal(result.type, 'success')
  assert.equal(result.detail.paymentAmount, 20000)
  assert.equal(result.detail.serviceFee, null)
  assert.equal(result.detail.overdueFee, null)
})
test('maps API-001 business failure and invalid responses distinctly', () => {
  assert.deepEqual(mapDeferralDetailResponse(detailFixture({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
    pl9xRlV: 'business message',
  })), { type: 'business_failure', message: 'business message' })
  assert.deepEqual(mapDeferralDetailResponse(detailFixture({
    cyiUgNvO2EPltj: { atY3WWbXIN: '2000' },
  })), { type: 'invalid_response' })
  const partial = mapDeferralDetailResponse(detailFixture({
    vgDMkYy6x5: '20000',
  }))
  assert.equal(partial.type, 'success')
  assert.equal(partial.detail.billId, 'bill-001')
  assert.equal(partial.detail.paymentAmount, '20000')
  assert.equal(partial.detail.extensionDays, 7)
})

test('maps API-002 success and rejects unsafe or missing URLs', () => {
  assert.deepEqual(mapDeferralSubmitResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    aewM: 'https://payments.example.test/order',
  }), {
    type: 'success',
    paymentUrl: 'https://payments.example.test/order',
  })
  assert.deepEqual(mapDeferralSubmitResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    aewM: '/relative/payment',
  }), { type: 'unsafe_url' })
  assert.deepEqual(mapDeferralSubmitResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: 'missing url',
    aewM: '',
  }), { type: 'business_failure', message: 'missing url' })
})

test('services use the single client and declarative protocol paths', async () => {
  const requests = []
  const client = {
    async request(config) {
      requests.push(config)
      return { data: detailFixture() }
    },
  }
  const services = createOrderDeferralServices({
    client,
    getGlobalState: () => globalState,
  })
  const signal = new AbortController().signal

  await services.loadDeferralDetail({ orderId: 'route-order-001', signal })
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].path, orderDeferralProtocolPaths.DEFERRAL_DETAIL_PATH)
  assert.equal(requests[0].protocolId, 'API-001')
  assert.equal(requests[0].signal, signal)

  client.request = async (config) => {
    requests.push(config)
    return {
      data: {
        cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
        pl9xRlV: '',
        aewM: 'https://payments.example.test/order',
      },
    }
  }
  await services.submitDeferral({ billId: 'bill-001', signal })
  assert.equal(requests[1].method, 'POST')
  assert.equal(requests[1].path, orderDeferralProtocolPaths.DEFERRAL_SUBMIT_PATH)
  assert.equal(requests[1].protocolId, 'API-002')
  assert.deepEqual(requests[1].data, { ca: 'bill-001' })
})
