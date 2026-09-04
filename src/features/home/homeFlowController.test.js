import assert from 'node:assert/strict'
import test from 'node:test'
import { createHomeFlowController } from './homeFlowController.js'

const ids = (() => { let value = 0; return (prefix) => `${prefix}-${++value}` })()

function cashPayload(requestId, revision, effect = null) {
  return {
    requestId,
    revision,
    pageStatus: 'content',
    homeMode: 'cash_loan',
    viewMode: 'apply',
    viewData: {
      productSelection: {
        amountOptions: [{ key: '100', disabled: false }],
        selectedAmountKey: '100',
        termOptions: [{ key: '30', disabled: false }],
        selectedTermKey: '30',
      },
      primaryAction: { enabled: true, loading: false },
    },
    tabs: [
      { key: 'home', active: true, enabled: true },
      { key: 'account', active: false, enabled: true },
    ],
    effect,
  }
}

function createHarness(dataResultFactory) {
  const calls = []
  const views = []
  const intents = []
  const host = {
    showHomeHostLoading: ({ loadingCycleId }) => calls.push(`show:${loadingCycleId}`),
    hideHomeHostLoading: ({ loadingCycleId }) => calls.push(`hide:${loadingCycleId}`),
    initializeHomeHostContext: ({ initCycleId }) => { calls.push(`init:${initCycleId}`); return Promise.resolve({ status: 'completed' }) },
    disposeHomeHostInit: ({ initCycleId }) => calls.push(`dispose:${initCycleId}`),
    requestHomePermissions: ({ operationId }) => { calls.push(`permission:${operationId}`); return Promise.resolve({ operationId, status: 'granted' }) },
    executeNativeDataPlan: ({ operationId, homeMode }) => { calls.push(`native:${operationId}:${homeMode}`); return Promise.resolve({ operationId, status: 'trigger_dispatched' }) },
    cancelHomeHostOperation: ({ operationId }) => calls.push(`cancel:${operationId}`),
  }
  const data = {
    loadHomeData: async (input) => { calls.push(`load:${input.trigger}`); return dataResultFactory(input) },
    cancelHomeDataLoad: ({ loadCycleId }) => calls.push(`cancelLoad:${loadCycleId}`),
  }
  const controller = createHomeFlowController({
    createId: ids,
    updateHomeView: (payload) => views.push(payload),
    emitHomeRouteIntent: (intent) => intents.push(intent),
    hostService: host,
    dataProvider: data,
  })
  return { calls, views, intents, controller }
}

test('runs host initialization before initial data and emits one final model', async () => {
  const harness = createHarness((input) => ({
    loadCycleId: input.loadCycleId,
    viewRevision: input.viewRevision,
    status: 'content',
    viewPayload: cashPayload(input.loadCycleId, input.viewRevision),
    snapshot: { mode: 'cash_loan', primaryActionEffect: null },
  }))
  const result = await harness.controller.startHomeFlow({ flowScopeId: 'scope-a' })
  assert.equal(result.status, 'ready')
  assert.deepEqual(harness.calls.map((item) => item.split(':')[0]), ['show', 'init', 'load', 'hide'])
  assert.equal(harness.views.length, 1)
  assert.equal(harness.controller.getState().flowStatus, 'ready')
})

test('replaces an active load and ignores stale completion', async () => {
  const pending = []
  const harness = createHarness((input) => new Promise((resolve) => pending.push({ input, resolve })))
  const start = harness.controller.startHomeFlow({ flowScopeId: 'scope-b' })
  await Promise.resolve()
  const first = pending.shift()
  first.resolve({ loadCycleId: first.input.loadCycleId, viewRevision: first.input.viewRevision, status: 'content', viewPayload: cashPayload(first.input.loadCycleId, first.input.viewRevision), snapshot: { mode: 'cash_loan', primaryActionEffect: null } })
  await start
  const next = harness.controller.activateHome({ flowScopeId: 'scope-b', reason: 'return_from_tab' })
  await Promise.resolve()
  const second = pending.shift()
  const third = harness.controller.activateHome({ flowScopeId: 'scope-b', reason: 'return_from_child' })
  await Promise.resolve()
  const latest = pending.shift()
  second.resolve({ loadCycleId: second.input.loadCycleId, viewRevision: second.input.viewRevision, status: 'content', viewPayload: cashPayload(second.input.loadCycleId, second.input.viewRevision), snapshot: { mode: 'cash_loan', primaryActionEffect: null } })
  await next
  latest.resolve({ loadCycleId: latest.input.loadCycleId, viewRevision: latest.input.viewRevision, status: 'content', viewPayload: cashPayload(latest.input.loadCycleId, latest.input.viewRevision), snapshot: { mode: 'cash_loan', primaryActionEffect: null } })
  await third
  assert.equal(harness.controller.getState().flowStatus, 'ready')
  assert.ok(harness.calls.some((item) => item.startsWith('cancelLoad:')))
})

