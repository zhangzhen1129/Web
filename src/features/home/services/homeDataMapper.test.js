import assert from 'node:assert/strict'
import test from 'node:test'

import { validateHomeViewPayload } from '../validation.js'
import { mapAppModeResponse, mapMultiPushResponse } from './homeDataMapper.js'

function appData(overrides = {}) {
  return {
    maskModel: 0,
    identityAuth: 1,
    addInfoAuth: 1,
    basicInfoAuth: 1,
    remittanceAccountAuth: 1,
    amount: '500',
    repaymentTime: '',
    applyTime: '',
    button: 'Continue',
    statusDescription: 'Status',
    orderId: 'order-1',
    orderStatus: 10,
    totalCredit: '1000',
    usedCredit: '500',
    locked: 0,
    ...overrides,
  }
}

function appSuccess(data, { returnCode = 2000, message = '' } = {}) {
  return {
    vaOsuw7s: 0,
    bgCAmh0f: { dlWr: 0 },
    cyiUgNvO2EPltj: { atY3WWbXIN: returnCode },
    pl9xRlV: message,
    oi: '',
    ff1xUx0HoLLBT: data.maskModel,
    sdev3yZIeDeTpPeCLgpe: { zzNz2u2KdG2t: data.identityAuth },
    kquKbNemoPpev3iAWeU: { nxUg4J58bXY: data.addInfoAuth },
    uxevWvdDX78A9ZfO2: data.basicInfoAuth,
    lsnKlOgSn34X6OyM6YoXneo3b: data.remittanceAccountAuth,
    kuYUF6TeSdvF9D: { ehE3D2: data.amount },
    ujAfyjwfFrlsA2prl52J0: { wjU33fJgYQNfJ: data.repaymentTime },
    kwou5JkFthdG9: data.applyTime,
    jex8fsxrsl: data.button,
    umwAvTdTxSKEvCuIsTlOqqY4W: { xdbJvIIutssyqJjEo: data.statusDescription },
    kteZ9gY3cBY: data.orderId,
    kxCNx4mRAzCNC7B: data.orderStatus,
    zbp3php3hzn79bp: data.totalCredit,
    bjNBOTyE0SyECUkmYk: { dtbUD8bUfa: data.usedCredit },
    mem6ek5g79TRxP: { uiRcT5: data.locked },
    zgXKK4MNIx2ZI: 0,
    frhj0xbo6Aa6my2: '',
  }
}

function multiData(overrides = {}) {
  return {
    usedQuota: '10',
    sumQuota: '100',
    remaining: '90',
    locked: 0,
    repaymentNum: 0,
    button: 'Aplicar ahora',
    mergPushProductList: [],
    ...overrides,
  }
}

function multiSuccess(data, { returnCode = 2000, message = '' } = {}) {
  return {
    vaOsuw7s: 0,
    bgCAmh0f: { dlWr: 0 },
    cyiUgNvO2EPltj: { atY3WWbXIN: returnCode },
    pl9xRlV: message,
    oi: '',
    zk9qaIUtAK4JQ: data.usedQuota,
    wzKtJNDdLHKt: data.sumQuota,
    hb9P7T2PY2Y2W: data.remaining,
    mem6ek5g79TRxP: { uiRcT5: data.locked },
    byrspwnswEcFr9sEYdCb: { xgxcGompBTCo: data.repaymentNum },
    jex8fsxrsl: data.button,
    boxeqivkXywlXvshygxTmwx: data.mergPushProductList,
  }
}

test('maps cash auth precedence and rejected action effect without an initial overlay', () => {
  const result = mapAppModeResponse(appSuccess(appData({ basicInfoAuth: 0, addInfoAuth: 0, orderStatus: 40 })), { requestId: 'cash-auth' })

  assert.equal(result.kind, 'cash_loan')
  assert.equal(result.snapshot.stage, 'apply')
  assert.equal(result.payload.viewMode, 'apply')
  assert.equal(result.payload.overlayNotice, undefined)
  assert.deepEqual(validateHomeViewPayload(result.payload), [])

  const rejected = mapAppModeResponse(appSuccess(appData({ orderStatus: 40 })), { requestId: 'cash-rejected' })
  assert.equal(rejected.snapshot.stage, 'rejected')
  assert.equal(rejected.snapshot.primaryActionEffect, 'show_overlay_notice')
  assert.equal(rejected.snapshot.primaryActionMessageId, '20')
  assert.equal(rejected.payload.overlayNotice, undefined)
  assert.deepEqual(validateHomeViewPayload(rejected.payload), [])
})

test('maps modes 0 and 3 through the four documented auth priorities', () => {
  const fields = ['basicInfoAuth', 'addInfoAuth', 'identityAuth', 'remittanceAccountAuth']
  for (const [index, field] of fields.entries()) {
    const result = mapAppModeResponse(appSuccess(appData({ maskModel: index % 2 === 0 ? 0 : 3, [field]: 0 })), { requestId: `auth-${field}` })
    assert.equal(result.snapshot.stage, 'apply')
  }
})

test('maps application unavailable before auth and order evaluation', () => {
  const result = mapAppModeResponse(appSuccess(appData({
    maskModel: 2,
    identityAuth: 'invalid',
    addInfoAuth: 'invalid',
    basicInfoAuth: 'invalid',
    remittanceAccountAuth: 'invalid',
    orderId: null,
    orderStatus: null,
  })), { requestId: 'unavailable' })

  assert.equal(result.snapshot.stage, 'application_unavailable')
  assert.equal(result.payload.homeMode, 'cash_loan')
  assert.equal(result.payload.viewMode, 'apply')
  assert.equal(result.payload.viewData.creditSummary.availableText, '500')
  assert.deepEqual(validateHomeViewPayload(result.payload), [])
})

