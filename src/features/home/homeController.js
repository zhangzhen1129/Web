import { BROADCAST_INTERVAL_MS, HOME_MODE, OPERATION_TYPE, PAGE_STATUS } from './constants.js'
import { assertPageLoadingPort, createNoopPageLoadingAdapter } from './pageLoadingPort.js'
import { cloneValue, validateHomeOperation, validateHomeViewPayload } from './validation.js'

const defaultClock = Object.freeze({
  setInterval(callback, delay) {
    return setInterval(callback, delay)
  },
  clearInterval(timerId) {
    clearInterval(timerId)
  },
})

let controllerSequence = 0

function createDefaultRequestIdFactory() {
  const controllerId = `${Date.now().toString(36)}-${(controllerSequence += 1).toString(36)}`
  let operationSequence = 0
  return () => `home-${controllerId}-${(operationSequence += 1).toString(36)}`
}

function createInitialState() {
  return {
    requestId: null,
    sourceOperationId: null,
    pageStatus: 'idle',
    viewMode: null,
    homeMode: null,
    viewData: null,
    multiPushViewData: null,
    errorData: null,
    overlayNotice: null,
    toastNotice: null,
    diagnosticCode: null,
    broadcastIndex: 0,
    isRefreshPending: false,
    isCreditRefreshPending: false,
    isVisible: true,
    isDestroyed: false,
  }
}

  function createDiagnostic(code, issues = []) {
  return Object.freeze({ code, issues: issues.map((issue) => ({ ...issue })) })
}

