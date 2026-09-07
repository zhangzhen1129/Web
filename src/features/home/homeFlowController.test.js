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

function createHarness(dataResultFactory, hostOverrides = {}, dataCollectionService = null, getMessage = undefined, onDataCollectionStatus = undefined, multiPushApplicationService = null) {
  const calls = []
  const views = []
  const intents = []
  const intentContexts = []
  const host = {
    showHomeHostLoading: ({ loadingCycleId }) => calls.push(`show:${loadingCycleId}`),
    hideHomeHostLoading: ({ loadingCycleId }) => calls.push(`hide:${loadingCycleId}`),
    initializeHomeHostContext: ({ initCycleId }) => { calls.push(`init:${initCycleId}`); return Promise.resolve({ status: 'completed' }) },
    disposeHomeHostInit: ({ initCycleId }) => calls.push(`dispose:${initCycleId}`),
    requestHomePermissions: ({ operationId }) => { calls.push(`permission:${operationId}`); return Promise.resolve({ operationId, status: 'granted' }) },
    cancelHomeHostOperation: ({ operationId }) => calls.push(`cancel:${operationId}`),
    ...hostOverrides,
  }
  const data = {
    loadHomeData: async (input) => { calls.push(`load:${input.trigger}`); return dataResultFactory(input) },
    cancelHomeDataLoad: ({ loadCycleId }) => calls.push(`cancelLoad:${loadCycleId}`),
  }
  const controller = createHomeFlowController({
    createId: ids,
    updateHomeView: (payload) => views.push(payload),
    emitHomeRouteIntent: (intent, context) => { intents.push(intent); intentContexts.push(context) },
    hostService: host,
    dataProvider: data,
    dataCollectionService,
    multiPushApplicationService,
    ...(getMessage ? { getMessage } : {}),
    ...(onDataCollectionStatus ? { onDataCollectionStatus } : {}),
  })
  return { calls, views, intents, intentContexts, controller }
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
  const returnedLoading = harness.views.at(-2)
  const returnedContent = harness.views.at(-1)
  assert.equal(returnedLoading.pageStatus, 'loading')
  assert.equal(returnedContent.pageStatus, 'content')
  assert.notEqual(returnedLoading.requestId, returnedContent.requestId)
})

test('returning to home shows host loading and a skeleton before requesting data', async () => {
  let resolveReturnLoad
  const harness = createHarness((input) => {
    if (input.trigger === 'return') {
      return new Promise((resolve) => {
        resolveReturnLoad = () => resolve({
          loadCycleId: input.loadCycleId,
          viewRevision: input.viewRevision,
          status: 'content',
          viewPayload: cashPayload(input.loadCycleId, input.viewRevision),
          snapshot: { mode: 'cash_loan', primaryActionEffect: null },
        })
      })
    }
    return {
      loadCycleId: input.loadCycleId,
      viewRevision: input.viewRevision,
      status: 'content',
      viewPayload: cashPayload(input.loadCycleId, input.viewRevision),
      snapshot: { mode: 'cash_loan', primaryActionEffect: null },
    }
  })

  await harness.controller.startHomeFlow({ flowScopeId: 'scope-return-loading' })
  const returning = harness.controller.activateHome({ flowScopeId: 'scope-return-loading', reason: 'return_from_tab' })
  await Promise.resolve()

  const loadIndex = harness.calls.lastIndexOf('load:return')
  const showIndex = harness.calls.findLastIndex((item) => item.startsWith('show:'))
  assert.ok(showIndex >= 0 && showIndex < loadIndex)
  assert.equal(harness.views.at(-1).pageStatus, 'loading')

  resolveReturnLoad()
  await returning
  assert.equal(harness.views.at(-1).pageStatus, 'content')
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
  assert.equal(harness.intentContexts[0].permissionResult.status, 'granted')
  assert.equal(harness.calls.filter((item) => item.startsWith('permission:')).length, 1)
  assert.equal(harness.calls.filter((item) => item.startsWith('native:')).length, 0)
})

