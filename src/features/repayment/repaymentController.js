import { isBusinessHandledError } from '../../shared/businessError/index.js'
import { REPAYMENT_ROOT_STATE } from './repaymentConstants.js'
import { REPAYMENT_TEXT } from './repaymentText.js'

function createInitialState() {
  return Object.freeze({
    rootState: REPAYMENT_ROOT_STATE.LOADING,
    orders: Object.freeze([]),
    errorMessage: '',
    navigationLocked: false,
    refreshing: false,
  })
}

export function createRepaymentController(options = {}) {
  const service = options.service
  const showNativeLoading = options.showNativeLoading
  const hideNativeLoading = options.hideNativeLoading
  const setRepaymentCount = options.setRepaymentCount
  const navigateOrderDetail = options.navigateOrderDetail
  const navigateHome = options.navigateHome
  const onBusinessFailure = options.onBusinessFailure ?? (() => {})
  const onRequestFailure = options.onRequestFailure ?? (() => {})
  const createAbortController = options.createAbortController ?? (() => new AbortController())

  if (!service || typeof service.loadOrders !== 'function') {
    throw new TypeError('Repayment order list service is required.')
  }
  if (typeof navigateOrderDetail !== 'function' || typeof navigateHome !== 'function') {
    throw new TypeError('Repayment navigation callbacks are required.')
  }

  let state = createInitialState()
  let disposed = false
  let initialized = false
  let instanceId = 0
  let activeRequest = null
  let loadingVisible = false
  const listeners = new Set()

  function emit(partial = {}) {
    if (disposed) return
    state = Object.freeze({ ...state, ...partial })
    listeners.forEach((listener) => listener(state))
  }

  function isCurrent(id) {
    return !disposed && id === instanceId
  }

  function showLoadingOnce() {
    if (loadingVisible) return
    loadingVisible = true
    try { showNativeLoading?.() } catch {}
  }

  function hideLoadingOnce() {
    if (!loadingVisible) return
    loadingVisible = false
    try { hideNativeLoading?.() } catch {}
  }

  function invalidate() {
    instanceId += 1
    activeRequest?.abort()
    activeRequest = null
    hideLoadingOnce()
  }

  function publishCount(count) {
    if (typeof setRepaymentCount !== 'function') return false
    try {
      return setRepaymentCount(count) === true
    } catch {
      return false
    }
  }

  function hasConfirmedContent() {
    return state.rootState === REPAYMENT_ROOT_STATE.LIST
      || state.rootState === REPAYMENT_ROOT_STATE.EMPTY
      || state.rootState === REPAYMENT_ROOT_STATE.ERROR
  }

  async function loadOrders(id, { preserveContent = false } = {}) {
    const preserve = preserveContent && hasConfirmedContent()
    activeRequest = createAbortController()
    emit(preserve
      ? { navigationLocked: false, refreshing: true }
      : {
          rootState: REPAYMENT_ROOT_STATE.LOADING,
          orders: Object.freeze([]),
          errorMessage: '',
          navigationLocked: false,
          refreshing: false,
        })
    showLoadingOnce()

    try {
      const result = await service.loadOrders({ signal: activeRequest.signal })
      if (!isCurrent(id)) return

      if (result?.type === 'success' && Array.isArray(result.orders)) {
        const orders = Object.freeze(result.orders.slice())
        publishCount(orders.length)
        hideLoadingOnce()
        emit({
          rootState: orders.length > 0 ? REPAYMENT_ROOT_STATE.LIST : REPAYMENT_ROOT_STATE.EMPTY,
          orders,
          errorMessage: '',
          navigationLocked: false,
          refreshing: false,
        })
        return
      }

      if (result?.type === 'business_failure') {
        hideLoadingOnce()
        if (result.message) onBusinessFailure(result.message)
        emit(preserve
          ? { refreshing: false }
          : {
              rootState: REPAYMENT_ROOT_STATE.ERROR,
              orders: Object.freeze([]),
              errorMessage: result.message || '',
              navigationLocked: false,
              refreshing: false,
            })
        return
      }

      if (result?.type === 'invalid_response') {
        hideLoadingOnce()
        emit(preserve
          ? { refreshing: false }
          : {
              rootState: REPAYMENT_ROOT_STATE.ERROR,
              orders: Object.freeze([]),
              errorMessage: REPAYMENT_TEXT.error.message,
              navigationLocked: false,
              refreshing: false,
            })
        return
      }

      hideLoadingOnce()
      emit(preserve
        ? { refreshing: false }
        : {
            rootState: REPAYMENT_ROOT_STATE.ERROR,
            orders: Object.freeze([]),
            errorMessage: REPAYMENT_TEXT.error.message,
            navigationLocked: false,
            refreshing: false,
          })
    } catch (error) {
      if (!isCurrent(id) || error?.category === 'canceled') return
      hideLoadingOnce()
      if (!isBusinessHandledError(error)) {
        onRequestFailure(REPAYMENT_TEXT.error.message)
      }
      emit(preserve
        ? { refreshing: false }
        : {
            rootState: REPAYMENT_ROOT_STATE.ERROR,
            orders: Object.freeze([]),
            errorMessage: REPAYMENT_TEXT.error.message,
            navigationLocked: false,
            refreshing: false,
          })
    } finally {
      if (isCurrent(id)) {
        activeRequest = null
        hideLoadingOnce()
      }
    }
  }

  function start() {
    if (disposed || initialized) return false
    initialized = true
    const id = instanceId + 1
    instanceId = id
    void loadOrders(id)
    return true
  }

  function activate() {
    if (disposed || !initialized) return false
    invalidate()
    const id = instanceId
    void loadOrders(id, { preserveContent: true })
    return true
  }

  function refresh() {
    if (disposed || !initialized) return false
    // Pull refresh is only offered once a confirmed root state exists, so the
    // first loading cycle and duplicate pulls are rejected here.
    if (!hasConfirmedContent() || state.refreshing) return false
    invalidate()
    const id = instanceId
    void loadOrders(id, { preserveContent: true })
    return true
  }

  function deactivate() {
    if (disposed) return
    invalidate()
    emit({ navigationLocked: false, refreshing: false })
  }

  function requestOrderDetail(orderId) {
    if (disposed || state.navigationLocked) return false
    if (typeof orderId !== 'string' || orderId.trim().length === 0) return false
    emit({ navigationLocked: true })
    try {
      navigateOrderDetail({ orderId: orderId.trim() })
    } catch {
      emit({ navigationLocked: false })
      return false
    }
    return true
  }

  function requestHome() {
    if (disposed || state.navigationLocked) return false
    emit({ navigationLocked: true })
    try {
      navigateHome()
    } catch {
      emit({ navigationLocked: false })
      return false
    }
    return true
  }

  return Object.freeze({
    getState: () => state,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('listener must be a function')
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },
    start,
    activate,
    refresh,
    deactivate,
    requestOrderDetail,
    requestHome,
    dispose() {
      if (disposed) return
      invalidate()
      disposed = true
      listeners.clear()
    },
  })
}
