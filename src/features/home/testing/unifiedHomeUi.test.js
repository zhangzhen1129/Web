import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HOME_OPERATION_TYPE,
  validateHomeOperation,
  validateHomeViewPayload,
} from '../ui/homeUiContract.js'
import { createHomeUiSession } from '../ui/homeUiSession.js'
import { createFixtureParts, createUnifiedHomeFixture, unifiedHomeFixtures } from './unifiedHomeFixtures.js'

function createRequestIdFactory() {
  let sequence = 0
  return () => `operation-${sequence += 1}`
}

function createClock() {
  let sequence = 0
  const callbacks = new Map()
  return {
    callbacks,
    setInterval(callback, delay) {
      const timerId = sequence += 1
      callbacks.set(timerId, { callback, delay })
      return timerId
    },
    clearInterval(timerId) {
      callbacks.delete(timerId)
    },
  }
}

function createSession(options = {}) {
  const operations = []
  const diagnostics = []
  const clock = options.clock ?? createClock()
  const session = createHomeUiSession({
    createRequestId: options.createRequestId ?? createRequestIdFactory(),
    clock,
    onOperation: (operation) => operations.push(operation),
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  })
  return { session, operations, diagnostics, clock }
}

function responseFor(payload, operationId, revision, requestId = `model-${revision}`) {
  return { ...structuredClone(payload), requestId, revision, sourceOperationId: operationId }
}

test('all independent root and page-state fixtures satisfy HomeViewPayload', () => {
  for (const [name, payload] of Object.entries(unifiedHomeFixtures)) {
    assert.deepEqual(validateHomeViewPayload(payload), [], name)
  }
})

test('payload validation rejects unknown fields, resources, modes and amount branches', () => {
  const unknownField = { ...createUnifiedHomeFixture('cash-apply'), statusCode: 10 }
  assert.ok(validateHomeViewPayload(unknownField).some((item) => item.code === 'unknown_field'))

  const invalidStep = createUnifiedHomeFixture('cash-apply')
  invalidStep.viewData.steps[0].iconResourceKey = 'unknown-step'
  assert.ok(validateHomeViewPayload(invalidStep).some((item) => item.code === 'unknown_resource_key'))

  const invalidTab = createUnifiedHomeFixture('cash-apply')
  invalidTab.tabs[0].iconResourceKey = 'unknown-tab'
  assert.ok(validateHomeViewPayload(invalidTab).some((item) => item.code === 'unknown_resource_key'))

  const invalidCashBranch = createUnifiedHomeFixture('cash-reviewing')
  invalidCashBranch.viewData.creditSummary = createFixtureParts().creditSummary()
  delete invalidCashBranch.viewData.productSelection
  assert.ok(validateHomeViewPayload(invalidCashBranch).some((item) => item.code === 'required_for_view_mode'))
})

test('payload validation enforces exact broadcast, product and count-template constraints', () => {
  const shortBroadcast = createUnifiedHomeFixture('multi-available-only')
  shortBroadcast.multiPushViewData.broadcast.items.pop()
  assert.ok(validateHomeViewPayload(shortBroadcast).some((item) => item.code === 'invalid_item_count'))

  const duplicateProduct = createUnifiedHomeFixture('multi-available-only')
  duplicateProduct.multiPushViewData.products[1].productId = duplicateProduct.multiPushViewData.products[0].productId
  assert.ok(validateHomeViewPayload(duplicateProduct).some((item) => item.code === 'duplicate_value'))

  const insecureIcon = createUnifiedHomeFixture('multi-available-only')
  insecureIcon.multiPushViewData.products[0].iconUrl = 'http://example.test/icon.png'
  assert.ok(validateHomeViewPayload(insecureIcon).some((item) => item.code === 'invalid_https_url'))

  const credentialIcon = createUnifiedHomeFixture('multi-available-only')
  credentialIcon.multiPushViewData.products[0].iconUrl = 'https://user:secret@example.test/icon.png'
  assert.ok(validateHomeViewPayload(credentialIcon).some((item) => item.code === 'invalid_https_url'))

  const invalidTemplate = createUnifiedHomeFixture('multi-available-only')
  invalidTemplate.multiPushViewData.productSummary.countTextTemplate = '{count} de {count}'
  assert.ok(validateHomeViewPayload(invalidTemplate).some((item) => item.code === 'invalid_count_placeholder'))
})

