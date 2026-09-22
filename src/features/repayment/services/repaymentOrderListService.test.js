import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRepaymentOrderRequestBody,
  createRepaymentOrderListService,
  mapRepaymentOrderListResponse,
} from './repaymentOrderListService.js'

function successResponse(orders, overrides = {}) {
  return {
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
    productName: 'Préstamo Rápido',
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
  assert.deepEqual(buildRepaymentOrderRequestBody({
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

test('maps both supported order states in protocol order', () => {
  const result = mapRepaymentOrderListResponse(successResponse([
    order({ orderNo: 'ORDER-80', orderStatus: 80, repaymentAmount: 1500 }),
    order({ orderNo: 'ORDER-90', orderStatus: 90, repaymentAmount: 2300, productName: 'Préstamo Express' }),
  ]))

  assert.equal(result.type, 'success')
  assert.deepEqual(result.orders.map((item) => [item.orderId, item.statusKey, item.amountText, item.dueDateText, item.actionText]), [
    ['ORDER-80', 'repaying', '1500', '2025-11-20', 'Pagar ahora'],
    ['ORDER-90', 'overdue', '2300', '2025-11-20', 'Pagar ahora'],
  ])
})

test('does not require fields that this page does not consume', () => {
  const item = order()
  delete item.orderBillId
  delete item.productId
  delete item.approvalAmount
  delete item.applyTime
  delete item.examinePassTime
  delete item.loanTime

  const result = mapRepaymentOrderListResponse(successResponse([item]))
  assert.equal(result.type, 'success')
  assert.equal(result.orders.length, 1)
})

test('rejects consumed-field violations as a whole batch', () => {
  const cases = [
    [successResponse([order({ orderStatus: 70 })]), 'REPAYMENT_ORDER_STATUS_INVALID'],
    [successResponse([order({ orderStatus: '80' })]), 'REPAYMENT_ORDER_STATUS_INVALID'],
    [successResponse([order({ orderNo: '' })]), 'REPAYMENT_ORDER_NO_INVALID'],
    [successResponse([order({ productIconImageUrl: 'http://example.com/icon.png' })]), 'REPAYMENT_PRODUCT_ICON_INVALID'],
    [successResponse([order({ productIconImageUrl: 'https://user:pass@example.com/icon.png' })]), 'REPAYMENT_PRODUCT_ICON_INVALID'],
    [successResponse([order({ repaymentAmount: '1500' })]), 'REPAYMENT_AMOUNT_INVALID'],
    [successResponse([order({ repaymentTime: 20251120 })]), 'REPAYMENT_DUE_DATE_INVALID'],
    [successResponse([order({ orderStatusStr: '<b>Pagar</b>' })]), 'REPAYMENT_ACTION_TEXT_INVALID'],
    [successResponse('not-an-array'), 'REPAYMENT_ORDER_LIST_INVALID'],
  ]

  for (const [value, code] of cases) {
    assert.deepEqual(mapRepaymentOrderListResponse(value), {
      type: 'invalid_response',
      code,
    })
  }
})

test('treats an explicit empty data envelope as an empty successful list', () => {
  assert.deepEqual(mapRepaymentOrderListResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    qrAbsjzu7WLU: null,
  }), { type: 'success', orders: [] })

  assert.deepEqual(mapRepaymentOrderListResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    qrAbsjzu7WLU: {},
  }), { type: 'success', orders: [] })
})

test('returns a safe business failure message and rejects an invalid return-code type', () => {
  assert.deepEqual(mapRepaymentOrderListResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
    pl9xRlV: '  Try again  ',
  }), { type: 'business_failure', message: 'Try again' })

  assert.deepEqual(mapRepaymentOrderListResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
    pl9xRlV: '<unsafe>',
  }), { type: 'business_failure', message: null })

  assert.deepEqual(
    mapRepaymentOrderListResponse({ cyiUgNvO2EPltj: { atY3WWbXIN: '2000' } }),
    { type: 'invalid_response', code: 'REPAYMENT_RETURN_CODE_INVALID' },
  )
})

test('service calls the shared client with the entity protocol path and protocol id', async () => {
  const calls = []
  const service = createRepaymentOrderListService({
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
  assert.equal(calls[0].path, '/vvf/lxako/rtSkmgvsbtqYojbxMopz')
  assert.equal(calls[0].protocolId, 'repayment-order-list')
  assert.equal(calls[0].signal, 'signal-value')
  assert.equal(calls[0].data.yjDnG, 'token-value')
})
