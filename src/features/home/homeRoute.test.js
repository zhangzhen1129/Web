import test from 'node:test'
import assert from 'node:assert/strict'
import { createHomeRouteConsumer, resolveCashLoanRoute, resolveHomeRouteIntent } from './homeRoute.js'

const intent = (target, extra = {}) => ({ intentId: 'intent-1', sourceOperationId: 'operation-1', target, ...extra })
const permission = { operationId: 'operation-1', status: 'granted' }
const snapshot = (overrides = {}) => ({
  appMode: 0,
  basicInfo: 1,
  additionalInfo: 1,
  identityInfo: 1,
  remittanceAccount: 1,
  orderStatus: '',
  orderId: null,
  ...overrides,
})

test('resolves profile completion in fixed order', () => {
  const cases = [
    [{ basicInfo: 0, additionalInfo: 0, identityInfo: 0, remittanceAccount: 0 }, 'information'],
    [{ additionalInfo: 0, identityInfo: 0, remittanceAccount: 0 }, 'contacts'],
    [{ identityInfo: 0, remittanceAccount: 0 }, 'identity'],
    [{ remittanceAccount: 0, orderId: 'order-1' }, 'addBank'],
  ]
  for (const [overrides, routeName] of cases) {
    const resolved = resolveCashLoanRoute(snapshot(overrides), 1, intent('cash_loan_primary_action', { snapshotRevision: 1 }), permission)
    assert.equal(resolved.type, 'navigate')
    assert.equal(resolved.route.name, routeName)
  }
})

test('maps every defined order status and rejects missing ids', () => {
  for (const status of [20, 21, 30, 70, 80, 90]) {
    const resolved = resolveCashLoanRoute(snapshot({ orderStatus: status, orderId: 'order-1' }), 1, intent('cash_loan_primary_action', { snapshotRevision: 1 }), permission)
    assert.equal(resolved.route.name, 'orderDetail')
  }
  for (const status of [10, 100, 101, 110]) {
    const resolved = resolveCashLoanRoute(snapshot({ orderStatus: status, orderId: 'order-1' }), 1, intent('cash_loan_primary_action', { snapshotRevision: 1 }), permission)
    assert.equal(resolved.route.name, 'loanConfirm')
  }
  assert.equal(resolveCashLoanRoute(snapshot({ orderStatus: 40, orderId: 'order-1' }), 1, intent('cash_loan_primary_action', { snapshotRevision: 1 }), permission).reason, 'notice_handled_upstream')
  assert.equal(resolveCashLoanRoute(snapshot({ orderStatus: 20 }), 1, intent('cash_loan_primary_action', { snapshotRevision: 1 }), permission).type, 'error')
  assert.equal(resolveCashLoanRoute(snapshot({ orderStatus: 999, orderId: 'order-1' }), 1, intent('cash_loan_primary_action', { snapshotRevision: 1 }), permission).type, 'error')
})

test('enforces permission, mode and snapshot revision gates', () => {
  const routeIntent = intent('cash_loan_primary_action', { snapshotRevision: 2 })
  assert.equal(resolveHomeRouteIntent({ snapshot: snapshot(), currentSnapshotRevision: 1, routeIntent, permissionResult: permission }).reason, 'stale_intent')
  assert.equal(resolveHomeRouteIntent({ snapshot: snapshot(), currentSnapshotRevision: 2, routeIntent, permissionResult: { status: 'failed', operationId: 'operation-1' } }).reason, 'permission_required')
  assert.equal(resolveHomeRouteIntent({ snapshot: snapshot({ appMode: 1 }), currentSnapshotRevision: 2, routeIntent, permissionResult: permission }).reason, 'unsupported_mode')
  assert.equal(resolveHomeRouteIntent({ snapshot: snapshot({ appMode: 2 }), currentSnapshotRevision: 2, routeIntent, permissionResult: permission }).reason, 'notice_handled_upstream')
  assert.equal(resolveHomeRouteIntent({ snapshot: snapshot(), currentSnapshotRevision: -1, routeIntent: intent('cash_loan_primary_action', { snapshotRevision: -1 }), permissionResult: permission }).reason, 'stale_intent')
})

test('normalizes the canonical data-adapter snapshot without reading display text', () => {
  const base = { mode: 'cash_loan', orderStatus: 20, orderId: 'order-1' }
  const routeIntent = intent('cash_loan_primary_action', { snapshotRevision: 3 })
  const resolved = resolveCashLoanRoute({ ...base, stage: 'basic_info_required' }, 3, routeIntent, permission)
  assert.equal(resolved.route.name, 'information')
  assert.equal(resolveCashLoanRoute({ ...base, stage: 'additional_info_required' }, 3, routeIntent, permission).route.name, 'contacts')
  assert.equal(resolveCashLoanRoute({ ...base, stage: 'identity_required' }, 3, routeIntent, permission).route.name, 'identity')
  assert.equal(resolveCashLoanRoute({ ...base, stage: 'remittance_account_required' }, 3, routeIntent, permission).route.name, 'addBank')
  assert.equal(resolveCashLoanRoute({ ...base, stage: 'reviewing' }, 3, routeIntent, permission).route.name, 'orderDetail')
})

test('maps tabs and lists while protecting primary list intents', () => {
  for (const target of ['home_tab', 'repayment_tab', 'account_tab']) {
    const resolved = resolveHomeRouteIntent({ routeIntent: intent(target) })
    assert.equal(resolved.type, 'navigate')
  }
  assert.equal(resolveHomeRouteIntent({ routeIntent: intent('order_list'), permissionResult: permission }).route.name, 'orderList')
  assert.equal(resolveHomeRouteIntent({ routeIntent: intent('repayment_list'), permissionResult: { status: 'failed', operationId: 'operation-1' } }).type, 'blocked')
})

test('consumer skips duplicate navigation and pushes named routes', async () => {
  const calls = []
  const router = { currentRoute: { value: { name: 'home', query: {} } }, push: async (location) => calls.push(location) }
  const consumer = createHomeRouteConsumer({ router })
  const ignored = await consumer.consumeHomeRouteIntent({ routeIntent: intent('home_tab'), currentRoute: router.currentRoute.value })
  assert.equal(ignored.type, 'ignored')
  const navigated = await consumer.consumeHomeRouteIntent({ routeIntent: intent('order_list'), permissionResult: permission })
  assert.equal(navigated.type, 'navigated')
  assert.deepEqual(calls, [{ name: 'orderList', query: {} }])
})
