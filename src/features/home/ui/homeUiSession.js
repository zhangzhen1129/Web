import {
  HOME_MODE,
  HOME_OPERATION_TYPE,
  HOME_PAGE_STATUS,
  MULTI_PUSH_VARIANT,
  cloneHomeValue,
  validateHomeOperation,
  validateHomeViewPayload,
} from './homeUiContract.js'

const BROADCAST_INTERVAL_MS = 2000

const defaultClock = Object.freeze({
  setInterval(callback, delay) {
    return window.setInterval(callback, delay)
  },
  clearInterval(timerId) {
    window.clearInterval(timerId)
  },
})

let instanceSequence = 0

function createRequestIdFactory() {
  const instanceId = `${Date.now().toString(36)}-${(instanceSequence += 1).toString(36)}`
  let sequence = 0
  return () => `home-${instanceId}-${(sequence += 1).toString(36)}`
}

function createInitialState() {
  return {
    requestId: null,
    revision: -1,
    sourceOperationId: null,
    pageStatus: HOME_PAGE_STATUS.LOADING,
    homeMode: null,
    viewMode: null,
    viewData: null,
    multiPushViewData: null,
    tabs: [],
    errorData: null,
    toastNotice: null,
    overlayNotice: null,
    overlayVisible: false,
    dialogOpen: false,
    broadcastIndex: 0,
    pendingOperationType: null,
    isVisible: true,
    isDestroyed: false,
  }
}

function operationSignature(type, data) {
  return JSON.stringify([type, data ?? null])
}

function getProducts(state) {
  return state.multiPushViewData?.products ?? []
}

function getPrimaryAction(state) {
  return state.homeMode === HOME_MODE.MULTI_PUSH
    ? state.multiPushViewData?.primaryAction
    : state.viewData?.primaryAction
}

function getCreditSummary(state) {
  return state.homeMode === HOME_MODE.MULTI_PUSH
    ? state.multiPushViewData?.creditSummary
    : state.viewData?.creditSummary
}

