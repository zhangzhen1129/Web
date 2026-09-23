import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildOrderListRequestBody,
  createOrderListService,
  mapOrderListResponse,
} from './orderListService.js'

function successResponse(orders, overrides = {}) {
  return {
    vaOsuw7s: 10,
    bgCAmh0f: { dlWr: 1 },
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    oi: '',
    qrAbsjzu7WLU: { baIJ: orders },
    ...overrides,
  }
}

function order(overrides = {}) {
  return {
    repaymentAmount: 1500,
    productIconImageUrl: 'https://example.com/icon.png',
    orderNo: 'ORDER-1',
    orderBillId: 'BILL-1',
    productId: 'PRODUCT-1',
    productName: 'Prestamo Rapido',
    approvalAmount: '2000',
    orderStatus: 80,
    applyTime: '2025-11-01',
    examinePassTime: '2025-11-02',
    loanTime: '2025-11-03',
    repaymentTime: '2025-11-20',
    orderStatusStr: 'Pagar ahora',
    ...overrides,
  }
}

test('builds only the protocol request fields and keeps GPS empty', () => {
  assert.deepEqual(buildOrderListRequestBody({
    afId: 'af',
    gaId: 'ga',
    fbId: 'fb',
    appName: 'DineroPro',
    appVersion: '1.2.3',
    packageName: 'com.example.app',
    token: 'token-value',
    gps: 'ignored',
    gpsAddress: 'ignored',
  }), {
    cvgH: 'af',
    rsbhpZ3X: { pwtL: 'ga' },
    bgU88QMO: { eybE: 'fb' },
    amHasFw: 'DineroPro',
    mmNUCmQdMioQ2O: { ux9jYLcC8H: '1.2.3' },
    qkNsXozI1oC5g3: { tf69g5Spk5: '2' },
    uxzfxbBMxhB: 'com.example.app',
    ulG: '',
    vqfH0gehfvNYrW: { rpryc7q8rm: '' },
    yjDnG: 'token-value',
  })
})

test('maps every confirmed status to its filter group, card mode and field source', () => {
  const rows = [
    [10, 'reviewing', 'application', '2000', '2025-11-01'],
    [20, 'reviewing', 'application', '2000', '2025-11-01'],
    [21, 'reviewing', 'application', '2000', '2025-11-01'],
    [30, 'reviewing', 'application', '2000', '2025-11-01'],
    [40, 'reviewing', 'application', '2000', '2025-11-01'],
    [70, 'reviewing', 'application', '2000', '2025-11-01'],
    [80, 'pendingPayment', 'repayment', '1500', '2025-11-20'],
    [90, 'pendingPayment', 'repayment', '1500', '2025-11-20'],
    [100, 'history', 'completed', '2000', '2025-11-01'],
    [101, 'history', 'completed', '2000', '2025-11-01'],
    [110, 'reviewing', 'application', '2000', '2025-11-01'],
  ]

  for (const [status, filterKey, cardMode, amountText, dateText] of rows) {
    const result = mapOrderListResponse(successResponse([order({ orderStatus: status })]))
    assert.equal(result.type, 'success', `status ${status}`)
    assert.deepEqual(
      [result.orders[0].filterKey, result.orders[0].cardMode, result.orders[0].amountText, result.orders[0].dateText],
      [filterKey, cardMode, amountText, dateText],
      `status ${status}`,
    )
  }
})

test('keeps the protocol array order and the original amount text', () => {
  const result = mapOrderListResponse(successResponse([
    order({ orderNo: 'ORDER-90', orderStatus: 90, repaymentAmount: 2300 }),
    order({ orderNo: 'ORDER-80', orderStatus: 80, repaymentAmount: 1500 }),
    order({ orderNo: 'ORDER-10', orderStatus: 10, approvalAmount: '1,500' }),
  ]))

  assert.equal(result.type, 'success')
  assert.deepEqual(result.orders.map((item) => [item.orderId, item.statusCode, item.amountText]), [
    ['ORDER-90', 90, '2300'],
    ['ORDER-80', 80, '1500'],
    ['ORDER-10', 10, '1,500'],
  ])
})

