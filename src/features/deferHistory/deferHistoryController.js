import { isBusinessHandledError } from '../../shared/businessError/index.js'
import { DEFER_HISTORY_PHASE } from './deferHistoryConstants.js'
import { buildDeferHistoryDisplayModel } from './deferHistoryDisplay.js'

const EMPTY_RECORDS = Object.freeze([])
const ENTRY_QUERY_KEYS = new Set(['orderId', 'productId', 'orderStatus'])
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

function createState() {
  return Object.freeze({
    entryValid: false,
    phase: DEFER_HISTORY_PHASE.INACTIVE,
    records: EMPTY_RECORDS,
    navigationLocked: false,
  })
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isValidEntryQuery(query) {
  if (!isPlainObject(query)) return false

  const keys = Object.keys(query)
  if (!hasOwn(query, 'orderId') || !hasOwn(query, 'orderStatus')) return false
  if (!keys.every((key) => ENTRY_QUERY_KEYS.has(key))) return false

  return typeof query.orderId === 'string'
    && query.orderId.trim().length > 0
    && (!hasOwn(query, 'productId') || typeof query.productId === 'string')
    && typeof query.orderStatus === 'string'
    && /^\d+$/.test(query.orderStatus)
}

function textMessage(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
}

function requestErrorMessage(error) {
  return textMessage(error?.displayMessage) || textMessage(error?.message)
}

function isCanceledError(error) {
  return error?.category === 'canceled'
}

export function createDeferHistoryController({
  services,
  showNativeLoading,
  hideNativeLoading,
  setPhysicalBackIntercept,
  createAbortController = () => new AbortController(),
  onBusinessFailure = () => {},
  onRequestFailure = () => {},
  onNavigateBack = () => {},
} = {}) {
  if (!services || typeof services.loadDeferHistory !== 'function') {
    throw new TypeError('Defer history services are required.')
  }

  let state = createState()
  let orderId = ''
  let instanceId = 0
  let initialized = false
  let disposed = false
  let requestController = null
  let physicalBackEnabled = false
  let loadingOpen = false
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
    if (loadingOpen) return
    loadingOpen = true
    try {
      showNativeLoading?.()
    } catch {}
  }

  function hideLoadingOnce() {
    if (!loadingOpen) return
    loadingOpen = false
    try {
      hideNativeLoading?.()
    } catch {}
  }

  function abortRequest() {
    const controller = requestController
    requestController = null
    if (!controller || typeof controller.abort !== 'function') return
    try {
      controller.abort()
    } catch {}
  }

  function enablePhysicalBack() {
    if (physicalBackEnabled || typeof setPhysicalBackIntercept !== 'function') return
    try {
      const requestId = setPhysicalBackIntercept({
        enabled: true,
        onIntercept: handlePhysicalBack,
      })
      physicalBackEnabled = requestId !== null && requestId !== undefined && requestId !== false
    } catch {
      physicalBackEnabled = false
    }
  }

  function disablePhysicalBack() {
    if (!physicalBackEnabled || typeof setPhysicalBackIntercept !== 'function') {
      physicalBackEnabled = false
      return
    }
    physicalBackEnabled = false
    try {
      setPhysicalBackIntercept({ enabled: false })
    } catch {}
  }

  function invalidateAndCleanup() {
    instanceId += 1
    abortRequest()
    disablePhysicalBack()
    hideLoadingOnce()
    emit({
      phase: DEFER_HISTORY_PHASE.INACTIVE,
      records: EMPTY_RECORDS,
      navigationLocked: true,
    })
  }

  function finishWithError(id) {
    if (!isCurrent(id)) return false
    requestController = null
    emit({
      phase: DEFER_HISTORY_PHASE.ERROR,
      records: EMPTY_RECORDS,
    })
    hideLoadingOnce()
    return true
  }

  async function loadHistory(id) {
    let result
    try {
      result = await services.loadDeferHistory({
        orderId,
        signal: requestController?.signal,
      })
    } catch (error) {
      if (!isCurrent(id)) return
      if (isCanceledError(error)) {
        requestController = null
        hideLoadingOnce()
        return
      }

      finishWithError(id)
      if (isBusinessHandledError(error)) return

      const message = requestErrorMessage(error)
      if (message) {
        try {
          onRequestFailure(message)
        } catch {}
      }
      return
    }

    if (!isCurrent(id)) return
    requestController = null

    if (result?.type === 'canceled') {
      hideLoadingOnce()
      return
    }

    if (result?.type === 'success') {
      try {
        const records = buildDeferHistoryDisplayModel(result.records)
        emit({
          phase: DEFER_HISTORY_PHASE.READY,
          records,
        })
        hideLoadingOnce()
      } catch {
        finishWithError(id)
      }
      return
    }

    if (result?.type === 'business_failure') {
      finishWithError(id)
      const message = textMessage(result.message)
      if (message) {
        try {
          onBusinessFailure(message)
        } catch {}
      }
      return
    }

    finishWithError(id)
  }


  function handlePhysicalBack() {
    requestBack()
  }

  function requestBack() {
    if (disposed || !state.entryValid || state.navigationLocked) return false
    invalidateAndCleanup()
    try {
      onNavigateBack()
    } catch {}
    return true
  }

  function initialize(query) {
    if (disposed || initialized) return false
    initialized = true

    if (!isValidEntryQuery(query)) {
      emit(createState())
      return false
    }

    orderId = query.orderId
    const id = instanceId + 1
    instanceId = id
    emit({
      entryValid: true,
      phase: DEFER_HISTORY_PHASE.LOADING,
      records: EMPTY_RECORDS,
      navigationLocked: false,
    })
    showLoadingOnce()
    enablePhysicalBack()

    try {
      requestController = createAbortController()
    } catch {
      requestController = null
    }

    void loadHistory(id)
    return true
  }

  return Object.freeze({
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },
    start: initialize,
    initialize,
    requestBack,
    dispose() {
      if (disposed) return false
      if (!state.navigationLocked) invalidateAndCleanup()
      disposed = true
      listeners.clear()
      return true
    },
  })
}



