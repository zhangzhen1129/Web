import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildExtensionHistoryPayload,
  buildOrderDetailPayload,
  buildRepaymentPayload,
  createOrderDetailServices,
  mapExtensionHistoryResponse,
  mapOrderDetailResponse,
  mapRepaymentResponse,
  orderDetailProtocolPaths,
} from './orderDetailServices.js'

const globalState = Object.freeze({
  afId: 'af',
  gaId: 'ga',
  fbId: 'fb',
  appName: 'DineroPro',
  appVersion: '1.0.0',
  packageName: 'com.example.app',
  token: 'token-value',
})

function orderDetailResponse(orderStatus = 80, overrides = {}) {
  return {
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    oi: '',
    lcjueL3yhbe: 'order-001',
    vh9d4uTh7IYo1PT: 'bill-001',
    rkXATRSDYCXcHqp4n: { yu1k7j6TQ: 'product-001' },
    chaP665SbRawR1V: 'Product',
    gj6xPLZMNKbeNJRny1w: { re9nXllPXk1: 'Company' },
    kxCNx4mRAzCNC7B: orderStatus,
    trNtuIJKIOuEYFINHM: '2000',
    belQa34Y5Uf921w2gaf9: '100',
    nthhYjhBYsstcBbAO2s0: { xj2JJAdBXJWI: '1900' },
    jwXcMpXgVgWvuX8V: { rncMaMb1: '80' },
    vgtkponklDyWnDeBeCtaVOT: { vstkrDEWtDkBkCz: 0 },
    ymcCXUcK5CcGWnXRT05G6VnO7W6V: '2100',
    aqckTmcETvEo8khwXxcO5ydxc: 0,
    stmxkBfxbKbK9i7M3VfBgQxJhRgQTixg: { byEMAZAZyxw1saEQF5WYG6F5: 0 },
    qyaiSi4sni8lyi3m: 'AFIRME',
    au0YIYU8dYY1ocxJbH: { ovuPNFyIYT: '1212 1212 1212 1212' },
    kwou5JkFthdG9: '2025-11-20',
    ft9v1JQIDD2zGgke: { xeIpvkUg: '2025-11-21' },
    msKyvVGCtRvBcCGyPKvLKlzKvoc2a: { bdis5H7rOsiorA7BmbbA7: '2025-12-20' },
    lndnUpdHUyFr9nizYAda2zY: '',
    nvbvSM9Ddv3i0HWlDZB: { azjcn4dRag6: '2025-11-21' },
    xu3O43NO3SxWWSAzex: { swFVVZp3OZ: '2025-11-21' },
    fd9J8Q45o69N31YX3: 1,
    ...overrides,
  }
}

test('builds the three documented request bodies without extra repayment fields', () => {
  const expectedCommon = {
    cvgH: 'af',
    rsbhpZ3X: { pwtL: 'ga' },
    bgU88QMO: { eybE: 'fb' },
    amHasFw: 'DineroPro',
    mmNUCmQdMioQ2O: { ux9jYLcC8H: '1.0.0' },
    qkNsXozI1oC5g3: { tf69g5Spk5: '2' },
    uxzfxbBMxhB: 'com.example.app',
    ulG: '',
    vqfH0gehfvNYrW: { rpryc7q8rm: '' },
    yjDnG: 'token-value',
  }

  assert.deepEqual(buildOrderDetailPayload(globalState, { orderId: 'order-001' }), {
    ...expectedCommon,
    sf9Qno9CRgP: { nqE1SzE: 'order-001' },
  })
  assert.deepEqual(buildExtensionHistoryPayload(globalState, { orderId: 'order-001' }), {
    ...expectedCommon,
    ca: 'order-001',
  })
  assert.deepEqual(buildRepaymentPayload({ billId: 'bill-001' }), {
    ca: 'bill-001',
  })
})

