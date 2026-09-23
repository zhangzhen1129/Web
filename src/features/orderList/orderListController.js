import { isBusinessHandledError } from '../../shared/businessError/index.js'
import {
  ORDER_LIST_DEFAULT_FILTER,
  ORDER_LIST_FILTERS,
  ORDER_LIST_FILTER_STATUSES,
  ORDER_LIST_ROOT_STATE,
  ORDER_STATUS,
} from './orderListConstants.js'
import { ORDER_LIST_TEXT } from './orderListText.js'

function createInitialState() {
  return Object.freeze({
    rootState: ORDER_LIST_ROOT_STATE.LOADING,
    allOrders: Object.freeze([]),
    visibleOrders: Object.freeze([]),
    activeFilter: ORDER_LIST_DEFAULT_FILTER,
    errorMessage: '',
    navigationLocked: false,
    refreshing: false,
  })
}

function selectVisibleOrders(filterKey, allOrders) {
  const statuses = ORDER_LIST_FILTER_STATUSES[filterKey] ?? ORDER_LIST_FILTER_STATUSES[ORDER_LIST_DEFAULT_FILTER]
  return Object.freeze(allOrders.filter((order) => statuses.includes(order.statusCode)))
}

function rootStateForVisibleOrders(visibleOrders) {
  return visibleOrders.length > 0 ? ORDER_LIST_ROOT_STATE.LIST : ORDER_LIST_ROOT_STATE.EMPTY
}

export function createOrderListController(options = {}) {
  const service = options.service
  const showNativeLoading = options.showNativeLoading
  const hideNativeLoading = options.hideNativeLoading
  const navigateOrderDetail = options.navigateOrderDetail
  const navigateHome = options.navigateHome
  const onBusinessFailure = options.onBusinessFailure ?? (() => {})
  const onRequestFailure = options.onRequestFailure ?? (() => {})
  const createAbortController = options.createAbortController ?? (() => new AbortController())

  if (!service || typeof service.loadOrders !== 'function') {
    throw new TypeError('Order list service is required.')
  }
  if (typeof navigateOrderDetail !== 'function' || typeof navigateHome !== 'function') {
    throw new TypeError('Order list navigation callbacks are required.')
  }

  let state = createInitialState()
  let disposed = false
  let started = false
  let confirmed = false
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

  function successState(allOrders, filterKey) {
    const visibleOrders = selectVisibleOrders(filterKey, allOrders)
    return {
      rootState: rootStateForVisibleOrders(visibleOrders),
      allOrders,
      visibleOrders,
      activeFilter: filterKey,
      errorMessage: '',
      navigationLocked: false,
      refreshing: false,
    }
  }

  function failureState() {
    return {
      rootState: ORDER_LIST_ROOT_STATE.ERROR,
      allOrders: Object.freeze([]),
      visibleOrders: Object.freeze([]),
      activeFilter: ORDER_LIST_DEFAULT_FILTER,
      errorMessage: ORDER_LIST_TEXT.error.message,
      navigationLocked: false,
      refreshing: false,
    }
  }

  async function loadOrders(id, { preserveContent = false } = {}) {
    const preserve = preserveContent && confirmed
    activeRequest = createAbortController()
    emit(preserve
      ? { navigationLocked: false, refreshing: true }
      : {
          rootState: ORDER_LIST_ROOT_STATE.LOADING,
          allOrders: Object.freeze([]),
          visibleOrders: Object.freeze([]),
          activeFilter: ORDER_LIST_DEFAULT_FILTER,
          errorMessage: '',
          navigationLocked: false,
          refreshing: false,
        })
    showLoadingOnce()

    try {
      const result = await service.loadOrders({ signal: activeRequest.signal })
      if (!isCurrent(id)) return

      if (result?.type === 'success' && Array.isArray(result.orders)) {
        const allOrders = Object.freeze(result.orders.slice())
        confirmed = true
        hideLoadingOnce()
        emit(successState(allOrders, state.activeFilter))
        return
      }

      if (result?.type === 'business_failure') {
        hideLoadingOnce()
        if (result.message) onBusinessFailure(result.message)
        confirmed = true
        emit(preserve ? { refreshing: false } : failureState())
        return
      }

      hideLoadingOnce()
      confirmed = true
      emit(preserve ? { refreshing: false } : failureState())
    } catch (error) {
      if (!isCurrent(id) || error?.category === 'canceled') return
      hideLoadingOnce()
      if (!isBusinessHandledError(error)) {
        onRequestFailure(ORDER_LIST_TEXT.error.message)
      }
      confirmed = true
      emit(preserve ? { refreshing: false } : failureState())
    } finally {
      if (isCurrent(id)) {
        activeRequest = null
        hideLoadingOnce()
      }
    }
  }

  function start() {
    if (disposed || started) return false
    started = true
    const id = instanceId + 1
    instanceId = id
    void loadOrders(id)
    return true
  }

  function refresh() {
    if (disposed || !started) return false
    if (!confirmed || state.refreshing) return false
    invalidate()
    const id = instanceId
    void loadOrders(id, { preserveContent: true })
    return true
  }

  function setFilter(filterKey) {
    if (disposed) return false
    if (state.rootState !== ORDER_LIST_ROOT_STATE.LIST && state.rootState !== ORDER_LIST_ROOT_STATE.EMPTY) {
      return false
    }
    if (!ORDER_LIST_FILTERS.includes(filterKey)) return false
    if (filterKey === state.activeFilter) return true
    const visibleOrders = selectVisibleOrders(filterKey, state.allOrders)
    emit({
      activeFilter: filterKey,
      visibleOrders,
      rootState: rootStateForVisibleOrders(visibleOrders),
    })
    return true
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

  function requestOrderAction(order) {
    if (disposed || state.navigationLocked) return false
    if (!order || typeof order !== 'object') return false
    if (order.statusCode === ORDER_STATUS.CREATE) return requestHome()
    return requestOrderDetail(order.orderId)
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
    refresh,
    setFilter,
    requestOrderDetail,
    requestOrderAction,
    requestHome,
    dispose() {
      if (disposed) return
      invalidate()
      disposed = true
      listeners.clear()
    },
  })
}