test('allows multi push application only after data upload succeeds', async () => {
  const dataResultFactory = (input) => ({
    loadCycleId: input.loadCycleId,
    viewRevision: input.viewRevision,
    status: 'content',
    viewPayload: {
      requestId: input.loadCycleId,
      revision: input.viewRevision,
      pageStatus: 'content',
      homeMode: 'multi_push',
      multiPushViewData: {
        primaryAction: { enabled: true, loading: false },
        products: [{ productId: 'product-1', selectable: true, selected: true }],
      },
      tabs: [{ key: 'home', active: true, enabled: true }, { key: 'account', active: false, enabled: true }],
    },
    snapshot: {
      mode: 'multi_push',
      variant: 'available_only',
      primaryActionEffect: 'apply_order',
      products: [{ productId: 'product-1' }],
      selectedProductCount: 1,
      minimumSelectionCount: 1,
    },
  })
  const rejected = createHarness(dataResultFactory)
  await rejected.controller.startHomeFlow({ flowScopeId: 'scope-multi-apply-rejected' })
  const rejectedResult = await rejected.controller.handleHomeOperation({
    flowScopeId: 'scope-multi-apply-rejected',
    operation: { requestId: 'multi-apply-dispatched', type: 'primary_action' },
  })
  assert.equal(rejectedResult.status, 'failed')
  assert.equal(rejectedResult.error.code, 'DATA_COLLECTION_UNAVAILABLE')

  const statuses = []
  const notifications = []
  const allowed = createHarness(dataResultFactory, {}, {
    triggerUpload: ({ operationId, onStatus, signal }) => {
      assert.equal(signal.aborted, false)
      onStatus('collecting')
      onStatus('uploading')
      statuses.push(operationId)
      return Promise.resolve({ operationId, status: 'success' })
    },
  }, undefined, (status) => notifications.push(status), {
    preApply: async ({ productIds }) => { assert.deepEqual(productIds, ['product-1']); return { status: 'success', orderIds: ['order-1'] } },
    apply: async ({ orderIds }) => { assert.deepEqual(orderIds, ['order-1']); return { status: 'success' } },
  })
  await allowed.controller.startHomeFlow({ flowScopeId: 'scope-multi-apply-allowed' })
  const allowedResult = await allowed.controller.handleHomeOperation({
    flowScopeId: 'scope-multi-apply-allowed',
    operation: { requestId: 'multi-apply-success', type: 'primary_action' },
  })
  assert.equal(allowedResult.status, 'completed')
  assert.equal(allowedResult.effect.target, 'multi_push_application_result')
  assert.deepEqual(Object.keys(allowedResult.effect.params), ['systemTime'])
  assert.equal(Number.isSafeInteger(allowedResult.effect.params.systemTime), true)
  assert.deepEqual(allowed.intents.map((item) => item.target), ['multi_push_application_result'])
  assert.deepEqual(statuses, ['multi-apply-success'])
  assert.deepEqual(notifications, [
    { operationId: 'multi-apply-success', status: 'collecting' },
    { operationId: 'multi-apply-success', status: 'uploading' },
    { operationId: 'multi-apply-success', status: 'success' },
  ])
})

test('keeps multi push application on home when data upload fails', async () => {
  const harness = createHarness((input) => ({
    loadCycleId: input.loadCycleId,
    viewRevision: input.viewRevision,
    status: 'content',
    viewPayload: {
      requestId: input.loadCycleId,
      revision: input.viewRevision,
      pageStatus: 'content',
      homeMode: 'multi_push',
      multiPushViewData: {
        primaryAction: { enabled: true, loading: false },
        products: [{ productId: 'product-1', selectable: true, selected: true }],
      },
      tabs: [{ key: 'home', active: true, enabled: true }],
    },
    snapshot: {
      mode: 'multi_push',
      variant: 'available_only',
      primaryActionEffect: 'apply_order',
      products: [{ productId: 'product-1' }],
      selectedProductCount: 1,
      minimumSelectionCount: 1,
    },
  }), {}, {
    triggerUpload: ({ operationId }) => Promise.resolve({ operationId, status: 'collect_failed' }),
  })
  await harness.controller.startHomeFlow({ flowScopeId: 'scope-multi-apply-failed' })
  const result = await harness.controller.handleHomeOperation({
    flowScopeId: 'scope-multi-apply-failed',
    operation: { requestId: 'multi-apply-failed', type: 'primary_action' },
  })
  assert.equal(result.status, 'failed')
  assert.equal(result.error.code, 'COLLECT_FAILED')
  assert.equal(harness.intents.length, 0)
  assert.equal(harness.controller.getState().flowStatus, 'ready')
})

