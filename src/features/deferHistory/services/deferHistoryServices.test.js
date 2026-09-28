import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDeferHistoryPayload,
  createDeferHistoryServices,
  mapDeferHistoryResponse,
} from './deferHistoryServices.js'

const globalState = Object.freeze({
  afId: 'af-value',
  gaId: 'ga-value',
  fbId: 'fb-value',
  appName: 'DineroPro',
  appVersion: '1.2.3',
  packageName: 'com.example.app',
  token: 'token-value',
})

function successResponse(records = []) {
  return {
    vaOsuw7s: 20,
    bgCAmh0f: { dlWr: 1 },
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    oi: 'diagnostic-only',
    qrAbsjzu7WLU: { baIJ: records },
  }
}

function record(overrides = {}) {
  return {
    extensionStages: 9,
    approvalDate: '2031-04-05',
    amount: 1234,
    extendedTerm: 11,
    updatedDueDate: '2031-04-16',
    ...overrides,
  }
}

test('builds the API-001 payload from route order id and controlled global state', () => {
  assert.deepEqual(buildDeferHistoryPayload(globalState, { orderId: 'route-order-001' }), {
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

test('maps success records without requiring page fields or extensionStages', () => {
  const response = successResponse([
    {
      approvalDate: '2031-04-05',
      amount: 1234.5,
      extendedTerm: 11,
      updatedDueDate: '2031-04-16',
      ignoredField: 'not displayed',
    },
  ])
  delete response.vaOsuw7s
  delete response.bgCAmh0f

  assert.deepEqual(mapDeferHistoryResponse(response), {
    type: 'success',
    records: [{
      approvalDate: '2031-04-05',
      amount: 1234.5,
      extendedTerm: 11,
      updatedDueDate: '2031-04-16',
    }],
  })
})

test('treats an empty record array as success and preserves record order', () => {
  assert.deepEqual(mapDeferHistoryResponse(successResponse()), {
    type: 'success',
    records: [],
  })

  const first = record({ approvalDate: 'first-date' })
  const second = record({ approvalDate: 'second-date' })
  const result = mapDeferHistoryResponse(successResponse([first, second]))
  assert.equal(result.type, 'success')
  assert.deepEqual(result.records.map((item) => item.approvalDate), ['first-date', 'second-date'])
})

test('rejects structural response errors without creating a business failure', () => {
  const cases = [
    null,
    [],
    { cyiUgNvO2EPltj: { atY3WWbXIN: '2000' }, qrAbsjzu7WLU: { baIJ: [] } },
    { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, qrAbsjzu7WLU: {} },
    { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, qrAbsjzu7WLU: { baIJ: null } },
    { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, qrAbsjzu7WLU: { baIJ: [null] } },
  ]

  cases.forEach((input) => {
    assert.deepEqual(mapDeferHistoryResponse(input), { type: 'invalid_response' })
  })
})

test('rejects every invalid consumed record field type', () => {
  const cases = [
    { approvalDate: null },
    { amount: '1234' },
    { amount: Number.POSITIVE_INFINITY },
    { amount: Number.NaN },
    { extendedTerm: 11.5 },
    { extendedTerm: '7' },
    { updatedDueDate: null },
  ]

  cases.forEach((overrides) => {
    assert.deepEqual(mapDeferHistoryResponse(successResponse([record(overrides)])), {
      type: 'invalid_response',
    })
  })
})

test('preserves only a valid trimmed business failure message', () => {
  assert.deepEqual(mapDeferHistoryResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
    pl9xRlV: '  Try again later.  ',
    qrAbsjzu7WLU: { baIJ: 'not-used' },
  }), {
    type: 'business_failure',
    message: 'Try again later.',
  })

  assert.deepEqual(mapDeferHistoryResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
    pl9xRlV: 42,
  }), {
    type: 'business_failure',
  })

  assert.deepEqual(mapDeferHistoryResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: 'must not be used',
    qrAbsjzu7WLU: { baIJ: 'invalid' },
  }), {
    type: 'invalid_response',
  })
})

test('uses the single client with the exact path, protocol id, payload, and signal', async () => {
  const requests = []
  const signal = AbortSignal.abort()
  const client = {
    async request(config) {
      requests.push(config)
      return { data: successResponse([record()]) }
    },
  }
  const services = createDeferHistoryServices({
    client,
    getGlobalState: () => globalState,
  })

  const result = await services.loadDeferHistory({
    orderId: 'route-order-001',
    signal,
  })

  assert.equal(result.type, 'success')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].path, '/o7y/ufJWDay6D/x0IbE9O')
  assert.equal(requests[0].protocolId, 'API-001')
  assert.equal(requests[0].signal, signal)
  assert.equal('timeoutMs' in requests[0], false)
  assert.equal(requests[0].data.ca, 'route-order-001')
})

