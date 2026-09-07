import assert from 'node:assert/strict'
import test from 'node:test'
import { createErrorPayload, createLoadingPayload, mapAppModeResponse, mapMultiPushResponse } from './homeDataMapper.js'
import { validateHomeViewPayload } from '../ui/homeUiContract.js'

function app(overrides = {}) {
  const data = { mode: 0, identity: 1, add: 1, basic: 1, remittance: 1, amount: '100', total: '200', used: '100', locked: 0, button: 'Apply now', ...overrides }
  return { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, ff1xUx0HoLLBT: data.mode, sdev3yZIeDeTpPeCLgpe: { zzNz2u2KdG2t: data.identity }, kquKbNemoPpev3iAWeU: { nxUg4J58bXY: data.add }, uxevWvdDX78A9ZfO2: data.basic, lsnKlOgSn34X6OyM6YoXneo3b: data.remittance, kuYUF6TeSdvF9D: { ehE3D2: data.amount }, zbp3php3hzn79bp: data.total, bjNBOTyE0SyECUkmYk: { dtbUD8bUfa: data.used }, mem6ek5g79TRxP: { uiRcT5: data.locked }, jex8fsxrsl: data.button, kxCNx4mRAzCNC7B: data.status, kteZ9gY3cBY: data.orderId, umwAvTdTxSKEvCuIsTlOqqY4W: { xdbJvIIutssyqJjEo: data.description }, ...((data.status === undefined) ? {} : {}), }
}
function multi(overrides = {}) { const data = { used: '10', total: '100', remaining: '90', locked: 0, repayment: 0, button: 'Aplicar ahora', products: [], ...overrides }; return { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, zk9qaIUtAK4JQ: data.used, wzKtJNDdLHKt: data.total, hb9P7T2PY2Y2W: data.remaining, mem6ek5g79TRxP: { uiRcT5: data.locked }, byrspwnswEcFr9sEYdCb: { xgxcGompBTCo: data.repayment }, jex8fsxrsl: data.button, boxeqivkXywlXvshygxTmwx: data.products } }

test('maps a UI-contract-valid cash local-limit model', () => { const mapped = mapAppModeResponse(app({ status: 10, orderId: 'o-1' }), { requestId: 'cycle-1', revision: 1 }); assert.equal(mapped.payload.viewData.productSelection.selectedAmountKey, '5000'); assert.equal(mapped.payload.tabs.length, 2); assert.deepEqual(validateHomeViewPayload(mapped.payload), []) })
test('maps unavailable mode to the local-limit branch without service credit values', () => { const mapped = mapAppModeResponse(app({ mode: 2, amount: undefined, total: undefined, used: undefined, locked: undefined }), { requestId: 'cycle-unavailable', revision: 2 }); assert.equal(mapped.snapshot.stage, 'application_unavailable'); assert.equal(mapped.snapshot.amountSource, 'local_limit'); assert.equal(mapped.payload.viewData.productSelection.selectedAmountKey, '5000'); assert.equal(mapped.payload.viewData.creditSummary, undefined) })
test('maps loading and error fallbacks with safe top-level tabs', () => {
  const loading = createLoadingPayload({ requestId: 'cycle-loading', revision: 3 })
  const error = createErrorPayload({ requestId: 'cycle-error', revision: 4 })
  assert.deepEqual(validateHomeViewPayload(loading), [])
  assert.deepEqual(validateHomeViewPayload(error), [])
  assert.deepEqual(loading.tabs.map((tab) => tab.key), ['home', 'account'])
  assert.deepEqual(error.tabs.map((tab) => tab.key), ['home', 'account'])
})
test('maps exact decimal product totals and a UI-contract-valid multi-push model', () => { const mapped = mapMultiPushResponse(multi({ products: [{ id: 'p1', productName: 'Product', minAmount: '1.20', isReloan: 1, icon: 'https://example.com/i.png' }, { id: 'p2', productName: 'Product 2', minAmount: '2.30', isReloan: 0, icon: 'https://example.com/j.png' }] }), { requestId: 'cycle-2', revision: 2, now: new Date(2026, 0, 1).getTime(), random: () => 0 }); assert.equal(mapped.payload.multiPushViewData.creditSummary.availableText, '3.5'); assert.equal(mapped.payload.multiPushViewData.products[0].dueDateText, '2026-01-07'); assert.deepEqual(validateHomeViewPayload(mapped.payload), []) })
test('keeps every recognized multi-push primary action enabled', () => { for (const button of ['Ir a reembolsar', 'Evaluando', 'Desembolsando', 'Aplicar ahora']) { const mapped = mapMultiPushResponse(multi({ button }), { requestId: `cycle-${button.length}`, revision: button.length }); assert.equal(mapped.payload.multiPushViewData.primaryAction.enabled, true) } })
test('rejects unsafe icons and invalid buttons', () => { assert.throws(() => mapMultiPushResponse(multi({ products: [{ id: 'p', productName: 'P', minAmount: '1', isReloan: 0, icon: 'http://example.com/i' }] })), { code: 'MULTI_PRODUCT_ICON_INVALID' }); assert.throws(() => mapMultiPushResponse(multi({ button: 'Unknown' })), { code: 'MULTI_BUTTON_INVALID' }) })