test('keeps the cash credit summary visible in every cash-loan stage', () => {
  const cases = [
    appData({ basicInfoAuth: 0 }),
    appData({ orderStatus: 20 }),
    appData({ orderStatus: 30 }),
    appData({ orderStatus: 80 }),
    appData({ orderStatus: 40 }),
  ]
  for (const [index, data] of cases.entries()) {
    const result = mapAppModeResponse(appSuccess(data), { requestId: `cash-summary-${index}` })
    assert.equal(result.payload.viewData.creditSummary.availableText, '500')
    assert.equal(result.payload.viewData.creditSummary.totalText, '1000')
    assert.equal(result.payload.viewData.creditSummary.usedText, '500')
  }
})

test('keeps order status 20 and 21 distinct while producing the reviewing view', () => {
  const first = mapAppModeResponse(appSuccess(appData({ orderStatus: 20 })), { requestId: 'review-20' })
  const second = mapAppModeResponse(appSuccess(appData({ orderStatus: 21 })), { requestId: 'review-21' })

  assert.equal(first.snapshot.stage, 'reviewing')
  assert.equal(second.snapshot.stage, 'reviewing')
  assert.notEqual(first.payload.requestId, second.payload.requestId)
})

test('maps every confirmed order status without inferring unknown order states', () => {
  const expectedStages = new Map([
    [10, 'apply'], [20, 'reviewing'], [21, 'reviewing'], [30, 'disbursing'], [40, 'rejected'],
    [70, 'disbursing'], [80, 'repaying'], [90, 'repaying'], [100, 'apply'], [101, 'apply'], [110, 'apply'],
  ])
  for (const [orderStatus, expectedStage] of expectedStages) {
    const result = mapAppModeResponse(appSuccess(appData({ orderStatus })), { requestId: `order-${orderStatus}` })
    assert.equal(result.snapshot.stage, expectedStage)
  }
  const due = mapAppModeResponse(appSuccess(appData({ orderStatus: 80 })), { requestId: 'due-order' })
  const overdue = mapAppModeResponse(appSuccess(appData({ orderStatus: 90 })), { requestId: 'overdue-order' })
  assert.equal(due.payload.viewData.statusNotice.stateKey, 'repayment_due')
  assert.equal(overdue.payload.viewData.statusNotice.stateKey, 'overdue')
  assert.throws(() => mapAppModeResponse(appSuccess(appData({ orderStatus: 999 })), { requestId: 'unknown-order' }), { code: 'CASH_ORDER_STATUS_INVALID' })
})

test('maps an empty multi-push apply result as content without an initial toast', () => {
  const result = mapMultiPushResponse(multiSuccess(multiData()), { requestId: 'multi-empty', now: Date.UTC(2026, 8, 2) })

  assert.equal(result.snapshot.primaryActionEffect, 'show_empty_products_toast')
  assert.equal(result.snapshot.primaryActionMessageId, '10')
  assert.equal(result.payload.toastNotice, undefined)
  assert.equal(result.payload.multiPushViewData.availableProductCount, 0)
  assert.equal(result.payload.multiPushViewData.minimumSelectionCount, 0)
  assert.deepEqual(validateHomeViewPayload(result.payload), [])
})

test('drops invalid product icons instead of rejecting an otherwise valid product', () => {
  const result = mapMultiPushResponse(multiSuccess(multiData({ mergPushProductList: [{
    id: 'product-1',
    productName: 'Product',
    productImgUrl: 'http://untrusted.example/image.png',
    interest: 'Interest',
    companyName: 'Company',
    amountRange: 'Range',
    maxAmount: '100',
    minAmount: '10',
    isReloan: 0,
    icon: 'javascript:bad',
  }] })), { requestId: 'multi-product', now: Date.UTC(2026, 8, 2) })

  assert.equal(result.payload.multiPushViewData.products.length, 1)
  assert.equal(Object.hasOwn(result.payload.multiPushViewData.products[0], 'iconUrl'), false)
  assert.equal(result.payload.multiPushViewData.selectedMinimumAmount, '10')
  assert.deepEqual(validateHomeViewPayload(result.payload), [])
})

test('maps confirmed multi-push button semantics independently from product and loan counts', () => {
  const cases = [
    ['Ir a reembolsar', 2, 'repay', 'navigate_repayment_list'],
    ['Evaluando', 0, 'processing', 'navigate_order_list'],
    ['Desembolsando', 0, 'processing', 'navigate_order_list'],
  ]
  for (const [button, repaymentNum, action, effect] of cases) {
    const result = mapMultiPushResponse(multiSuccess(multiData({ button, repaymentNum })), { requestId: `multi-${action}-${button}` })
    assert.equal(result.payload.multiPushViewData.primaryAction, action)
    assert.equal(result.snapshot.primaryActionEffect, effect)
  }
  assert.throws(() => mapMultiPushResponse(multiSuccess(multiData(), { returnCode: 1001, message: 'Failure' }), { requestId: 'multi-failure' }), { code: 'MULTI_BUSINESS_FAILURE' })
})

test('rejects an unknown mode and malformed multi-push product data', () => {
  assert.throws(() => mapAppModeResponse(appSuccess(appData({ maskModel: 99 })), { requestId: 'unknown-mode' }), { code: 'CASH_MODE_INVALID' })
  assert.throws(() => mapMultiPushResponse(multiSuccess(multiData({ mergPushProductList: [{}] })), { requestId: 'bad-product' }), { code: 'MULTI_PRODUCT_ID_INVALID' })
})