test('invalid, duplicate and stale models retain the latest legal state', () => {
  const { session, diagnostics } = createSession()
  const initial = createUnifiedHomeFixture('cash-apply')
  assert.equal(session.updateHomeView(initial), true)

  const operationId = session.refresh()
  const invalid = responseFor(initial, operationId, 2)
  invalid.homeMode = 'unknown'
  assert.equal(session.updateHomeView(invalid), false)
  assert.equal(session.getState().requestId, initial.requestId)
  assert.equal(session.getState().pendingOperationType, HOME_OPERATION_TYPE.REFRESH)

  const accepted = responseFor(initial, operationId, 2)
  assert.equal(session.updateHomeView(accepted), true)
  assert.equal(session.updateHomeView(accepted), false)

  const nextOperationId = session.refresh()
  const stale = responseFor(initial, nextOperationId, 1, 'stale-model')
  assert.equal(session.updateHomeView(stale), false)
  assert.equal(session.getState().revision, 2)
  assert.ok(diagnostics.some((item) => item.code === 'INVALID_HOME_VIEW'))
})

test('lifecycle models may omit sourceOperationId when no UI operation is pending', () => {
  const { session } = createSession()
  const initial = createUnifiedHomeFixture('cash-apply')
  assert.equal(session.updateHomeView(initial), true)

  const returningLoading = { ...structuredClone(initial), requestId: 'return-loading', revision: 2, pageStatus: 'loading' }
  delete returningLoading.homeMode
  delete returningLoading.viewMode
  delete returningLoading.viewData
  assert.equal(session.updateHomeView(returningLoading), true)
  assert.equal(session.getState().pageStatus, 'loading')

  const operationId = session.refresh()
  assert.equal(session.updateHomeView(responseFor(initial, 'unknown-operation', 3)), false)
  assert.equal(session.updateHomeView(responseFor(initial, operationId, 3)), true)
  assert.equal(session.updateHomeView(responseFor(initial, operationId, 4)), false)
})

test('refresh keeps its source operation through the loading skeleton until the terminal model arrives', () => {
  const { session } = createSession()
  const initial = createUnifiedHomeFixture('cash-apply')
  assert.equal(session.updateHomeView(initial), true)

  const operationId = session.refresh()
  const loading = {
    requestId: 'loading-2',
    revision: 2,
    pageStatus: 'loading',
    tabs: structuredClone(initial.tabs),
    sourceOperationId: operationId,
  }
  assert.equal(session.updateHomeView(loading), true)
  assert.equal(session.getState().pageStatus, 'loading')
  assert.equal(session.getState().pendingOperationType, HOME_OPERATION_TYPE.REFRESH)

  const terminal = responseFor(initial, operationId, 3)
  assert.equal(session.updateHomeView(terminal), true)
  assert.equal(session.getState().pageStatus, 'content')
  assert.equal(session.getState().pendingOperationType, null)
})

test('a business-failure loading model without a toast releases refresh after the request skeleton', () => {
  const { session } = createSession()
  const initial = createUnifiedHomeFixture('cash-apply')
  assert.equal(session.updateHomeView(initial), true)

  const operationId = session.refresh()
  const requestLoading = {
    requestId: 'loading-2',
    revision: 2,
    pageStatus: 'loading',
    tabs: structuredClone(initial.tabs),
    sourceOperationId: operationId,
  }
  assert.equal(session.updateHomeView(requestLoading), true)
  assert.equal(session.getState().pendingOperationType, HOME_OPERATION_TYPE.REFRESH)

  const businessFailure = {
    requestId: 'loading-3',
    revision: 3,
    pageStatus: 'loading',
    tabs: structuredClone(initial.tabs),
    sourceOperationId: operationId,
  }
  assert.equal(session.updateHomeView(businessFailure), true)
  assert.equal(session.getState().pageStatus, 'loading')
  assert.equal(session.getState().pendingOperationType, null)
})

test('a newer operation replaces the previous sourceOperationId', () => {
  const { session, operations } = createSession()
  const initial = createUnifiedHomeFixture('cash-apply')
  session.updateHomeView(initial)
  const amountOperationId = session.selectAmount('4900')
  const termOperationId = session.selectTerm('120')

  assert.notEqual(amountOperationId, termOperationId)
  assert.equal(session.updateHomeView(responseFor(initial, amountOperationId, 2)), false)
  assert.equal(session.updateHomeView(responseFor(initial, termOperationId, 2)), true)
  assert.deepEqual(operations.map((item) => item.type), ['select_amount', 'select_term'])
})

test('operations have exact fields, unique IDs and duplicate-action protection', () => {
  const { session, operations } = createSession()
  session.updateHomeView(createUnifiedHomeFixture('cash-apply'))

  assert.equal(session.selectAmount('5000'), null)
  assert.equal(session.selectTerm('91'), null)
  assert.equal(session.selectAdjacentAmount('next'), null)
  assert.equal(session.selectAdjacentAmount('previous'), 'operation-1')
  assert.equal(session.selectAdjacentAmount('previous'), null)
  assert.equal(session.primaryAction(), 'operation-2')
  assert.equal(session.primaryAction(), null)

  assert.deepEqual(operations, [
    { requestId: 'operation-1', type: 'select_amount', data: { amountKey: '4900' } },
    { requestId: 'operation-2', type: 'primary_action', data: { amountKey: '5000', termKey: '91' } },
  ])
  operations.forEach((operation) => assert.deepEqual(validateHomeOperation(operation), []))
})

