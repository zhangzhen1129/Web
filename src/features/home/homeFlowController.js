import { getProjectMessage } from '../../shared/config/projectLanguage.js'

const FLOW_STATES = new Set([
  'idle', 'initializing_host', 'loading_data', 'ready', 'business_failure',
  'refreshing', 'permission_pending', 'native_processing', 'error', 'disposed',
])
const OPERATION_TYPES = new Set([
  'refresh', 'refresh_credit', 'select_amount', 'select_term',
  'toggle_product_selection', 'submit_selected_products', 'primary_action', 'select_tab',
])
const ACTIVATE_REASONS = new Set(['return_from_tab', 'return_from_child', 'history_restore'])
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const EFFECTS = new Set([
  'show_empty_products_toast', 'show_overlay_notice', 'navigate_repayment_list',
  'navigate_order_list', 'apply_order',
])
const TARGETS = new Set(['home_tab', 'repayment_tab', 'account_tab', 'repayment_list', 'order_list'])

const safeClone = (value) => {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value) } catch {}
  }
  try { return JSON.parse(JSON.stringify(value)) } catch { return value }
}

function validId(value) { return typeof value === 'string' && ID_PATTERN.test(value) }
function fallbackTabs() {
  return [
    { key: 'home', text: 'Préstamos', iconResourceKey: 'home', active: true, enabled: true },
    { key: 'account', text: 'Mi cuenta', iconResourceKey: 'account', active: false, enabled: true },
  ]
}
function sumDecimalStrings(values) {
  const parts = values.map((value) => { const [whole, fraction = ''] = value.split('.'); return { whole, fraction } })
  const scale = Math.max(0, ...parts.map((part) => part.fraction.length))
  const total = parts.reduce((sum, part) => sum + BigInt(part.whole) * (10n ** BigInt(scale)) + BigInt(part.fraction.padEnd(scale, '0') || 0), 0n)
  const raw = total.toString().padStart(scale + 1, '0')
  if (!scale) return raw
  const fraction = raw.slice(-scale).replace(/0+$/, '')
  return fraction ? `${raw.slice(0, -scale)}.${fraction}` : raw.slice(0, -scale)
}
function validScope(value) { return typeof value === 'string' && value.trim().length > 0 }
function resultError(code = 'FLOW_ERROR') { return { category: 'flow', code } }
function asFunction(value) { return typeof value === 'function' ? value : () => undefined }
function makeResult(flowScopeId, cycle, status, error) {
  return Object.freeze({
    flowScopeId,
    ...(cycle?.loadCycleId ? { loadCycleId: cycle.loadCycleId } : {}),
    ...(cycle?.viewRevision !== undefined ? { viewRevision: cycle.viewRevision } : {}),
    status,
    ...(error ? { error: Object.freeze({ category: error.category ?? 'flow', code: error.code ?? 'FLOW_ERROR' }) } : {}),
  })
}