test('does not require fields that this page does not consume', () => {
  const item = order()
  delete item.orderBillId
  delete item.productId
  delete item.examinePassTime
  delete item.loanTime

  const result = mapOrderListResponse(successResponse([item], { vaOsuw7s: undefined, bgCAmh0f: undefined }))
  assert.equal(result.type, 'success')
  assert.equal(result.orders.length, 1)
})

test('rejects consumed-field violations as a whole batch', () => {
  const cases = [
    [successResponse([order({ orderStatus: 55 })]), 'ORDER_LIST_STATUS_INVALID'],
    [successResponse([order({ orderStatus: '80' })]), 'ORDER_LIST_STATUS_INVALID'],
    [successResponse([order({ orderStatus: null })]), 'ORDER_LIST_STATUS_INVALID'],
    [successResponse([order({ orderNo: '' })]), 'ORDER_LIST_ORDER_NO_INVALID'],
    [successResponse([order({ productIconImageUrl: 'http://example.com/icon.png' })]), 'ORDER_LIST_PRODUCT_ICON_INVALID'],
    [successResponse([order({ productIconImageUrl: 'https://user:pass@example.com/icon.png' })]), 'ORDER_LIST_PRODUCT_ICON_INVALID'],
    [successResponse([order({ productName: '<b>x</b>' })]), 'ORDER_LIST_PRODUCT_NAME_INVALID'],
    [successResponse([order({ productName: 12 })]), 'ORDER_LIST_PRODUCT_NAME_INVALID'],
    [successResponse([order({ orderStatusStr: '' })]), 'ORDER_LIST_ACTION_TEXT_INVALID'],
    [successResponse([order({ orderStatusStr: '<b>Pagar</b>' })]), 'ORDER_LIST_ACTION_TEXT_INVALID'],
    [successResponse([order({ repaymentAmount: '1500' })]), 'ORDER_LIST_REPAYMENT_AMOUNT_INVALID'],
    [successResponse([order({ repaymentTime: 20251120 })]), 'ORDER_LIST_DUE_DATE_INVALID'],
    [successResponse([order({ orderStatus: 10, approvalAmount: 2000 })]), 'ORDER_LIST_LOAN_AMOUNT_INVALID'],
    [successResponse([order({ orderStatus: 10, applyTime: null })]), 'ORDER_LIST_APPLY_TIME_INVALID'],
    [successResponse([order(), order({ orderStatus: 55 })]), 'ORDER_LIST_STATUS_INVALID'],
    [successResponse('not-an-array'), 'ORDER_LIST_LIST_INVALID'],
  ]

  for (const [value, code] of cases) {
    assert.deepEqual(mapOrderListResponse(value), { type: 'invalid_response', code })
  }
})

test('treats an explicit empty data envelope as an empty successful list', () => {
  assert.deepEqual(mapOrderListResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    qrAbsjzu7WLU: null,
  }), { type: 'success', orders: [] })

  assert.deepEqual(mapOrderListResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    qrAbsjzu7WLU: {},
  }), { type: 'success', orders: [] })
})

test('returns a safe business failure message and rejects an invalid return-code type', () => {
  assert.deepEqual(mapOrderListResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
    pl9xRlV: '  Try again  ',
  }), { type: 'business_failure', message: 'Try again' })

  assert.deepEqual(mapOrderListResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
    pl9xRlV: '<unsafe>',
  }), { type: 'business_failure', message: null })

  assert.deepEqual(
    mapOrderListResponse({ cyiUgNvO2EPltj: { atY3WWbXIN: '2000' } }),
    { type: 'invalid_response', code: 'ORDER_LIST_RETURN_CODE_INVALID' },
  )
})

test('service calls the shared client with the entity protocol path and protocol id', async () => {
  const calls = []
  const service = createOrderListService({
    getGlobalState: () => ({ token: 'token-value' }),
    client: {
      async request(request) {
        calls.push(request)
        return { data: successResponse([order()]) }
      },
    },
  })

  const result = await service.loadOrders({ signal: 'signal-value' })
  assert.equal(result.type, 'success')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].path, '/bev/Bgq3E/y7FiRay')
  assert.equal(calls[0].protocolId, 'order-list')
  assert.equal(calls[0].signal, 'signal-value')
  assert.equal(calls[0].data.yjDnG, 'token-value')
  assert.equal(calls[0].timeoutMs, undefined)
})
