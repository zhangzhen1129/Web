import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BROADCAST_INTERVAL_MS,
  OPERATION_TYPE,
  PAGE_STATUS,
  createHomeController,
  createNoopPageLoadingAdapter,
} from '../index.js'

function createViewData(overrides = {}) {
  return {
    titleText: 'title',
    broadcast: {
      items: [{ key: 'notice-a', text: 'message a' }],
    },
    productSelection: {
      amountLabelText: 'amount label',
      amountOptions: [
        { key: 'amount-a', text: 'amount a', disabled: false },
        { key: 'amount-b', text: 'amount b', disabled: true },
        { key: 'amount-c', text: 'amount c', disabled: false },
      ],
      selectedAmountKey: 'amount-a',
      termLabelText: 'term label',
      termOptions: [
        { key: 'term-a', text: 'term a', disabled: false },
        { key: 'term-b', text: 'term b', disabled: false },
      ],
      selectedTermKey: 'term-a',
      rateText: 'rate',
    },
    primaryAction: { text: 'action', enabled: true, loading: false },
    tabs: [
      { key: 'home', text: 'home', iconResourceKey: 'home-icon', active: true, enabled: true },
      { key: 'account', text: 'account', iconResourceKey: 'account-icon', active: false, enabled: true },
    ],
    ...overrides,
  }
}

function contentPayload(requestId, overrides = {}) {
  return {
    requestId,
    pageStatus: PAGE_STATUS.CONTENT,
    viewMode: 'apply',
    viewData: createViewData(),
    ...overrides,
  }
}

function createCreditViewData() {
  const viewData = createViewData()
  delete viewData.productSelection
  viewData.creditSummary = {
    availableLabelText: 'available label', availableText: 'available value',
    totalLabelText: 'total label', totalText: 'total value',
    usedLabelText: 'used label', usedText: 'used value', locked: false,
  }
  return viewData
}

function createRecordingLoadingPort() {
  const calls = []
  return {
    calls,
    show(requestId) {
      calls.push(['show', requestId])
    },
    hide(requestId) {
      calls.push(['hide', requestId])
    },
  }
}

function createManualClock() {
  let nextId = 0
  const timers = new Map()
  return {
    delays: [],
    setInterval(callback, delay) {
      const id = ++nextId
      timers.set(id, callback)
      this.delays.push(delay)
      return id
    },
    clearInterval(id) {
      timers.delete(id)
    },
    tick() {
      ;[...timers.values()].forEach((callback) => callback())
    },
    activeCount() {
      return timers.size
    },
  }
}

function createSequentialIdFactory() {
  let sequence = 0
  return () => `operation-${++sequence}`
}

test('strictly accepts valid models and isolates input mutations', () => {
  const controller = createHomeController()
  const payload = contentPayload('model-1')

  assert.equal(controller.updateHomeView(payload), undefined)
  payload.viewData.titleText = 'changed outside'

  assert.equal(controller.getState().viewData.titleText, 'title')
  assert.equal(controller.getState().diagnosticCode, null)
  assert.doesNotThrow(() => createNoopPageLoadingAdapter().show('request'))
})

test('invalid fields, enums, selections, and duplicate model ids enter diagnostic error state', () => {
  const diagnostics = []
  const controller = createHomeController({ onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) })

  const invalidSelection = contentPayload('model-invalid')
  invalidSelection.viewData.productSelection.selectedAmountKey = 'missing'
  invalidSelection.extra = true
  controller.updateHomeView(invalidSelection)

  assert.equal(controller.getState().pageStatus, PAGE_STATUS.ERROR)
  assert.equal(controller.getState().errorData, null)
  assert.equal(controller.getState().diagnosticCode, 'INVALID_HOME_VIEW')
  assert.deepEqual(
    diagnostics[0].issues.map((issue) => issue.code).sort(),
    ['selection_not_found', 'unknown_field'],
  )

  controller.updateHomeView(contentPayload('model-1'))
  controller.updateHomeView(contentPayload('model-1'))
  assert.equal(diagnostics.at(-1).issues[0].code, 'duplicate_request_id')

  controller.updateHomeView({ requestId: 'model-2', pageStatus: 'unknown' })
  assert.equal(controller.getState().diagnosticCode, 'INVALID_HOME_VIEW')
})

test('requires expanded credit labels and rejects conditional field violations', () => {
  const diagnostics = []
  const controller = createHomeController({ onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) })
  const missingLabel = contentPayload('model-label', { viewData: createCreditViewData() })
  delete missingLabel.viewData.creditSummary.availableLabelText
  controller.updateHomeView(missingLabel)

  assert.ok(diagnostics[0].issues.some((issue) => issue.path.endsWith('availableLabelText')))

  const mixedContent = contentPayload('model-mixed', { viewData: createViewData({ creditSummary: {
    availableLabelText: 'available label', availableText: 'available value', totalLabelText: 'total label',
    totalText: 'total value', usedLabelText: 'used label', usedText: 'used value', locked: false,
  } }) })
  controller.updateHomeView(mixedContent)
  assert.ok(diagnostics.at(-1).issues.some((issue) => issue.code === 'mutually_exclusive_content'))

  controller.updateHomeView({
    requestId: 'model-error',
    pageStatus: PAGE_STATUS.ERROR,
    errorData: { messageText: 'error', retryVisible: false, retryText: 'unexpected' },
  })
  assert.ok(diagnostics.at(-1).issues.some((issue) => issue.code === 'unexpected_field'))
})