test('shows the configured upload failure notice without navigating', async () => {
  const notifications = []
  const harness = createHarness((input) => ({
    loadCycleId: input.loadCycleId,
    viewRevision: input.viewRevision,
    status: 'content',
    viewPayload: {
      requestId: input.loadCycleId,
      revision: input.viewRevision,
      pageStatus: 'content',
      homeMode: 'multi_push',
      multiPushViewData: {
        primaryAction: { enabled: true, loading: false },
        products: [{ productId: 'product-1', selectable: true, selected: true }],
      },
      tabs: [{ key: 'home', active: true, enabled: true }],
    },
    snapshot: {
      mode: 'multi_push',
      variant: 'available_only',
      primaryActionEffect: 'apply_order',
      products: [{ productId: 'product-1' }],
      selectedProductCount: 1,
      minimumSelectionCount: 1,
    },
  }), {}, {
    triggerUpload: ({ operationId }) => Promise.resolve({ operationId, status: 'upload_failed' }),
  }, (id) => id === '41' ? 'Upload could not be completed.' : '', (status) => notifications.push(status))
  await harness.controller.startHomeFlow({ flowScopeId: 'scope-upload-notice' })
  const result = await harness.controller.handleHomeOperation({
    flowScopeId: 'scope-upload-notice',
    operation: { requestId: 'upload-notice-1', type: 'primary_action' },
  })
  assert.equal(result.status, 'failed')
  assert.equal(harness.intents.length, 0)
  const payload = harness.views.at(-1)
  assert.equal(payload.toastNotice.text, 'Upload could not be completed.')
  assert.match(payload.toastNotice.noticeId, /^notice-/)
  assert.equal(payload.sourceOperationId, 'upload-notice-1')
  assert.notEqual(payload.requestId, harness.views.at(-2).requestId)
  assert.deepEqual(notifications, [{ operationId: 'upload-notice-1', status: 'upload_failed' }])
})

test('opens the product dialog after permission and submits without a second permission request', async () => {
  const dataResultFactory = (input) => ({
    loadCycleId: input.loadCycleId,
    viewRevision: input.viewRevision,
    status: 'content',
    viewPayload: {
      requestId: input.loadCycleId,
      revision: input.viewRevision,
      pageStatus: 'content',
      homeMode: 'multi_push',
      multiPushViewData: {
        primaryAction: { enabled: true, loading: false },
        products: [{ productId: 'product-1', selectable: true, selected: true }],
      },
      tabs: [{ key: 'home', active: true, enabled: true }],
    },
    snapshot: {
      mode: 'multi_push',
      variant: 'available_only',
      primaryActionEffect: 'apply_order',
      products: [{ productId: 'product-1', selected: true }],
      selectedProductCount: 1,
      minimumSelectionCount: 1,
    },
  })
  const phases = []
  const harness = createHarness(dataResultFactory, {}, {
    triggerUpload: ({ operationId, onStatus }) => {
      onStatus('collecting')
      onStatus('uploading')
      return Promise.resolve({ operationId, status: 'success' })
    },
  }, undefined, undefined, {
    preApply: async () => ({ status: 'success', orderIds: ['order-1'] }),
    apply: async () => ({ status: 'success' }),
  })
  await harness.controller.startHomeFlow({ flowScopeId: 'scope-product-dialog' })
  const opened = await harness.controller.handleHomeOperation({
    flowScopeId: 'scope-product-dialog',
    operation: { requestId: 'dialog-open-1', type: 'open_product_dialog' },
  })
  assert.equal(opened.status, 'completed')
  assert.equal(harness.views.at(-1).productDialogVisible, true)

  const submitted = await harness.controller.handleHomeOperation({
    flowScopeId: 'scope-product-dialog',
    operation: { requestId: 'dialog-submit-1', type: 'submit_selected_products', data: { productIds: ['product-1'] } },
  })
  assert.equal(submitted.status, 'completed')
  assert.equal(harness.calls.filter((item) => item.startsWith('permission:')).length, 1)
  assert.equal(harness.views.at(-1).productDialogVisible, false)
  assert.deepEqual(Object.keys(harness.intents[0].params), ['systemTime'])
  for (const payload of harness.views) {
    if (payload.submissionOverlay?.phase) phases.push(payload.submissionOverlay.phase)
  }
  assert.deepEqual([...new Set(phases)], ['collecting', 'uploading', 'pre_applying', 'applying'])
})