test('credit refresh and tabs only emit enabled semantic intents', () => {
  const { session, operations } = createSession()
  session.updateHomeView(createUnifiedHomeFixture('multi-available-only'))

  assert.equal(session.refreshCredit(), 'operation-1')
  assert.equal(session.refreshCredit(), null)
  assert.equal(session.selectTab('home'), null)
  assert.equal(session.selectTab('account'), 'operation-2')
  assert.deepEqual(operations.map((item) => item.type), ['refresh_credit', 'select_tab'])
  assert.deepEqual(operations[1].data, { tabKey: 'account' })
})

test('product selection updates immediately and protects the final selected product', () => {
  const { session, operations } = createSession()
  session.updateHomeView(createUnifiedHomeFixture('multi-available-only'))

  for (const productId of ['product-1', 'product-2', 'product-3', 'product-4']) {
    assert.ok(session.toggleProductSelection(productId))
  }
  assert.equal(session.getSelectedCountText(), '1 productos')
  assert.equal(session.toggleProductSelection('product-5'), null)
  assert.equal(session.getSelectedCountText(), '1 productos')
  assert.ok(session.submitSelectedProducts())
  assert.deepEqual(operations.at(-1), {
    requestId: 'operation-5',
    type: 'submit_selected_products',
    data: { productIds: ['product-5'] },
  })
})

test('new selectable products must first arrive selected', () => {
  const { session } = createSession()
  const initial = createUnifiedHomeFixture('multi-available-only')
  session.updateHomeView(initial)
  const operationId = session.refresh()
  const next = responseFor(initial, operationId, 2)
  next.multiPushViewData.products.push({
    productId: 'new-product',
    iconUrl: 'https://example.test/product.png',
    name: 'Producto nuevo',
    loanAmountText: 'S/ 800',
    dueDateText: '2026-09-09',
    isReloan: false,
    selectable: true,
    selected: false,
  })
  assert.equal(session.updateHomeView(next), false)
  assert.equal(session.getState().revision, 1)
})

test('active-only empty products retain a disabled summary and cannot open a dialog', () => {
  const { session } = createSession()
  session.updateHomeView(createUnifiedHomeFixture('multi-active-only'))
  assert.equal(session.shouldShowProductSummary(), true)
  assert.equal(session.getSelectedCountText(), '0 productos')
  assert.equal(session.openProductDialog(), false)
  assert.equal(session.getState().dialogOpen, false)
})

test('broadcast timers pause, resume and clean up with the page lifecycle', () => {
  const clock = createClock()
  const { session } = createSession({ clock })
  session.updateHomeView(createUnifiedHomeFixture('cash-apply'))
  assert.equal(clock.callbacks.size, 1)
  const timer = [...clock.callbacks.values()][0]
  assert.equal(timer.delay, 2000)
  timer.callback()
  assert.equal(session.getState().broadcastIndex, 1)

  session.hide()
  assert.equal(clock.callbacks.size, 0)
  assert.equal(session.getState().overlayVisible, false)
  assert.equal(session.getState().dialogOpen, false)

  session.show()
  assert.equal(clock.callbacks.size, 1)
  session.destroy()
  assert.equal(clock.callbacks.size, 0)
  assert.equal(session.updateHomeView(createUnifiedHomeFixture('cash-apply')), false)
})

test('notices are model-driven and local dismissal emits no operation', () => {
  const { session, operations } = createSession()
  session.updateHomeView(createUnifiedHomeFixture('overlay'))
  assert.equal(session.getState().overlayVisible, true)
  assert.equal(session.dismissOverlayNotice(), true)
  assert.equal(session.dismissOverlayNotice(), false)
  assert.deepEqual(operations, [])
})

test('a missing or failing operation receiver is diagnosed without breaking the session', () => {
  const diagnostics = []
  const session = createHomeUiSession({
    createRequestId: createRequestIdFactory(),
    clock: createClock(),
    onOperation() {
      throw new Error('receiver failure')
    },
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  })
  session.updateHomeView(createUnifiedHomeFixture('cash-apply'))
  assert.equal(session.refresh(), 'operation-1')
  assert.ok(diagnostics.some((item) => item.code === 'HOME_OPERATION_RECEIVER_FAILED'))
})