test('emits page operation types with unique ids and exact data', () => {
  const operations = []
  const controller = createHomeController({
    onOperation: (operation) => operations.push(operation),
    createRequestId: createSequentialIdFactory(),
  })
  controller.updateHomeView(contentPayload('model-1'))

  assert.equal(controller.refresh(), 'operation-1')
  controller.updateHomeView(contentPayload('model-2', { sourceOperationId: 'operation-1' }))
  assert.equal(controller.primaryAction(), 'operation-2')
  assert.equal(controller.selectAmount('amount-c'), 'operation-3')
  assert.equal(controller.selectTerm('term-b'), 'operation-4')
  controller.updateHomeView({
    requestId: 'model-3',
    pageStatus: PAGE_STATUS.ERROR,
    errorData: { messageText: 'error', retryVisible: true, retryText: 'retry' },
  })
  assert.equal(controller.retry(), 'operation-5')

  assert.deepEqual(operations.map((operation) => operation.type), Object.values(OPERATION_TYPE))
  assert.equal(new Set(operations.map((operation) => operation.requestId)).size, 5)
  assert.deepEqual(operations[1].data, { amountKey: 'amount-a', termKey: 'term-a' })
  assert.deepEqual(operations[2].data, { amountKey: 'amount-c' })
  assert.deepEqual(operations[3].data, { termKey: 'term-b' })
  assert.equal(Object.hasOwn(operations[0], 'data'), false)
  assert.equal(Object.hasOwn(operations[4], 'data'), false)
})

test('display text changes do not change operation semantics', () => {
  const operations = []
  const controller = createHomeController({ onOperation: (operation) => operations.push(operation) })
  const changedText = createViewData()
  changedText.titleText = 'completely different title'
  changedText.primaryAction.text = 'different action'
  changedText.tabs[1].text = 'different account'
  changedText.productSelection.amountOptions[0].text = 'different amount'
  changedText.productSelection.termOptions[0].text = 'different term'
  changedText.broadcast.items[0].text = 'different broadcast'
  controller.updateHomeView(contentPayload('translated-model', { viewData: changedText }))

  controller.primaryAction()
  assert.deepEqual(operations.map(({ type }) => type), [OPERATION_TYPE.PRIMARY_ACTION])
  assert.deepEqual(operations[0].data, { amountKey: 'amount-a', termKey: 'term-a' })
})

test('rejects disabled, unknown, stale, duplicate, and unavailable operations', () => {
  const operations = []
  const diagnostics = []
  const controller = createHomeController({
    onOperation: (operation) => operations.push(operation),
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  })
  controller.updateHomeView(contentPayload('model-1'))

  controller.selectAmount('amount-b')
  controller.selectAmount('missing')
  controller.emitHomeOperation({
    requestId: 'external-1',
    type: OPERATION_TYPE.PRIMARY_ACTION,
    viewMode: 'reviewing',
    data: { amountKey: 'amount-a', termKey: 'term-a' },
  })
  controller.emitHomeOperation({
    requestId: 'external-2',
    type: OPERATION_TYPE.PRIMARY_ACTION,
    viewMode: 'apply',
    data: { amountKey: 'amount-c', termKey: 'term-a' },
  })

  assert.equal(operations.length, 0)
  assert.equal(diagnostics.length, 4)

  const operation = {
    requestId: 'external-3',
    type: OPERATION_TYPE.SELECT_TERM,
    viewMode: 'apply',
    data: { termKey: 'term-b' },
  }
  controller.emitHomeOperation(operation)
  controller.emitHomeOperation(operation)
  assert.equal(operations.length, 1)
  assert.equal(diagnostics.at(-1).issues[0].code, 'duplicate_request_id')
})

test('adjacent amount selection skips disabled options and stops at boundaries', () => {
  const operations = []
  const controller = createHomeController({
    onOperation: (operation) => operations.push(operation),
    createRequestId: createSequentialIdFactory(),
  })
  controller.updateHomeView(contentPayload('model-1'))

  controller.selectAdjacentAmount('previous')
  controller.selectAdjacentAmount('next')
  assert.deepEqual(operations.map((operation) => operation.data.amountKey), ['amount-c'])

  controller.updateHomeView(contentPayload('model-2', {
    viewData: createViewData({
      productSelection: {
        ...createViewData().productSelection,
        selectedAmountKey: 'amount-c',
      },
    }),
  }))
  controller.selectAdjacentAmount('next')
  assert.equal(operations.length, 1)
})

