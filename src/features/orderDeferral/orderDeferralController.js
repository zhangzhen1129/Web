import { isBusinessHandledError } from '../../shared/businessError/index.js'
import { buildDeferralDisplayModel } from './orderDeferralDisplay.js'

export const ORDER_DEFERRAL_PHASE = Object.freeze({
  INACTIVE: 'inactive',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
})

const PLACEHOLDER_DISPLAY_MODEL = Object.freeze({
  billId: '',
  applicationDate: '--',
  dueDate: '--',
  extensionDays: null,
  extensionDaysText: '--',
  paymentAmountText: '--',
  serviceFeeText: '--',
  overdueFeeText: '--',
})

function createState() {
  return Object.freeze({
    entryValid: false,
    phase: ORDER_DEFERRAL_PHASE.INACTIVE,
    displayModel: PLACEHOLDER_DISPLAY_MODEL,
    expanded: false,
    submitting: false,
    navigationLocked: false,
  })
}

function isValidEntryQuery(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return false
  const keys = Object.keys(query)
  return keys.length === 1
    && keys[0] === 'orderId'
    && typeof query.orderId === 'string'
    && query.orderId.trim().length > 0
}

function textMessage(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
}

function safeRequestMessage(error) {
  if (typeof error?.displayMessage === 'string' && error.displayMessage.length > 0) return error.displayMessage
  if (typeof error?.message === 'string' && error.message.length > 0) return error.message
  return 'Unable to complete the request.'
}