test('routes eligible cash loan primary action without waiting for the background trigger', async () => {
  let resolveTrigger
  const triggerStarted = []
  const notifications = []
  const harness = createHarness((input) => ({
    loadCycleId: input.loadCycleId,
    viewRevision: input.viewRevision,
    status: 'content',
    viewPayload: cashPayload(input.loadCycleId, input.viewRevision),
    snapshot: { mode: 'cash_loan', primaryActionEffect: null },
  }), {}, {
    triggerOnly: ({ operationId }) => {
      triggerStarted.push(operationId)
      return new Promise((resolve) => { resolveTrigger = resolve })
    },
  }, undefined, (status) => notifications.push(status))
  await harness.controller.startHomeFlow({ flowScopeId: 'scope-cash-route' })
  const snapshotRevision = harness.controller.getState().snapshotRevision
  const result = await harness.controller.handleHomeOperation({
    flowScopeId: 'scope-cash-route',
    operation: { requestId: 'cash-primary-1', type: 'primary_action' },
  })
  assert.equal(result.status, 'completed')
  assert.equal(result.effect.target, 'cash_loan_primary_action')
  assert.equal(result.effect.snapshotRevision, snapshotRevision)
  assert.deepEqual(triggerStarted, ['cash-primary-1'])
  assert.deepEqual(notifications, [])
  assert.equal(harness.controller.getState().flowStatus, 'ready')
  resolveTrigger({ status: 'accepted' })
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

test('refresh emits a loading skeleton model and returns ready', async () => {
  const harness = createHarness((input) => ({
    loadCycleId: input.loadCycleId,
    viewRevision: input.viewRevision,
    status: 'content',
    viewPayload: cashPayload(input.loadCycleId, input.viewRevision),
    snapshot: { mode: 'cash_loan', primaryActionEffect: null },
  }))
  await harness.controller.startHomeFlow({ flowScopeId: 'scope-refresh' })
  const result = await harness.controller.handleHomeOperation({ flowScopeId: 'scope-refresh', operation: { requestId: 'refresh-1', type: 'refresh', viewMode: 'apply' } })
  assert.equal(result.status, 'completed')
  assert.equal(harness.views.at(-2).pageStatus, 'loading')
  assert.equal(Object.hasOwn(harness.views.at(-2), 'viewData'), false)
  assert.deepEqual(harness.views.at(-2).tabs.map((tab) => tab.key), ['home', 'account'])
  assert.notEqual(harness.views.at(-2).requestId, harness.views.at(-1).requestId)
})

test('retries from an error state and loads a fresh model', async () => {
  const harness = createHarness((input) => input.trigger === 'initial'
    ? {
        loadCycleId: input.loadCycleId,
        viewRevision: input.viewRevision,
        status: 'error',
        viewPayload: {
          requestId: input.loadCycleId,
          revision: input.viewRevision,
          pageStatus: 'error',
          errorData: { messageText: 'Unable to load home data.' },
        },
      }
    : {
        loadCycleId: input.loadCycleId,
        viewRevision: input.viewRevision,
        status: 'content',
        viewPayload: cashPayload(input.loadCycleId, input.viewRevision),
        snapshot: { mode: 'cash_loan', primaryActionEffect: null },
      })

  const initial = await harness.controller.startHomeFlow({ flowScopeId: 'scope-error-retry' })
  assert.equal(initial.status, 'error')
  assert.equal(harness.controller.getState().flowStatus, 'error')
  assert.equal(harness.controller.getState().viewPayload.pageStatus, 'error')
  assert.equal(Object.hasOwn(harness.controller.getState().viewPayload, 'toastNotice'), false)
  assert.equal(harness.calls.filter((item) => item.startsWith('show:')).length, 1)
  assert.equal(harness.calls.filter((item) => item.startsWith('hide:')).length, 1)
  const result = await harness.controller.handleHomeOperation({
    flowScopeId: 'scope-error-retry',
    operation: { requestId: 'refresh-after-error', type: 'refresh' },
  })

  assert.equal(result.status, 'completed')
  assert.deepEqual(harness.calls.filter((item) => item.startsWith('load:')), ['load:initial', 'load:refresh'])
  assert.equal(harness.views.at(-2).pageStatus, 'loading')
  assert.equal(harness.views.at(-1).pageStatus, 'content')
  assert.equal(harness.calls.filter((item) => item.startsWith('show:')).length, 2)
  assert.equal(harness.calls.filter((item) => item.startsWith('hide:')).length, 2)
})

test('clears the refresh lock when a failed load has no usable view model', async () => {
  const harness = createHarness((input) => input.trigger === 'initial'
    ? { loadCycleId: input.loadCycleId, viewRevision: input.viewRevision, status: 'error' }
    : {
        loadCycleId: input.loadCycleId,
        viewRevision: input.viewRevision,
        status: 'content',
        viewPayload: cashPayload(input.loadCycleId, input.viewRevision),
        snapshot: { mode: 'cash_loan', primaryActionEffect: null },
      })

  const initial = await harness.controller.startHomeFlow({ flowScopeId: 'scope-invalid-result' })
  assert.equal(initial.status, 'error')
  assert.equal(harness.controller.getState().viewPayload, null)

  const result = await harness.controller.handleHomeOperation({
    flowScopeId: 'scope-invalid-result',
    operation: { requestId: 'refresh-invalid-result', type: 'refresh' },
  })
  assert.equal(result.status, 'completed')
  assert.deepEqual(harness.calls.filter((item) => item.startsWith('load:')), ['load:initial', 'load:refresh'])
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