test('maps all confirmed order statuses and keeps 110 as transfer failed', () => {
  const cases = [
    [20, 'reviewing'],
    [21, 'reviewing'],
    [30, 'disbursing'],
    [70, 'disbursing'],
    [40, 'rejected'],
    [80, 'repaying'],
    [90, 'overdue'],
    [100, 'completed'],
    [101, 'completed'],
    [110, 'transfer_failed'],
  ]

  for (const [status, rootState] of cases) {
    const mapped = mapOrderDetailResponse(orderDetailResponse(status))
    assert.equal(mapped.type, 'success')
    assert.equal(mapped.rootState, rootState)
    assert.equal(mapped.displayModel.orderStatus, status)
  }
})

test('rejects unknown statuses and missing required fields for the selected state', () => {
  assert.deepEqual(mapOrderDetailResponse(orderDetailResponse(10)), { type: 'invalid_response' })
  assert.deepEqual(mapOrderDetailResponse(orderDetailResponse(80, {
    vh9d4uTh7IYo1PT: '',
  })), { type: 'invalid_response' })
  assert.deepEqual(mapOrderDetailResponse(orderDetailResponse(80, {
    vgtkponklDyWnDeBeCtaVOT: { vstkrDEWtDkBkCz: null },
  })), { type: 'invalid_response' })
  assert.deepEqual(mapOrderDetailResponse(orderDetailResponse(20, {
    trNtuIJKIOuEYFINHM: 2000,
  })), { type: 'invalid_response' })
})

test('classifies business failures, invalid envelopes, history, and repayment responses', () => {
  assert.deepEqual(mapOrderDetailResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
    pl9xRlV: 'Try again.',
  }), {
    type: 'business_failure',
    message: 'Try again.',
  })
  assert.deepEqual(mapOrderDetailResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: '2000' },
  }), { type: 'invalid_response' })

  assert.deepEqual(mapExtensionHistoryResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    tkB0vkuQ3u1: { zwQ: 2 },
  }), {
    type: 'success',
    historyCount: 2,
  })
  assert.equal(mapExtensionHistoryResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    tkB0vkuQ3u1: { zwQ: -1 },
  }).type, 'business_failure')

  assert.deepEqual(mapRepaymentResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    aewM: 'https://pay.example.test/session',
  }), {
    type: 'success',
    repaymentUrl: 'https://pay.example.test/session',
  })
  assert.equal(mapRepaymentResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    aewM: '',
  }).type, 'business_failure')
})

test('uses controlled paths, protocol identifiers, JSON bodies, and caller signals', async () => {
  const requests = []
  const signal = { aborted: false }
  const services = createOrderDetailServices({
    getGlobalState: () => globalState,
    client: {
      async request(request) {
        requests.push(request)
        if (request.protocolId === 'API-001') return { data: orderDetailResponse(80) }
        if (request.protocolId === 'API-002') {
          return { data: { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, tkB0vkuQ3u1: { zwQ: 1 } } }
        }
        return { data: { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, aewM: 'https://pay.example.test/session' } }
      },
    },
  })

  await services.loadOrderDetail({ orderId: 'order-001', signal })
  await services.loadExtensionHistory({ orderId: 'order-001', signal })
  await services.requestRepayment({ billId: 'bill-001', signal })

  assert.deepEqual(requests.map(({ method, path, protocolId, signal: requestSignal }) => ({
    method,
    path,
    protocolId,
    signal: requestSignal,
  })), [
    { method: 'POST', path: orderDetailProtocolPaths.ORDER_DETAIL_PATH, protocolId: 'API-001', signal },
    { method: 'POST', path: orderDetailProtocolPaths.EXTENSION_HISTORY_PATH, protocolId: 'API-002', signal },
    { method: 'POST', path: orderDetailProtocolPaths.REPAYMENT_LINK_PATH, protocolId: 'API-003', signal },
  ])
  assert.deepEqual(requests[2].data, { ca: 'bill-001' })
})