export function createOrderDeferralController({
  services,
  showNativeLoading,
  hideNativeLoading,
  openPaymentPage,
  setPhysicalBackIntercept,
  createAbortController = () => new AbortController(),
  onBusinessFailure = () => {},
  onRequestFailure = () => {},
  onNavigateBack = () => {},
  onNavigateHelpCenter = () => {},
} = {}) {
  if (
    !services
    || typeof services.loadDeferralDetail !== 'function'
    || typeof services.submitDeferral !== 'function'
  ) {
    throw new TypeError('Order deferral services are required.')
  }
  if (typeof openPaymentPage !== 'function') throw new TypeError('openPaymentPage is required.')

  let state = createState()
  let orderId = ''
  let instanceId = 0
  let initialized = false
  let disposed = false
  let detailController = null
  let submitController = null
  let physicalBackEnabled = false
  const loadingOwners = new Set()
  const listeners = new Set()

  function emit(partial = {}) {
    if (disposed) return
    state = Object.freeze({ ...state, ...partial })
    listeners.forEach((listener) => listener(state))
  }

  function isCurrent(id) {
    return !disposed && id === instanceId
  }

  function abortActiveRequests() {
    detailController?.abort()
    submitController?.abort()
    detailController = null
    submitController = null
  }

  function showLoading(owner) {
    if (loadingOwners.has(owner)) return
    loadingOwners.add(owner)
    try {
      showNativeLoading?.()
    } catch {}
  }

  function hideLoading(owner) {
    if (!loadingOwners.delete(owner)) return
    if (loadingOwners.size > 0) return
    try {
      hideNativeLoading?.()
    } catch {}
  }

  function clearLoading() {
    if (loadingOwners.size === 0) return
    loadingOwners.clear()
    try {
      hideNativeLoading?.()
    } catch {}
  }

  function enablePhysicalBack() {
    if (physicalBackEnabled || typeof setPhysicalBackIntercept !== 'function') return
    try {
      const requestId = setPhysicalBackIntercept({
        enabled: true,
        onIntercept: handlePhysicalBack,
      })
      physicalBackEnabled = typeof requestId === 'string' && requestId.length > 0
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

  function navigate(action) {
    if (disposed || state.navigationLocked) return false
    instanceId += 1
    abortActiveRequests()
    disablePhysicalBack()
    clearLoading()
    emit({
      phase: ORDER_DEFERRAL_PHASE.INACTIVE,
      displayModel: PLACEHOLDER_DISPLAY_MODEL,
      expanded: false,
      submitting: false,
      navigationLocked: true,
    })
    action()
    return true
  }

  async function loadDetail(id) {
    detailController = createAbortController()
    try {
      const result = await services.loadDeferralDetail({
        orderId,
        signal: detailController.signal,
      })
      if (!isCurrent(id)) return

      detailController = null
      hideLoading('detail')

      if (result?.type === 'success') {
        emit({
          phase: ORDER_DEFERRAL_PHASE.READY,
          displayModel: buildDeferralDisplayModel(result.detail),
          expanded: false,
          submitting: false,
        })
        return
      }

      if (result?.type === 'business_failure') {
        const message = textMessage(result.message)
        if (message) onBusinessFailure(message)
      }
      emit({
        phase: ORDER_DEFERRAL_PHASE.ERROR,
        displayModel: PLACEHOLDER_DISPLAY_MODEL,
        expanded: false,
        submitting: false,
      })
    } catch (error) {
      if (!isCurrent(id)) return
      detailController = null
      hideLoading('detail')
      if (!isBusinessHandledError(error) && error?.category !== 'canceled') {
        onRequestFailure(safeRequestMessage(error))
      }
      emit({
        phase: ORDER_DEFERRAL_PHASE.ERROR,
        displayModel: PLACEHOLDER_DISPLAY_MODEL,
        expanded: false,
        submitting: false,
      })
    }
  }

  async function submitDeferral(pageId, signal) {
    let result
    try {
      result = await services.submitDeferral({
        billId: state.displayModel.billId,
        signal,
      })
    } catch (error) {
      if (!isCurrent(pageId)) return
      submitController = null
      hideLoading('submit')
      emit({ submitting: false })
      if (isBusinessHandledError(error) || error?.category === 'canceled') return
      onRequestFailure(safeRequestMessage(error))
      return
    }

    if (!isCurrent(pageId)) return
    submitController = null

    if (result?.type === 'business_failure') {
      hideLoading('submit')
      emit({ submitting: false })
      const message = textMessage(result.message)
      if (message) onBusinessFailure(message)
      return
    }
    if (result?.type !== 'success') {
      hideLoading('submit')
      emit({ submitting: false })
      return
    }

    hideLoading('submit')
    let accepted = false
    try {
      accepted = openPaymentPage(result.paymentUrl) === true
    } catch {
      accepted = false
    }
    if (!isCurrent(pageId)) return
    emit({ submitting: false })
    if (!accepted) return
  }

  function handlePhysicalBack() {
    requestBack()
  }

  function requestBack() {
    if (disposed || state.navigationLocked) return false
    return navigate(onNavigateBack)
  }

  return Object.freeze({
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },
    initialize(query) {
      if (disposed || initialized) return false
      initialized = true

      if (!isValidEntryQuery(query)) {
        emit({ entryValid: false, phase: ORDER_DEFERRAL_PHASE.INACTIVE })
        return false
      }

      orderId = query.orderId
      const id = instanceId + 1
      instanceId = id
      emit({
        entryValid: true,
        phase: ORDER_DEFERRAL_PHASE.LOADING,
        displayModel: PLACEHOLDER_DISPLAY_MODEL,
        expanded: false,
        submitting: false,
        navigationLocked: false,
      })
      showLoading('detail')
      enablePhysicalBack()
      void loadDetail(id)
      return true
    },
    requestBack,
    requestHelp() {
      if (disposed || state.navigationLocked) return false
      return navigate(onNavigateHelpCenter)
    },
    toggleDetails() {
      if (disposed || !state.entryValid || state.navigationLocked) return false
      emit({ expanded: !state.expanded })
      return true
    },
    requestSubmit() {
      if (
        disposed
        || state.navigationLocked
        || state.submitting
        || state.phase !== ORDER_DEFERRAL_PHASE.READY
        || textMessage(state.displayModel.billId) === ''
      ) return false

      const pageId = instanceId
      submitController = createAbortController()
      emit({ submitting: true })
      showLoading('submit')
      void submitDeferral(pageId, submitController.signal)
      return true
    },
    dispose() {
      if (disposed) return
      instanceId += 1
      abortActiveRequests()
      disablePhysicalBack()
      clearLoading()
      emit({
        phase: ORDER_DEFERRAL_PHASE.INACTIVE,
        displayModel: PLACEHOLDER_DISPLAY_MODEL,
        expanded: false,
        submitting: false,
        navigationLocked: true,
      })
      disposed = true
      listeners.clear()
    },
  })
}