export function createHomeController(options = {}) {
  const loadingPort = assertPageLoadingPort(options.loadingPort ?? createNoopPageLoadingAdapter())
  const onOperation = typeof options.onOperation === 'function' ? options.onOperation : null
  const onDiagnostic = typeof options.onDiagnostic === 'function' ? options.onDiagnostic : () => {}
  const createRequestId = options.createRequestId ?? createDefaultRequestIdFactory()
  const clock = options.clock ?? defaultClock
  const broadcastIntervalMs = options.broadcastIntervalMs ?? BROADCAST_INTERVAL_MS

  if (typeof createRequestId !== 'function') throw new TypeError('createRequestId must be a function')
  if (!clock || typeof clock.setInterval !== 'function' || typeof clock.clearInterval !== 'function') {
    throw new TypeError('clock must provide setInterval() and clearInterval() methods')
  }

  function getMultiPushViewMode(viewData) {
    if (!viewData) return null
    if (viewData.primaryAction === 'apply') return 'available_and_active'
    if (viewData.primaryAction === 'repay') return 'active_only'
    if (viewData.primaryAction === 'processing') return 'processing_only'
    return null
  }

  let state = createInitialState()
  let lastViewMode = null
  let activeLoadingRequestId = null
  let refreshOperationId = null
  let creditRefreshOperationId = null
  let broadcastTimerId = null
  const listeners = new Set()
  const modelRequestIds = new Set()
  const operationRequestIds = new Set()
  const pendingOperationIds = new Set()

  function getState() {
    return cloneValue(state)
  }

  function notify() {
    const snapshot = getState()
    listeners.forEach((listener) => listener(snapshot))
  }

  function report(code, issues) {
    onDiagnostic(createDiagnostic(code, issues))
  }

  function stopBroadcast() {
    if (broadcastTimerId === null) return
    clock.clearInterval(broadcastTimerId)
    broadcastTimerId = null
  }

  function getBroadcastItems() {
    if (state.pageStatus !== PAGE_STATUS.CONTENT && state.pageStatus !== PAGE_STATUS.REFRESHING) return []
    return state.homeMode === HOME_MODE.MULTI_PUSH
      ? state.multiPushViewData?.broadcast?.items ?? []
      : state.viewData?.broadcast?.items ?? []
  }

  function startBroadcast() {
    stopBroadcast()
    const items = getBroadcastItems()
    if (!state.isVisible || state.isDestroyed || items.length < 2) return
    broadcastTimerId = clock.setInterval(() => {
      const currentItems = getBroadcastItems()
      if (currentItems.length < 2) {
        stopBroadcast()
        return
      }
      state = { ...state, broadcastIndex: (state.broadcastIndex + 1) % currentItems.length }
      notify()
    }, broadcastIntervalMs)
  }

  function showLoading(requestId) {
    if (!state.isVisible || activeLoadingRequestId !== null) return
    loadingPort.show(requestId)
    activeLoadingRequestId = requestId
  }

  function hideLoading() {
    if (activeLoadingRequestId === null) return
    const requestId = activeLoadingRequestId
    activeLoadingRequestId = null
    loadingPort.hide(requestId)
  }

  function enterInvalidModelState(issues, requestId = state.requestId ?? `invalid-${Date.now()}`) {
    if (activeLoadingRequestId === null) showLoading(requestId)
    stopBroadcast()
    state = {
      ...state,
      requestId: null,
      sourceOperationId: null,
      pageStatus: PAGE_STATUS.ERROR,
      viewMode: lastViewMode,
      viewData: null,
      homeMode: null,
      multiPushViewData: null,
      errorData: null,
      overlayNotice: null,
      toastNotice: null,
      diagnosticCode: 'INVALID_HOME_VIEW',
      broadcastIndex: 0,
    }
    report('INVALID_HOME_VIEW', issues)
    notify()
  }

  function settlePendingOperations(payload) {
    const isTerminal = payload.pageStatus === PAGE_STATUS.CONTENT || payload.pageStatus === PAGE_STATUS.ERROR
    if (payload.sourceOperationId && isTerminal) pendingOperationIds.delete(payload.sourceOperationId)
    if (payload.sourceOperationId === refreshOperationId && isTerminal) refreshOperationId = null
    if (payload.sourceOperationId === creditRefreshOperationId && isTerminal) creditRefreshOperationId = null
  }

  function updateHomeView(payload) {
    if (state.isDestroyed) {
      report('CONTROLLER_DESTROYED')
      return
    }

    const issues = validateHomeViewPayload(payload)
    if (issues.length === 0 && modelRequestIds.has(payload.requestId)) {
      issues.push({ path: 'payload.requestId', code: 'duplicate_request_id' })
    }
    if (issues.length > 0) {
      enterInvalidModelState(issues, payload?.requestId)
      return
    }

    if (payload.sourceOperationId && !pendingOperationIds.has(payload.sourceOperationId)) {
      report('STALE_HOME_VIEW', [{ path: 'payload.sourceOperationId', code: 'operation_not_pending' }])
      return
    }

    modelRequestIds.add(payload.requestId)
    settlePendingOperations(payload)
    if (payload.viewMode) lastViewMode = payload.viewMode
    if (payload.multiPushViewData) lastViewMode = getMultiPushViewMode(payload.multiPushViewData)

    if (payload.pageStatus === PAGE_STATUS.LOADING || payload.pageStatus === PAGE_STATUS.ERROR) showLoading(payload.requestId)
    else hideLoading()

    state = {
      ...state,
      requestId: payload.requestId,
      sourceOperationId: payload.sourceOperationId ?? null,
      pageStatus: payload.pageStatus,
      viewMode: payload.viewMode ?? lastViewMode,
      homeMode: payload.homeMode ?? state.homeMode ?? (payload.multiPushViewData ? HOME_MODE.MULTI_PUSH : HOME_MODE.CASH_LOAN),
      viewData: payload.viewData ? cloneValue(payload.viewData) : null,
      multiPushViewData: payload.multiPushViewData ? cloneValue(payload.multiPushViewData) : null,
      errorData: payload.errorData ? cloneValue(payload.errorData) : null,
      overlayNotice: payload.overlayNotice ? cloneValue(payload.overlayNotice) : null,
      toastNotice: payload.toastNotice ? cloneValue(payload.toastNotice) : null,
      diagnosticCode: null,
      broadcastIndex: 0,
      isRefreshPending: refreshOperationId !== null,
      isCreditRefreshPending: creditRefreshOperationId !== null,
    }
    startBroadcast()
    notify()
  }

  function optionIsEnabled(groupName, key) {
    const selection = state.viewData?.productSelection
    const optionsList = groupName === 'amount' ? selection?.amountOptions : selection?.termOptions
    return Array.isArray(optionsList) && optionsList.some((option) => option.key === key && !option.disabled)
  }

  function operationMatchesCurrentState(operation) {
    if (operation.viewMode !== lastViewMode) return false
    if (operation.type === OPERATION_TYPE.SELECT_AMOUNT) return optionIsEnabled('amount', operation.data.amountKey)
    if (operation.type === OPERATION_TYPE.SELECT_TERM) return optionIsEnabled('term', operation.data.termKey)
    if (operation.type === OPERATION_TYPE.PRIMARY_ACTION) {
      const action = state.homeMode === HOME_MODE.MULTI_PUSH
        ? { enabled: state.multiPushViewData?.primaryAction !== 'processing', loading: false }
        : state.viewData?.primaryAction
      if (!action?.enabled || action.loading) return false
      if (state.homeMode === HOME_MODE.MULTI_PUSH) return operation.data === undefined
      const selection = state.viewData?.productSelection
      if (!selection) return operation.data === undefined
      return operation.data?.amountKey === selection.selectedAmountKey
        && operation.data?.termKey === selection.selectedTermKey
    }
    if (operation.type === OPERATION_TYPE.TOGGLE_PRODUCT_SELECTION) {
      if (state.homeMode !== 'multi_push') return false
      const product = state.multiPushViewData?.products?.find((item) => item.id === operation.data.productId)
      if (!product?.selectable) return false
      if (operation.data.selected === false) {
        const selectedCount = state.multiPushViewData.products.filter((item) => item.selectable && item.selected).length
        return selectedCount > (state.multiPushViewData.minimumSelectionCount ?? 1)
      }
      return product.selected !== true
    }
    if (operation.type === OPERATION_TYPE.SUBMIT_SELECTED_PRODUCTS) {
      if (state.homeMode !== 'multi_push') return false
      const products = state.multiPushViewData?.products ?? []
      const selectedIds = products.filter((item) => item.selectable && item.selected).map((item) => item.id)
      return selectedIds.length >= (state.multiPushViewData?.minimumSelectionCount ?? 1)
        && JSON.stringify(selectedIds) === JSON.stringify(operation.data.productIds)
    }
    if (operation.type === OPERATION_TYPE.REFRESH) return state.pageStatus === PAGE_STATUS.CONTENT
    if (operation.type === OPERATION_TYPE.REFRESH_CREDIT) {
      const multiPushAvailable = state.homeMode === HOME_MODE.MULTI_PUSH
        && state.multiPushViewData?.refreshEnabled === true
        && state.multiPushViewData?.locked !== true
      const cashLoanSummary = state.homeMode === HOME_MODE.CASH_LOAN
        && state.viewData?.creditSummary?.refreshEnabled === true
        && state.viewData.creditSummary.locked !== true
      return state.pageStatus === PAGE_STATUS.CONTENT && (multiPushAvailable || cashLoanSummary)
    }
    return false
  }

  function emitHomeOperation(operation) {
    if (state.isDestroyed) {
      report('CONTROLLER_DESTROYED')
      return
    }

    const issues = validateHomeOperation(operation)
    if (issues.length === 0 && operationRequestIds.has(operation.requestId)) {
      issues.push({ path: 'operation.requestId', code: 'duplicate_request_id' })
    }
    if (issues.length === 0 && !operationMatchesCurrentState(operation)) {
      issues.push({ path: 'operation', code: 'operation_not_available' })
    }
    if (issues.length > 0) {
      report('INVALID_HOME_OPERATION', issues)
      return
    }

    if (operation.type === OPERATION_TYPE.REFRESH && refreshOperationId !== null) return
    if (operation.type === OPERATION_TYPE.REFRESH_CREDIT && creditRefreshOperationId !== null) return

    operationRequestIds.add(operation.requestId)
    pendingOperationIds.add(operation.requestId)
    if (operation.type === OPERATION_TYPE.REFRESH) refreshOperationId = operation.requestId
    if (operation.type === OPERATION_TYPE.REFRESH_CREDIT) creditRefreshOperationId = operation.requestId
    state = {
      ...state,
      isRefreshPending: refreshOperationId !== null,
      isCreditRefreshPending: creditRefreshOperationId !== null,
    }
    notify()

    if (onOperation) onOperation(cloneValue(operation))
    else report('HOME_OPERATION_RECEIVER_MISSING')
  }

  function makeOperation(type, data) {
    const operation = { requestId: createRequestId(), type, viewMode: lastViewMode }
    if (data !== undefined) operation.data = data
    emitHomeOperation(operation)
    return operation.requestId
  }

  function refresh() {
    return makeOperation(OPERATION_TYPE.REFRESH)
  }

  function refreshCredit() {
    return makeOperation(OPERATION_TYPE.REFRESH_CREDIT)
  }

  function primaryAction() {
    const selection = state.viewData?.productSelection
    const data = selection
      ? { amountKey: selection.selectedAmountKey, termKey: selection.selectedTermKey }
      : undefined
    return makeOperation(OPERATION_TYPE.PRIMARY_ACTION, data)
  }

  function selectAmount(amountKey) {
    return makeOperation(OPERATION_TYPE.SELECT_AMOUNT, { amountKey })
  }

  function selectTerm(termKey) {
    return makeOperation(OPERATION_TYPE.SELECT_TERM, { termKey })
  }

  function toggleProductSelection(productId, selected) {
    return makeOperation(OPERATION_TYPE.TOGGLE_PRODUCT_SELECTION, { productId, selected })
  }

  function submitSelectedProducts(productIds) {
    const uniqueIds = Array.isArray(productIds) ? [...new Set(productIds)] : productIds
    return makeOperation(OPERATION_TYPE.SUBMIT_SELECTED_PRODUCTS, { productIds: uniqueIds })
  }

  function selectAdjacentAmount(direction) {
    if (direction !== 'previous' && direction !== 'next') {
      report('INVALID_AMOUNT_DIRECTION', [{ path: 'direction', code: 'invalid_enum' }])
      return
    }
    const selection = state.viewData?.productSelection
    if (!selection) return
    const currentIndex = selection.amountOptions.findIndex((option) => option.key === selection.selectedAmountKey)
    const step = direction === 'previous' ? -1 : 1
    for (let index = currentIndex + step; index >= 0 && index < selection.amountOptions.length; index += step) {
      if (!selection.amountOptions[index].disabled) {
        return selectAmount(selection.amountOptions[index].key)
      }
    }
  }

  function hide() {
    if (state.isDestroyed || !state.isVisible) return
    hideLoading()
    stopBroadcast()
    refreshOperationId = null
    creditRefreshOperationId = null
    pendingOperationIds.clear()
    state = { ...state, isVisible: false, overlayNotice: null, toastNotice: null, isRefreshPending: false, isCreditRefreshPending: false }
    notify()
  }

  function show() {
    if (state.isDestroyed || state.isVisible) return
    state = { ...state, isVisible: true }
    if (state.pageStatus === PAGE_STATUS.LOADING && state.requestId) showLoading(state.requestId)
    startBroadcast()
    notify()
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function')
    if (state.isDestroyed) return () => {}
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function destroy() {
    if (state.isDestroyed) return
    hideLoading()
    stopBroadcast()
    refreshOperationId = null
    creditRefreshOperationId = null
    pendingOperationIds.clear()
    state = {
      ...state,
      isVisible: false,
      isDestroyed: true,
      overlayNotice: null,
      toastNotice: null,
      isRefreshPending: false,
      isCreditRefreshPending: false,
    }
    listeners.clear()
  }

  return Object.freeze({
    getState,
    subscribe,
    updateHomeView,
    emitHomeOperation,
    refresh,
    refreshCredit,
    primaryAction,
    selectAmount,
    selectTerm,
    toggleProductSelection,
    submitSelectedProducts,
    selectAdjacentAmount,
    hide,
    show,
    destroy,
  })
}