test('PageLoadingPort show and hide are deduplicated and preserve the opening request id', () => {
  const loadingPort = createRecordingLoadingPort()
  const controller = createHomeController({ loadingPort })

  controller.updateHomeView({ requestId: 'loading-1', pageStatus: PAGE_STATUS.LOADING })
  controller.updateHomeView({ requestId: 'loading-2', pageStatus: PAGE_STATUS.LOADING })
  controller.updateHomeView(contentPayload('model-1'))
  controller.updateHomeView(contentPayload('model-2', {
    viewData: createViewData({ primaryAction: { text: 'action', enabled: false, loading: true } }),
  }))
  controller.updateHomeView(contentPayload('model-3', { pageStatus: PAGE_STATUS.REFRESHING }))

  assert.deepEqual(loadingPort.calls, [['show', 'loading-1'], ['hide', 'loading-1']])

  controller.updateHomeView({ requestId: 'loading-3', pageStatus: PAGE_STATUS.LOADING })
  controller.hide()
  controller.hide()
  controller.destroy()
  assert.deepEqual(loadingPort.calls.slice(-2), [['show', 'loading-3'], ['hide', 'loading-3']])
})

test('refresh completion only responds to the active source operation id', () => {
  const operations = []
  const controller = createHomeController({
    onOperation: (operation) => operations.push(operation),
    createRequestId: createSequentialIdFactory(),
  })
  controller.updateHomeView(contentPayload('model-1'))
  controller.refresh()
  controller.refresh()
  assert.equal(operations.length, 1)
  assert.equal(controller.getState().isRefreshPending, true)

  controller.updateHomeView(contentPayload('model-stale', { sourceOperationId: 'old-operation' }))
  assert.equal(controller.getState().isRefreshPending, true)

  controller.updateHomeView(contentPayload('model-refreshing', {
    sourceOperationId: 'operation-1',
    pageStatus: PAGE_STATUS.REFRESHING,
  }))
  assert.equal(controller.getState().isRefreshPending, true)

  controller.updateHomeView(contentPayload('model-complete', { sourceOperationId: 'operation-1' }))
  assert.equal(controller.getState().isRefreshPending, false)
})

test('retry remains locked until a matching update and lifecycle cleanup cancels pending state', () => {
  const operations = []
  const controller = createHomeController({
    onOperation: (operation) => operations.push(operation),
    createRequestId: createSequentialIdFactory(),
  })
  controller.updateHomeView(contentPayload('model-1'))
  controller.updateHomeView({
    requestId: 'error-1',
    pageStatus: PAGE_STATUS.ERROR,
    errorData: { messageText: 'error', retryVisible: true, retryText: 'retry' },
  })
  controller.retry()
  controller.retry()
  assert.equal(operations.length, 1)
  assert.equal(controller.getState().isRetryPending, true)

  controller.updateHomeView({
    requestId: 'error-2',
    sourceOperationId: 'old-operation',
    pageStatus: PAGE_STATUS.ERROR,
    errorData: { messageText: 'error', retryVisible: true, retryText: 'retry' },
  })
  assert.equal(controller.getState().isRetryPending, true)
  controller.hide()
  assert.equal(controller.getState().isRetryPending, false)
})

test('broadcast uses one manageable two-second timer and cleans it on hide and destroy', () => {
  const clock = createManualClock()
  const controller = createHomeController({ clock })
  controller.updateHomeView(contentPayload('model-1', {
    viewData: createViewData({
      broadcast: {
        items: [
          { key: 'notice-a', text: 'message a' },
          { key: 'notice-b', text: 'message b' },
        ],
      },
    }),
  }))

  assert.equal(clock.activeCount(), 1)
  assert.deepEqual(clock.delays, [BROADCAST_INTERVAL_MS])
  clock.tick()
  assert.equal(controller.getState().broadcastIndex, 1)
  clock.tick()
  assert.equal(controller.getState().broadcastIndex, 0)
  for (let index = 0; index < 10; index += 1) clock.tick()
  assert.equal(controller.getState().broadcastIndex, 0)

  controller.hide()
  assert.equal(clock.activeCount(), 0)
  controller.show()
  assert.equal(clock.activeCount(), 1)
  controller.updateHomeView(contentPayload('model-2'))
  assert.equal(clock.activeCount(), 0)
  controller.destroy()
  assert.equal(clock.activeCount(), 0)
})

test('destroy releases subscriptions and rejects subsequent work without throwing', () => {
  const notifications = []
  const diagnostics = []
  const controller = createHomeController({ onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) })
  controller.subscribe((state) => notifications.push(state.pageStatus))
  controller.updateHomeView(contentPayload('model-1'))
  controller.destroy()
  controller.updateHomeView(contentPayload('model-2'))
  controller.primaryAction()

  assert.deepEqual(notifications, [PAGE_STATUS.CONTENT])
  assert.equal(controller.getState().isDestroyed, true)
  assert.deepEqual(diagnostics.map((item) => item.code), ['CONTROLLER_DESTROYED', 'CONTROLLER_DESTROYED'])
})