test('requires permission before native and emits semantic route intent', async () => {
  const harness = createHarness((input) => ({
    loadCycleId: input.loadCycleId,
    viewRevision: input.viewRevision,
    status: 'content',
    viewPayload: {
      requestId: input.loadCycleId,
      revision: input.viewRevision,
      pageStatus: 'content',
      homeMode: 'multi_push',
      multiPushViewData: { primaryAction: { enabled: true, loading: false }, products: [] },
      tabs: [{ key: 'home', active: true, enabled: true }, { key: 'account', active: false, enabled: true }],
    },
    snapshot: { mode: 'multi_push', variant: 'processing_only', primaryActionEffect: 'navigate_order_list' },
  }))
  await harness.controller.startHomeFlow({ flowScopeId: 'scope-c' })
  const result = await harness.controller.handleHomeOperation({ flowScopeId: 'scope-c', operation: { requestId: 'primary-1', type: 'primary_action' } })
  assert.equal(result.status, 'completed')
  assert.deepEqual(harness.intents.map((item) => item.target), ['order_list'])
  assert.equal(harness.calls.filter((item) => item.startsWith('permission:')).length, 1)
  assert.equal(harness.calls.filter((item) => item.startsWith('native:')).length, 0)
})

test('routes eligible cash loan primary action with snapshot revision', async () => {
  const harness = createHarness((input) => ({
    loadCycleId: input.loadCycleId,
    viewRevision: input.viewRevision,
    status: 'content',
    viewPayload: cashPayload(input.loadCycleId, input.viewRevision),
    snapshot: { mode: 'cash_loan', primaryActionEffect: null },
  }))
  await harness.controller.startHomeFlow({ flowScopeId: 'scope-cash-route' })
  const snapshotRevision = harness.controller.getState().snapshotRevision
  const result = await harness.controller.handleHomeOperation({
    flowScopeId: 'scope-cash-route',
    operation: { requestId: 'cash-primary-1', type: 'primary_action' },
  })
  assert.equal(result.status, 'completed')
  assert.equal(result.effect.target, 'cash_loan_primary_action')
  assert.equal(result.effect.snapshotRevision, snapshotRevision)
  assert.equal(harness.calls.filter((item) => item.startsWith('native:')).length, 0)
})

test('selection updates are local and duplicate operation ids are ignored', async () => {
  const harness = createHarness((input) => ({
    loadCycleId: input.loadCycleId,
    viewRevision: input.viewRevision,
    status: 'content',
    viewPayload: cashPayload(input.loadCycleId, input.viewRevision),
    snapshot: { mode: 'cash_loan', primaryActionEffect: null },
  }))
  await harness.controller.startHomeFlow({ flowScopeId: 'scope-d' })
  const operation = { requestId: 'amount-1', type: 'select_amount', data: { amountKey: '100' } }
  const first = await harness.controller.handleHomeOperation({ flowScopeId: 'scope-d', operation })
  const second = await harness.controller.handleHomeOperation({ flowScopeId: 'scope-d', operation })
  assert.equal(first.status, 'completed')
  assert.equal(second.status, 'ignored')
  assert.equal(harness.calls.filter((item) => item.startsWith('load:')).length, 1)
})

test('refresh emits a refreshing content model and returns ready', async () => {
  const harness = createHarness((input) => ({
    loadCycleId: input.loadCycleId,
    viewRevision: input.viewRevision,
    status: 'content',
    viewPayload: cashPayload(input.loadCycleId, input.viewRevision),
    snapshot: { mode: 'cash_loan', primaryActionEffect: null },
  }))
  await harness.controller.startHomeFlow({ flowScopeId: 'scope-refresh' })
  const result = await harness.controller.handleHomeOperation({ flowScopeId: 'scope-refresh', operation: { requestId: 'refresh-1', type: 'refresh' } })
  assert.equal(result.status, 'completed')
  assert.equal(harness.views.at(-2).pageStatus, 'refreshing')
  assert.equal(harness.views.at(-2).viewData.productSelection.selectedAmountKey, '100')
})

test('rejects an empty primary action payload before requesting permission', async () => {
  const harness = createHarness((input) => ({
    loadCycleId: input.loadCycleId,
    viewRevision: input.viewRevision,
    status: 'content',
    viewPayload: cashPayload(input.loadCycleId, input.viewRevision),
    snapshot: { mode: 'cash_loan', primaryActionEffect: null },
  }))
  await harness.controller.startHomeFlow({ flowScopeId: 'scope-invalid' })
  const result = await harness.controller.handleHomeOperation({ flowScopeId: 'scope-invalid', operation: { requestId: 'primary-empty', type: 'primary_action', data: {} } })
  assert.equal(result.status, 'failed')
  assert.equal(harness.calls.some((item) => item.startsWith('permission:')), false)
})