export function createHomeFlowController(options = {}) {
  const ui = options.ui ?? options.uiPort ?? {}
  const host = options.hostService ?? options.host ?? options
  const data = options.dataProvider ?? options.data ?? options
  const updateHomeView = asFunction(options.updateHomeView ?? ui.updateHomeView)
  const emitHomeRouteIntent = asFunction(options.emitHomeRouteIntent ?? options.emitRouteIntent)
  const getMessage = typeof options.getMessage === 'function' ? options.getMessage : (id) => getProjectMessage(id)
  const createId = typeof options.createId === 'function' ? options.createId : null
  let sequence = 0
  const usedIds = new Set()
  const allocate = (prefix) => {
    let value = createId ? createId(prefix) : null
    if (!validId(value) || usedIds.has(value)) value = `${prefix}-${Date.now().toString(36)}-${(sequence += 1).toString(36)}`
    while (!validId(value) || usedIds.has(value)) value = `${prefix}-${(sequence += 1).toString(36)}`
    usedIds.add(value)
    return value
  }
  const listeners = new Set()
  const handledOperations = new Set()
  let state = {
    flowScopeId: null,
    flowStatus: 'idle',
    initCycleId: null,
    loadCycleId: null,
    loadingCycleId: null,
    operationId: null,
    viewRevision: 0,
    snapshotRevision: 0,
    viewPayload: null,
    snapshot: null,
    disposed: false,
  }
  let startPromise = null
  let activeLoad = null
  let activeOperation = null
  let loadingShown = null

  function getState() { return safeClone(state) }
  function notify() { const snapshot = getState(); listeners.forEach((listener) => listener(snapshot)) }
  function setStatus(flowStatus, extra = {}) {
    if (!FLOW_STATES.has(flowStatus)) return
    state = { ...state, flowStatus, ...extra }
    notify()
  }
  function nextViewRevision() {
    const next = state.viewRevision + 1
    state = { ...state, viewRevision: Number.isSafeInteger(next) ? next : 0 }
    return state.viewRevision
  }
  function checkScope(flowScopeId, allowCreate = false) {
    if (!validScope(flowScopeId)) return false
    if (state.flowScopeId === null && allowCreate) { state = { ...state, flowScopeId }; return true }
    return state.flowScopeId === flowScopeId && !state.disposed
  }
  function call(method, args) {
    const fn = host?.[method]
    if (typeof fn !== 'function') return Promise.resolve({ status: 'failed', errorCode: 'DEPENDENCY_UNAVAILABLE' })
    try { return Promise.resolve(fn.call(host, args)) } catch { return Promise.resolve({ status: 'failed', errorCode: 'DEPENDENCY_FAILED' }) }
  }
  function showLoading(id) {
    if (loadingShown === id) return
    if (loadingShown) void call('hideHomeHostLoading', { loadingCycleId: loadingShown })
    loadingShown = id
    void call('showHomeHostLoading', { loadingCycleId: id })
  }
  function hideLoading(id) {
    if (loadingShown !== id) return
    loadingShown = null
    void call('hideHomeHostLoading', { loadingCycleId: id })
  }
  function cancelOperation() {
    const operation = activeOperation
    const operationId = operation?.operationId
    if (!operationId) return
    void call('cancelHomeHostOperation', { operationId })
    operation.cancelResolve?.({ operationId, status: 'canceled' })
    activeOperation = null
    state = { ...state, operationId: null }
  }
  function cancelLoad() {
    const cycle = activeLoad
    if (!cycle) return
    try { data.cancelHomeDataLoad?.({ loadCycleId: cycle.loadCycleId }) } catch {}
    cycle.canceled = true
    activeLoad = null
  }
  function loadingPayload(cycle, pageStatus = 'loading') {
    const previous = state.viewPayload
    const keepContentWhileRefreshing = pageStatus === 'refreshing' && previous?.pageStatus === 'content'
    const payload = keepContentWhileRefreshing
      ? { ...safeClone(previous), requestId: cycle.intermediateRequestId, revision: cycle.viewRevision, pageStatus, toastNotice: undefined, overlayNotice: undefined, errorData: undefined }
      : { requestId: cycle.intermediateRequestId, revision: cycle.viewRevision, pageStatus: 'loading' }
    delete payload.tabs
    delete payload.toastNotice
    delete payload.overlayNotice
    delete payload.errorData
    if (cycle.sourceOperationId) payload.sourceOperationId = cycle.sourceOperationId
    return payload
  }
  function failureLoadingPayload(cycle, result) {
    const messageText = result?.error?.messageText
      || result?.viewPayload?.errorData?.messageText
      || 'Unable to load home data.'
    return {
      requestId: cycle.loadCycleId,
      revision: cycle.viewRevision,
      ...(cycle.sourceOperationId ? { sourceOperationId: cycle.sourceOperationId } : {}),
      pageStatus: 'loading',
      toastNotice: { noticeId: cycle.loadCycleId, text: messageText },
    }
  }
  function sendPayload(payload) {
    try { updateHomeView(safeClone(payload)) } catch {}
  }
  function acceptDataResult(cycle, result) {
    if (!activeLoad || activeLoad !== cycle || cycle.canceled || state.disposed) return makeResult(state.flowScopeId, cycle, 'canceled')
    if (!result || result.loadCycleId !== cycle.loadCycleId || result.viewRevision !== cycle.viewRevision) {
      return makeResult(state.flowScopeId, cycle, 'canceled', resultError('STALE_DATA_RESULT'))
    }
    if (result.status === 'canceled') {
      hideLoading(cycle.loadingCycleId)
      activeLoad = null
      return makeResult(state.flowScopeId, cycle, 'canceled')
    }
    if (!result.viewPayload || result.viewPayload.requestId !== cycle.loadCycleId || result.viewPayload.revision !== cycle.viewRevision) {
      const viewPayload = failureLoadingPayload(cycle, result)
      state = { ...state, viewPayload: safeClone(viewPayload), flowStatus: 'business_failure' }
      sendPayload(viewPayload)
      notify()
      hideLoading(cycle.loadingCycleId)
      activeLoad = null
      if (cycle.sourceOperationId) {
        activeOperation = null
        state = { ...state, operationId: null }
      }
      return makeResult(state.flowScopeId, cycle, 'error', resultError('INVALID_DATA_MODEL'))
    }
    const status = result.status
    if (status === 'content' || status === 'business_failure' || status === 'error' || status === 'handled') {
      const viewPayload = status === 'error' ? failureLoadingPayload(cycle, result) : result.viewPayload
      if (viewPayload) {
        state = { ...state, viewPayload: safeClone(viewPayload) }
        sendPayload(viewPayload)
      }
      if (status === 'content' && result.snapshot) {
        state = { ...state, snapshot: safeClone(result.snapshot), snapshotRevision: state.snapshotRevision + 1, flowStatus: 'ready' }
      } else {
        state = { ...state, flowStatus: status === 'error' || status === 'business_failure' || status === 'handled' ? 'business_failure' : 'error' }
      }
      notify()
      hideLoading(cycle.loadingCycleId)
      activeLoad = null
      if (cycle.sourceOperationId) {
        activeOperation = null
        state = { ...state, operationId: null }
      }
      return makeResult(state.flowScopeId, cycle, status === 'content' ? 'ready' : status, result.error)
    }
    hideLoading(cycle.loadingCycleId)
    activeLoad = null
    state = { ...state, flowStatus: 'error' }
    notify()
    return makeResult(state.flowScopeId, cycle, 'error', resultError('UNKNOWN_DATA_RESULT'))
  }
  async function runLoad({ trigger, sourceOperationId, intermediateStatus = null } = {}) {
    if (state.disposed || !state.flowScopeId) return makeResult(state.flowScopeId, null, 'canceled', resultError('FLOW_DISPOSED'))
    cancelLoad()
    if (sourceOperationId) cancelOperation()
    const loadCycleId = allocate('load')
    const loadingCycleId = loadCycleId
    const intermediateRequestId = allocate('view')
    const intermediateRevision = nextViewRevision()
    const cycle = { loadCycleId, loadingCycleId, intermediateRequestId, sourceOperationId, viewRevision: intermediateRevision, canceled: false }
    state = { ...state, loadCycleId, loadingCycleId, flowStatus: intermediateStatus ?? 'loading_data' }
    showLoading(loadingCycleId)
    if (intermediateStatus) sendPayload(loadingPayload(cycle, intermediateStatus))
    const resultRevision = nextViewRevision()
    cycle.viewRevision = resultRevision
    activeLoad = cycle
    try {
      const result = await data.loadHomeData({ loadCycleId, viewRevision: resultRevision, trigger, ...(sourceOperationId ? { sourceOperationId } : {}) })
      return acceptDataResult(cycle, result)
    } catch { return acceptDataResult(cycle, { loadCycleId, viewRevision: resultRevision, status: 'error' }) }
  }

  function startHomeFlow({ flowScopeId } = {}) {
    if (!checkScope(flowScopeId, true)) return makeResult(flowScopeId, null, 'error', resultError('INVALID_SCOPE'))
    if (startPromise) return startPromise
    state = { ...state, initCycleId: allocate('init'), flowStatus: 'initializing_host' }
    const cycle = { loadCycleId: allocate('load'), loadingCycleId: null, viewRevision: 0 }
    cycle.loadingCycleId = cycle.loadCycleId
    state = { ...state, loadCycleId: cycle.loadCycleId, loadingCycleId: cycle.loadingCycleId }
    showLoading(cycle.loadingCycleId)
    startPromise = (async () => {
      let initResult
      try { initResult = await call('initializeHomeHostContext', { initCycleId: state.initCycleId }) } catch { initResult = { status: 'failed' } }
      if (state.disposed || initResult?.status === 'canceled') {
        hideLoading(cycle.loadingCycleId)
        return makeResult(state.flowScopeId, cycle, 'canceled')
      }
      const revision = nextViewRevision()
      cycle.viewRevision = revision
      activeLoad = cycle
      if (cycle.canceled || state.disposed || state.loadCycleId !== cycle.loadCycleId) {
        hideLoading(cycle.loadingCycleId)
        return makeResult(state.flowScopeId, cycle, 'canceled')
      }
      setStatus('loading_data')
      try {
        const result = await data.loadHomeData({ loadCycleId: cycle.loadCycleId, viewRevision: revision, trigger: 'initial' })
        return acceptDataResult(cycle, result)
      } catch { return acceptDataResult(cycle, { loadCycleId: cycle.loadCycleId, viewRevision: revision, status: 'error' }) }
    })()
    return startPromise
  }

  async function activateHome({ flowScopeId, reason } = {}) {
    if (!checkScope(flowScopeId) || !ACTIVATE_REASONS.has(reason)) return makeResult(flowScopeId, null, 'error', resultError('INVALID_ACTIVATION'))
    return runLoad({ trigger: 'return', intermediateStatus: 'loading' })
  }

  function operationValid(operation) {
    if (!operation || typeof operation !== 'object' || Object.keys(operation).some((key) => !['requestId', 'type', 'viewMode', 'data'].includes(key)) || !validId(operation.requestId) || !OPERATION_TYPES.has(operation.type)) return false
    if (operation.viewMode !== undefined && (typeof operation.viewMode !== 'string' || operation.viewMode.length === 0)) return false
    if (handledOperations.has(operation.requestId)) return 'duplicate'
    if (operation.type === 'refresh' || operation.type === 'refresh_credit') return !Object.hasOwn(operation, 'data')
    const dataValue = operation.data
    if (operation.type === 'select_amount') return !!dataValue && typeof dataValue.amountKey === 'string' && Object.keys(dataValue).length === 1
    if (operation.type === 'select_term') return !!dataValue && typeof dataValue.termKey === 'string' && Object.keys(dataValue).length === 1
    if (operation.type === 'toggle_product_selection') return !!dataValue && typeof dataValue.productId === 'string' && typeof dataValue.selected === 'boolean' && Object.keys(dataValue).length === 2
    if (operation.type === 'submit_selected_products') return !!dataValue && Array.isArray(dataValue.productIds) && dataValue.productIds.every((value) => typeof value === 'string' && value.length > 0) && new Set(dataValue.productIds).size === dataValue.productIds.length && Object.keys(dataValue).length === 1
    if (operation.type === 'select_tab') return !!dataValue && typeof dataValue.tabKey === 'string' && Object.keys(dataValue).length === 1
    if (operation.type === 'primary_action') return dataValue === undefined || (dataValue && Object.keys(dataValue).length > 0 && Object.keys(dataValue).every((key) => (key === 'amountKey' || key === 'termKey') && typeof dataValue[key] === 'string' && dataValue[key].length > 0))
    return false
  }
  function optionAvailable(kind, key) {
    const selection = state.viewPayload?.viewData?.productSelection
    const optionsList = kind === 'amount' ? selection?.amountOptions : selection?.termOptions
    return Array.isArray(optionsList) && optionsList.some((item) => item?.key === key && item.disabled !== true)
  }
  function currentProducts() { return state.viewPayload?.multiPushViewData?.products ?? [] }
  function isCashPrimaryActionEligible(snapshot) {
    return snapshot?.mode === 'cash_loan'
      && snapshot.stage !== 'application_unavailable'
      && snapshot.stage !== 'rejected'
      && snapshot.orderStatus !== 40
  }
  function operationAllowed(operation) {
    const payload = state.viewPayload
    const snapshot = state.snapshot
    if (operation.type === 'refresh') {
      return Boolean(payload)
        && ['content', 'error', 'loading'].includes(payload.pageStatus)
        && ['ready', 'business_failure', 'error'].includes(state.flowStatus)
    }
    if (!payload || payload.pageStatus !== 'content' || !snapshot) return false
    if (operation.type === 'refresh_credit') return state.flowStatus === 'ready'
    if (operation.type === 'select_amount') return snapshot.mode === 'cash_loan' && optionAvailable('amount', operation.data.amountKey)
    if (operation.type === 'select_term') return snapshot.mode === 'cash_loan' && optionAvailable('term', operation.data.termKey)
    if (operation.type === 'toggle_product_selection') {
      const product = currentProducts().find((item) => item.productId === operation.data.productId || item.id === operation.data.productId)
      if (!product?.selectable) return false
      if (operation.data.selected === false) {
        const selected = currentProducts().filter((item) => item.selectable && item.selected).length
        return selected - 1 >= (snapshot.minimumSelectionCount ?? 1)
      }
      return product.selected !== true
    }
    if (operation.type === 'submit_selected_products') {
      const selected = currentProducts().filter((item) => item.selectable && item.selected).map((item) => item.productId ?? item.id)
      return selected.length >= (snapshot.minimumSelectionCount ?? 1) && JSON.stringify(selected) === JSON.stringify(operation.data.productIds)
    }
    if (operation.type === 'select_tab') {
      const tab = (payload.tabs ?? []).find((item) => item.key === operation.data.tabKey)
      return !!tab?.enabled && !tab.active
    }
    if (operation.type === 'primary_action') {
      const action = payload.homeMode === 'multi_push' ? payload.multiPushViewData?.primaryAction : payload.viewData?.primaryAction
      if (!action || action.enabled !== true || action.loading === true) return false
      if (payload.homeMode === 'cash_loan') {
        const selection = payload.viewData?.productSelection
        if (selection && operation.data && ((operation.data.amountKey !== undefined && operation.data.amountKey !== selection.selectedAmountKey) || (operation.data.termKey !== undefined && operation.data.termKey !== selection.selectedTermKey))) return false
      }
      const effect = snapshot.primaryActionEffect
      if (!EFFECTS.has(effect)) return !effect && isCashPrimaryActionEligible(snapshot)
      if (effect === 'show_empty_products_toast') return snapshot.mode === 'multi_push' && (snapshot.products?.length ?? 0) === 0
      if (effect === 'show_overlay_notice') return snapshot.mode === 'cash_loan' && ['application_unavailable', 'rejected'].includes(snapshot.stage)
      if (effect === 'navigate_repayment_list') return snapshot.mode === 'multi_push' && snapshot.variant === 'active_only'
      if (effect === 'navigate_order_list') return snapshot.mode === 'multi_push' && snapshot.variant === 'processing_only'
      if (effect === 'apply_order') return snapshot.mode === 'multi_push' && (snapshot.selectedProductCount ?? 0) >= (snapshot.minimumSelectionCount ?? 1)
      return false
    }
    return false
  }
  function emitSelection(operation) {
    const payload = safeClone(state.viewPayload)
    if (operation.type === 'select_amount') payload.viewData.productSelection.selectedAmountKey = operation.data.amountKey
    if (operation.type === 'select_term') payload.viewData.productSelection.selectedTermKey = operation.data.termKey
    if (operation.type === 'toggle_product_selection') {
      const product = payload.multiPushViewData.products.find((item) => (item.productId ?? item.id) === operation.data.productId)
      product.selected = operation.data.selected
      const selectedProducts = payload.multiPushViewData.products.filter((item) => item.selectable && item.selected)
      const amounts = selectedProducts.map((item) => state.snapshot?.products?.find((candidate) => candidate.productId === (item.productId ?? item.id))?.minimumAmount).filter((value) => typeof value === 'string')
      if (payload.multiPushViewData.creditSummary && amounts.length === selectedProducts.length) {
        payload.multiPushViewData.creditSummary.availableText = sumDecimalStrings(amounts)
      }
    }
    payload.requestId = allocate('view')
    payload.revision = nextViewRevision()
    payload.sourceOperationId = operation.requestId
    const nextSnapshot = state.snapshot ? safeClone(state.snapshot) : null
    if (nextSnapshot && operation.type === 'select_amount') nextSnapshot.selectedAmountKey = operation.data.amountKey
    if (nextSnapshot && operation.type === 'select_term') nextSnapshot.selectedTermKey = operation.data.termKey
    if (nextSnapshot && operation.type === 'toggle_product_selection') {
      nextSnapshot.selectedProductCount = payload.multiPushViewData.products.filter((item) => item.selectable && item.selected).length
      if (Array.isArray(nextSnapshot.products)) nextSnapshot.products = nextSnapshot.products.map((item) => item.productId === operation.data.productId ? { ...item, selected: operation.data.selected } : item)
    }
    state = { ...state, viewPayload: payload, snapshot: nextSnapshot, snapshotRevision: state.snapshotRevision + 1 }
    sendPayload(payload)
    notify()
  }
  async function primaryAction(operation) {
    const snapshotRevision = state.snapshotRevision
    state = { ...state, operationId: operation.requestId, flowStatus: 'permission_pending' }
    activeOperation = { operationId: operation.requestId, snapshotRevision }
    const permission = await Promise.race([
      call('requestHomePermissions', { operationId: operation.requestId }),
      new Promise((resolve) => { if (activeOperation?.operationId === operation.requestId) activeOperation.cancelResolve = resolve }),
    ])
    if (!activeOperation || activeOperation.operationId !== operation.requestId || activeOperation.snapshotRevision !== state.snapshotRevision || state.disposed || (permission?.operationId && permission.operationId !== operation.requestId)) return { operationId: operation.requestId, status: 'canceled' }
    if (permission?.status !== 'granted') { activeOperation = null; setStatus('ready', { operationId: null }); return { operationId: operation.requestId, status: permission?.status === 'canceled' ? 'canceled' : 'failed', error: resultError(permission?.errorCode ?? 'PERMISSION_FAILED') } }
    const effect = state.snapshot?.primaryActionEffect
    if (effect === 'show_empty_products_toast' || effect === 'show_overlay_notice') {
      const messageId = effect === 'show_empty_products_toast' ? '10' : '20'
      const text = getMessage(messageId)
      if (typeof text !== 'string' || text.trim().length === 0) { activeOperation = null; setStatus('ready', { operationId: null }); return { operationId: operation.requestId, status: 'failed', error: resultError('MESSAGE_UNAVAILABLE') } }
      const payload = safeClone(state.viewPayload); const noticeId = allocate('notice')
      payload.requestId = allocate('view'); payload.revision = nextViewRevision(); payload[effect === 'show_empty_products_toast' ? 'toastNotice' : 'overlayNotice'] = { noticeId, text }
      payload.sourceOperationId = operation.requestId; state = { ...state, viewPayload: payload, operationId: null, flowStatus: 'ready' }; sendPayload(payload); notify(); activeOperation = null
      return { operationId: operation.requestId, status: 'completed', effect }
    }
    if (effect === 'navigate_repayment_list' || effect === 'navigate_order_list') {
      const target = effect === 'navigate_repayment_list' ? 'repayment_list' : 'order_list'; const intent = { intentId: allocate('intent'), sourceOperationId: operation.requestId, target }
      emitHomeRouteIntent(intent, { snapshot: state.snapshot, currentSnapshotRevision: state.snapshotRevision, permissionResult: permission }); activeOperation = null; setStatus('ready', { operationId: null }); return { operationId: operation.requestId, status: 'completed', effect: intent }
    }
    if ((effect === null || effect === undefined) && isCashPrimaryActionEligible(state.snapshot)) {
      const intent = {
        intentId: allocate('intent'),
        sourceOperationId: operation.requestId,
        target: 'cash_loan_primary_action',
        snapshotRevision,
      }
      emitHomeRouteIntent(intent, { snapshot: state.snapshot, currentSnapshotRevision: state.snapshotRevision, permissionResult: permission })
      activeOperation = null
      setStatus('ready', { operationId: null })
      return { operationId: operation.requestId, status: 'completed', effect: intent }
    }
    setStatus('native_processing')
    const native = await Promise.race([
      call('executeNativeDataPlan', { operationId: operation.requestId, homeMode: state.snapshot?.mode }),
      new Promise((resolve) => { if (activeOperation?.operationId === operation.requestId) activeOperation.cancelResolve = resolve }),
    ])
    if (!activeOperation || activeOperation.operationId !== operation.requestId || activeOperation.snapshotRevision !== state.snapshotRevision || state.disposed || (native?.operationId && native.operationId !== operation.requestId)) return { operationId: operation.requestId, status: 'canceled' }
    activeOperation = null; setStatus('ready', { operationId: null })
    if (native?.status === 'trigger_dispatched' || native?.status === 'collected') return { operationId: operation.requestId, status: 'completed', effect: native.status }
    return { operationId: operation.requestId, status: native?.status === 'canceled' ? 'canceled' : 'failed', error: resultError(native?.errorCode ?? 'NATIVE_FAILED') }
  }

  async function handleHomeOperation({ flowScopeId, operation } = {}) {
    if (!checkScope(flowScopeId) || state.disposed) return { operationId: operation?.requestId ?? null, status: 'failed', error: resultError('INVALID_SCOPE') }
    const validity = operationValid(operation)
    if (validity === 'duplicate') return { operationId: operation.requestId, status: 'ignored' }
    if (!validity || !operationAllowed(operation)) return { operationId: operation?.requestId ?? null, status: 'failed', error: resultError('OPERATION_NOT_AVAILABLE') }
    handledOperations.add(operation.requestId)
    if (operation.type === 'refresh' || operation.type === 'refresh_credit') {
      cancelOperation()
      const result = await runLoad({ trigger: operation.type, sourceOperationId: operation.requestId, intermediateStatus: 'refreshing' })
      return { operationId: operation.requestId, status: result.status === 'canceled' ? 'canceled' : result.status === 'ready' || result.status === 'business_failure' || result.status === 'handled' ? 'completed' : 'failed' }
    }
    if (operation.type === 'select_amount' || operation.type === 'select_term' || operation.type === 'toggle_product_selection') { cancelOperation(); emitSelection(operation); return { operationId: operation.requestId, status: 'completed' } }
    if (operation.type === 'submit_selected_products') return { operationId: operation.requestId, status: 'completed' }
    if (operation.type === 'select_tab') {
      const target = `${operation.data.tabKey}_tab`
      if (!TARGETS.has(target)) return { operationId: operation.requestId, status: 'failed', error: resultError('OPERATION_NOT_AVAILABLE') }
      const intent = { intentId: allocate('intent'), sourceOperationId: operation.requestId, target }
      emitHomeRouteIntent(intent, { snapshot: state.snapshot, currentSnapshotRevision: state.snapshotRevision })
      return { operationId: operation.requestId, status: 'completed', effect: intent }
    }
    cancelOperation()
    return primaryAction(operation)
  }

  function disposeHomeFlow({ flowScopeId } = {}) {
    if (state.disposed || state.flowScopeId !== flowScopeId) return
    state = { ...state, disposed: true, flowStatus: 'disposed' }
    cancelLoad(); cancelOperation()
    if (loadingShown) { const id = loadingShown; loadingShown = null; void call('hideHomeHostLoading', { loadingCycleId: id }) }
    if (state.initCycleId) void call('disposeHomeHostInit', { initCycleId: state.initCycleId })
    state = { ...state, viewPayload: null, snapshot: null }
    listeners.clear()
  }
  function subscribe(listener) { if (typeof listener !== 'function') throw new TypeError('listener must be a function'); listeners.add(listener); return () => listeners.delete(listener) }

  return Object.freeze({ getState, subscribe, startHomeFlow, activateHome, handleHomeOperation, disposeHomeFlow, nextViewRevision })
}

export { FLOW_STATES }
