import assert from 'node:assert/strict'
import test from 'node:test'
import { createMultiPushApplicationService } from './multiPushApplicationService.js'

const successEnvelope = (field, values) => ({
  data: {
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    [field]: values,
  },
})

function createStore() {
  return {
    afId: 'af-id', gaId: 'ga-id', fbId: 'fb-id', appName: 'DineroPro',
    appVersion: '1.0.0', packageName: 'com.dinero.pro', token: 'token-value',
  }
}

test('pre-application uses the documented relative path and string product identifiers', async () => {
  const requests = []
  const service = createMultiPushApplicationService({
    store: createStore(),
    client: { request: async (request) => { requests.push(request); return successEnvelope('ik803hS46CSFXi8', ['order-1']) } },
  })

  const result = await service.preApply({ productIds: ['product-1'] })

  assert.deepEqual(result, { status: 'success', orderIds: ['order-1'] })
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].path, '/nYL/R0GNU/PNUPHsX1K/S0HdSYO7')
  assert.deepEqual(requests[0].data.npwxCwB9qMB, ['product-1'])
  assert.equal(requests[0].path.includes('://'), false)
})

test('pre-application rejects business failures and invalid order identifier arrays', async () => {
  const service = createMultiPushApplicationService({
    store: createStore(),
    client: { request: async () => ({ data: { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, ik803hS46CSFXi8: [] } }) },
  })
  assert.deepEqual(await service.preApply({ productIds: ['product-1'] }), { status: 'failed', code: 'PRE_APPLICATION_ORDER_IDS_INVALID' })
  assert.deepEqual(await service.preApply({ productIds: [] }), { status: 'failed', code: 'PRE_APPLICATION_INPUT_INVALID' })
})

test('application uses pre-application order identifiers and requires a successful response array', async () => {
  const requests = []
  const service = createMultiPushApplicationService({
    store: createStore(),
    client: { request: async (request) => { requests.push(request); return successEnvelope('aewM', ['order-1']) } },
  })

  assert.deepEqual(await service.apply({ orderIds: ['order-1'] }), { status: 'success' })
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].path, '/iyA/GAvnJ/EnJpw2MBz/syHuQ')
  assert.deepEqual(requests[0].data.iiFpTXF0KDV, ['order-1'])
})

test('application maps request and business failures without exposing server payloads', async () => {
  const failedResponse = createMultiPushApplicationService({
    store: createStore(),
    client: { request: async () => ({ data: { cyiUgNvO2EPltj: { atY3WWbXIN: 5000 }, aewM: ['order-1'] } }) },
  })
  const failedRequest = createMultiPushApplicationService({
    store: createStore(),
    client: { request: async () => { throw new Error('network') } },
  })

  assert.deepEqual(await failedResponse.apply({ orderIds: ['order-1'] }), { status: 'failed', code: 'APPLICATION_BUSINESS_FAILED' })
  assert.deepEqual(await failedRequest.apply({ orderIds: ['order-1'] }), { status: 'failed', code: 'APPLICATION_REQUEST_FAILED' })
})