export function createHomeUiSession(options = {}) {
  const onOperation = typeof options.onOperation === 'function' ? options.onOperation : null
  const onDiagnostic = typeof options.onDiagnostic === 'function' ? options.onDiagnostic : () => {}
  const createRequestId = options.createRequestId ?? createRequestIdFactory()
  const clock = options.clock ?? defaultClock
  const broadcastIntervalMs = options.broadcastIntervalMs ?? BROADCAST_INTERVAL_MS
  if (typeof createRequestId !== 'function') throw new TypeError('createRequestId must be a function')
  if (!clock || typeof clock.setInterval !== 'function' || typeof clock.clearInterval !== 'function') {
    throw new TypeError('clock must provide timer methods')
  }

  let state = createInitialState()
  let hasAcceptedModel = false
  let broadcastTimerId = null
  let pendingOperation = null
  const listeners = new Set()
  const modelRequestIds = new Set()
  const operationRequestIds = new Set()
  const knownProductIds = new Set()

  function getState() {
    return cloneHomeValue(state)
  }

  function notify() {
    const snapshot = getState()
    listeners.forEach((listener) => listener(snapshot))
  }

  function report(code, issues = []) {
    onDiagnostic({ code, issues: cloneHomeValue(issues) })
  }

  function stopBroadcast() {
    if (broadcastTimerId === null) return
    clock.clearInterval(broadcastTimerId)
    broadcastTimerId = null
  }

  function broadcastItems() {
    if (![HOME_PAGE_STATUS.CONTENT, HOME_PAGE_STATUS.REFRESHING].includes(state.pageStatus)) return []
    const data = state.homeMode === HOME_MODE.MULTI_PUSH ? state.multiPushViewData : state.viewData
    return data?.broadcast?.items ?? []
  }

  function startBroadcast() {
    stopBroadcast()
    const items = broadcastItems()
    if (!state.isVisible || state.isDestroyed || items.length < 2) return
    broadcastTimerId = clock.setInterval(() => {
      const currentItems = broadcastItems()
      if (currentItems.length < 2 || !state.isVisible || state.isDestroyed) {
        stopBroadcast()
        return
      }
      state = { ...state, broadcastIndex: (state.broadcastIndex + 1) % currentItems.length }
      notify()
    }, broadcastIntervalMs)
  }

  function validateSessionModel(payload) {
    const issues = validateHomeViewPayload(payload)
    if (issues.length > 0) return issues
    if (modelRequestIds.has(payload.requestId)) issues.push({ path: 'payload.requestId', code: 'duplicate_request_id' })
    if (payload.revision <= state.revision) issues.push({ path: 'payload.revision', code: 'stale_revision' })
    if (pendingOperation && !payload.sourceOperationId) {
      issues.push({ path: 'payload.sourceOperationId', code: 'required_source_operation' })
    } else if (payload.sourceOperationId && payload.sourceOperationId !== pendingOperation?.requestId) {
      issues.push({ path: 'payload.sourceOperationId', code: 'operation_not_pending' })
    }
    const products = payload.multiPushViewData?.products ?? []
    products.forEach((product, index) => {
      if (!knownProductIds.has(product.productId) && product.selectable && !product.selected) {
        issues.push({ path: `payload.multiPushViewData.products[${index}].selected`, code: 'first_selectable_product_not_selected' })
      }
    })
    return issues
  }

  function updateHomeView(payload) {
    if (state.isDestroyed) {
      report('HOME_UI_DESTROYED')
      return false
    }
    const issues = validateSessionModel(payload)
    if (issues.length > 0) {
      report('INVALID_HOME_VIEW', issues)
      return false
    }

    const isAssociatedRefresh = payload.sourceOperationId === pendingOperation?.requestId
      && [HOME_OPERATION_TYPE.REFRESH, HOME_OPERATION_TYPE.REFRESH_CREDIT].includes(pendingOperation?.type)
    const keepsRefreshOperation = isAssociatedRefresh
      && (
        payload.pageStatus === HOME_PAGE_STATUS.REFRESHING
        || (payload.pageStatus === HOME_PAGE_STATUS.LOADING && !payload.toastNotice && state.pageStatus !== HOME_PAGE_STATUS.LOADING)
      )

    modelRequestIds.add(payload.requestId)
    payload.multiPushViewData?.products?.forEach((product) => knownProductIds.add(product.productId))
    if (payload.sourceOperationId && !keepsRefreshOperation) pendingOperation = null
    hasAcceptedModel = true
    const nextHomeMode = payload.homeMode ?? state.homeMode
    const nextViewMode = payload.viewMode ?? state.viewMode
    const products = payload.multiPushViewData?.products ?? []
    state = {
      ...state,
      requestId: payload.requestId,
      revision: payload.revision,
      sourceOperationId: payload.sourceOperationId ?? null,
      pageStatus: payload.pageStatus,
      homeMode: nextHomeMode,
      viewMode: nextViewMode,
      viewData: payload.viewData ? cloneHomeValue(payload.viewData) : null,
      multiPushViewData: payload.multiPushViewData ? cloneHomeValue(payload.multiPushViewData) : null,
      tabs: cloneHomeValue(payload.tabs),
      errorData: payload.errorData ? cloneHomeValue(payload.errorData) : null,
      toastNotice: payload.toastNotice ? cloneHomeValue(payload.toastNotice) : null,
      overlayNotice: payload.overlayNotice ? cloneHomeValue(payload.overlayNotice) : null,
      overlayVisible: Boolean(payload.overlayNotice),
      dialogOpen: state.dialogOpen && products.length > 0,
      broadcastIndex: 0,
      pendingOperationType: keepsRefreshOperation ? pendingOperation.type : null,
    }
    startBroadcast()
    notify()
    return true
  }

  function nextOperationId() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const requestId = createRequestId()
      if (/^[A-Za-z0-9_-]{1,64}$/.test(requestId) && !operationRequestIds.has(requestId)) return requestId
    }
    report('INVALID_OPERATION_ID_FACTORY')
    return null
  }

  function emitOperation(type, data, applyLocalState) {
    if (state.isDestroyed) {
      report('HOME_UI_DESTROYED')
      return null
    }
    const signature = operationSignature(type, data)
    if (pendingOperation?.signature === signature) return null
    const requestId = nextOperationId()
    if (!requestId) return null
    const operation = { requestId, type }
    if (data !== undefined) operation.data = data
    const issues = validateHomeOperation(operation)
    if (issues.length > 0) {
      report('INVALID_HOME_OPERATION', issues)
      return null
    }
    pendingOperation = { requestId, type, signature }
    operationRequestIds.add(requestId)
    if (typeof applyLocalState === 'function') applyLocalState()
    state = { ...state, pendingOperationType: type }
    notify()
    if (onOperation) {
      try {
        onOperation(cloneHomeValue(operation))
      } catch {
        report('HOME_OPERATION_RECEIVER_FAILED')
      }
    } else report('HOME_OPERATION_RECEIVER_MISSING')
    return requestId
  }

  function refresh() {
    if (state.pageStatus === HOME_PAGE_STATUS.REFRESHING) return null
    return emitOperation(HOME_OPERATION_TYPE.REFRESH)
  }

  function refreshCredit() {
    const summary = getCreditSummary(state)
    if (state.pageStatus !== HOME_PAGE_STATUS.CONTENT || !summary?.refreshEnabled || summary.locked) return null
    return emitOperation(HOME_OPERATION_TYPE.REFRESH_CREDIT)
  }

  function selectOption(group, key) {
    const selection = state.viewData?.productSelection
    const options = group === 'amount' ? selection?.amountOptions : selection?.termOptions
    const selectedKey = group === 'amount' ? selection?.selectedAmountKey : selection?.selectedTermKey
    if (selectedKey === key) return null
    if (!Array.isArray(options) || !options.some((option) => option.key === key && !option.disabled)) return null
    const type = group === 'amount' ? HOME_OPERATION_TYPE.SELECT_AMOUNT : HOME_OPERATION_TYPE.SELECT_TERM
    const dataKey = group === 'amount' ? 'amountKey' : 'termKey'
    return emitOperation(type, { [dataKey]: key })
  }

  function selectAdjacentAmount(direction) {
    if (!['previous', 'next'].includes(direction)) return null
    const selection = state.viewData?.productSelection
    const options = selection?.amountOptions
    if (!Array.isArray(options)) return null
    const currentIndex = options.findIndex((option) => option.key === selection.selectedAmountKey)
    const step = direction === 'previous' ? -1 : 1
    for (let index = currentIndex + step; index >= 0 && index < options.length; index += step) {
      if (!options[index].disabled) return selectOption('amount', options[index].key)
    }
    return null
  }

  function primaryAction() {
    const action = getPrimaryAction(state)
    if (!action?.enabled || action.loading) return null
    const selection = state.viewData?.productSelection
    if (!selection) return emitOperation(HOME_OPERATION_TYPE.PRIMARY_ACTION)
    const data = {}
    if (selection.selectedAmountKey) data.amountKey = selection.selectedAmountKey
    if (selection.selectedTermKey) data.termKey = selection.selectedTermKey
    return emitOperation(HOME_OPERATION_TYPE.PRIMARY_ACTION, Object.keys(data).length ? data : undefined)
  }

  function toggleProductSelection(productId) {
    const products = getProducts(state)
    const productIndex = products.findIndex((product) => product.productId === productId)
    if (productIndex < 0 || !products[productIndex].selectable) return null
    const selected = !products[productIndex].selected
    const selectedCount = products.filter((product) => product.selected).length
    if (!selected && selectedCount <= 1) return null
    const nextProducts = products.map((product, index) => index === productIndex ? { ...product, selected } : product)
    return emitOperation(
      HOME_OPERATION_TYPE.TOGGLE_PRODUCT_SELECTION,
      { productId, selected },
      () => {
        state = {
          ...state,
          multiPushViewData: { ...state.multiPushViewData, products: nextProducts },
        }
      },
    )
  }

  function submitSelectedProducts() {
    const productIds = getProducts(state).filter((product) => product.selected).map((product) => product.productId)
    if (productIds.length < 1) return null
    return emitOperation(HOME_OPERATION_TYPE.SUBMIT_SELECTED_PRODUCTS, { productIds })
  }

  function selectTab(tabKey) {
    const tab = state.tabs.find((item) => item.key === tabKey)
    if (!tab?.enabled || tab.active) return null
    return emitOperation(HOME_OPERATION_TYPE.SELECT_TAB, { tabKey })
  }

  function openProductDialog() {
    if (getProducts(state).length < 1 || state.dialogOpen) return false
    state = { ...state, dialogOpen: true }
    notify()
    return true
  }

  function closeProductDialog() {
    if (!state.dialogOpen) return false
    state = { ...state, dialogOpen: false }
    notify()
    return true
  }

  function dismissOverlayNotice() {
    if (!state.overlayVisible) return false
    state = { ...state, overlayVisible: false }
    notify()
    return true
  }

  function hide() {
    if (state.isDestroyed || !state.isVisible) return
    stopBroadcast()
    pendingOperation = null
    state = {
      ...state,
      isVisible: false,
      dialogOpen: false,
      overlayVisible: false,
      pendingOperationType: null,
    }
    notify()
  }

  function show() {
    if (state.isDestroyed || state.isVisible) return
    state = { ...state, isVisible: true }
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
    stopBroadcast()
    pendingOperation = null
    state = {
      ...state,
      isVisible: false,
      isDestroyed: true,
      dialogOpen: false,
      overlayVisible: false,
      pendingOperationType: null,
    }
    listeners.clear()
  }

  function getSelectedCountText() {
    const template = state.multiPushViewData?.productSummary?.countTextTemplate
    if (typeof template !== 'string') return ''
    const count = getProducts(state).filter((product) => product.selected).length
    return template.replace('{count}', String(count))
  }

  function shouldShowProductSummary() {
    const data = state.multiPushViewData
    if (!data) return false
    return getProducts(state).length > 0 || data.variant === MULTI_PUSH_VARIANT.ACTIVE_ONLY
  }

  return Object.freeze({
    getState,
    subscribe,
    updateHomeView,
    refresh,
    refreshCredit,
    selectAmount: (key) => selectOption('amount', key),
    selectTerm: (key) => selectOption('term', key),
    selectAdjacentAmount,
    primaryAction,
    toggleProductSelection,
    submitSelectedProducts,
    selectTab,
    openProductDialog,
    closeProductDialog,
    dismissOverlayNotice,
    getSelectedCountText,
    shouldShowProductSummary,
    hide,
    show,
    destroy,
  })
}
