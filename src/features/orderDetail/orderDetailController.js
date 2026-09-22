import { isBusinessHandledError } from '../../shared/businessError/index.js'
import {
  ORDER_DETAIL_ROOT_STATE,
  isRepaymentRootState,
} from './orderDetailState.js'

const EMPTY_DISPLAY_MODEL = Object.freeze({
  orderNo: '',
  billId: '',
  productId: '',
  productName: '',
  companyName: '',
  orderStatus: null,
  rootState: ORDER_DETAIL_ROOT_STATE.INACTIVE,
  loanAmount: '',
  serviceFee: '',
  receivedAmount: '',
  interest: '',
  penaltyFee: null,
  repaymentAmount: '',
  actualRepaymentAmount: null,
  remainingRepaymentAmount: null,
  bankName: '',
  bankAccount: '',
  applicationDate: '',
  disbursementDate: '',
  dueDate: '',
  repaymentDate: '',
  arrivalDate: '',
  lastUpdatedAt: '',
  extensionFlag: null,
})

function createState() {
  return Object.freeze({
    entryValid: false,
    rootState: ORDER_DETAIL_ROOT_STATE.INACTIVE,
    displayModel: EMPTY_DISPLAY_MODEL,
    historyCount: null,
    historyVisible: false,
    paymentSubmitting: false,
    navigationLocked: false,
  })
}

function textMessage(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : ''
}

function safeRequestMessage(error) {
  if (typeof error?.displayMessage === 'string' && error.displayMessage.length > 0) return error.displayMessage
  if (typeof error?.message === 'string' && error.message.length > 0) return error.message
  return 'Unable to complete the request.'
}

function isValidEntryQuery(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return false
  const keys = Object.keys(query)
  return keys.length === 1
    && keys[0] === 'orderId'
    && typeof query.orderId === 'string'
    && query.orderId.trim().length > 0
}

function canShowHistory(rootState, historyCount, extensionFlag) {
  if (!isRepaymentRootState(rootState)) return false
  return historyCount > 0 || extensionFlag === 1
}

export function createOrderDetailController({
  services,
  showNativeLoading,
  hideNativeLoading,
  openPaymentPage,
  createAbortController = () => new AbortController(),
  onBusinessFailure = () => {},
  onRequestFailure = () => {},
  onNavigateBack = () => {},
  onNavigateDeferDetail = () => {},
  onNavigateDeferHistory = () => {},
  onNavigateBankDetail = () => {},
  onNavigateHome = () => {},
  onNavigateHelpCenter = () => {},
} = {}) {
  if (
    !services
    || typeof services.loadOrderDetail !== 'function'
    || typeof services.loadExtensionHistory !== 'function'
    || typeof services.requestRepayment !== 'function'
  ) {
    throw new TypeError('Order detail services are required.')
  }
  if (typeof openPaymentPage !== 'function') throw new TypeError('openPaymentPage is required.')

  let state = createState()
  let orderId = ''
  let instanceId = 0
  let initialized = false
  let disposed = false
  let detailController = null
  let historyController = null
  let paymentController = null
  let paymentSequence = 0
  const listeners = new Set()

  function emit(partial = {}) {
    if (disposed) return
    state = Object.freeze({ ...state, ...partial })
    listeners.forEach((listener) => listener(state))
  }

  function isCurrent(id) {
    return !disposed && id === instanceId
  }

  function invalidate() {
    instanceId += 1
    detailController?.abort()
    historyController?.abort()
    paymentController?.abort()
    detailController = null
    historyController = null
    paymentController = null
    paymentSequence += 1
  }

  function hideLoading() {
    try { hideNativeLoading?.() } catch {}
  }

  function navigate(action) {
    if (disposed || state.navigationLocked) return false
    invalidate()
    hideLoading()
    emit({
      rootState: ORDER_DETAIL_ROOT_STATE.INACTIVE,
      paymentSubmitting: false,
      navigationLocked: true,
    })
    action()
    return true
  }

  async function loadHistory(id, displayModel, rootState) {
    historyController = createAbortController()
    try {
      const result = await services.loadExtensionHistory({
        orderId,
        signal: historyController.signal,
      })
      if (!isCurrent(id)) return
      if (result?.type === 'success') {
        emit({
          historyCount: result.historyCount,
          historyVisible: canShowHistory(rootState, result.historyCount, displayModel.extensionFlag),
        })
        return
      }
      emit({ historyCount: null, historyVisible: false })
    } catch {
      if (isCurrent(id)) emit({ historyCount: null, historyVisible: false })
    } finally {
      if (isCurrent(id)) historyController = null
    }
  }

  async function loadDetail(id) {
    detailController = createAbortController()
    try {
      const result = await services.loadOrderDetail({
        orderId,
        signal: detailController.signal,
      })
      if (!isCurrent(id)) return

      if (result?.type === 'success') {
        emit({
          rootState: result.rootState,
          displayModel: result.displayModel,
          historyCount: null,
          historyVisible: false,
          paymentSubmitting: false,
        })
        hideLoading()
        void loadHistory(id, result.displayModel, result.rootState)
        return
      }

      hideLoading()
      if (result?.type === 'business_failure') {
        const message = textMessage(result.message)
        if (message) onBusinessFailure(message)
      }
      emit({
        rootState: ORDER_DETAIL_ROOT_STATE.ERROR,
        displayModel: EMPTY_DISPLAY_MODEL,
        historyCount: null,
        historyVisible: false,
        paymentSubmitting: false,
      })
    } catch (error) {
      if (!isCurrent(id)) return
      hideLoading()
      if (!isBusinessHandledError(error) && error?.category !== 'canceled') {
        onRequestFailure(safeRequestMessage(error))
      }
      emit({
        rootState: ORDER_DETAIL_ROOT_STATE.ERROR,
        displayModel: EMPTY_DISPLAY_MODEL,
        historyCount: null,
        historyVisible: false,
        paymentSubmitting: false,
      })
    } finally {
      if (isCurrent(id)) detailController = null
    }
  }

  async function submitRepayment(id, signal) {
    let result
    try {
      result = await services.requestRepayment({
        billId: state.displayModel.billId,
        signal,
      })
    } catch (error) {
      if (!isCurrent(id)) return
      paymentController = null
      emit({ paymentSubmitting: false })
      if (isBusinessHandledError(error) || error?.category === 'canceled') return
      onRequestFailure(safeRequestMessage(error))
      return
    }
    if (!isCurrent(id)) return
    paymentController = null

    if (result?.type === 'business_failure') {
      emit({ paymentSubmitting: false })
      const message = textMessage(result.message)
      if (message) onBusinessFailure(message)
      return
    }
    if (result?.type !== 'success') {
      emit({ paymentSubmitting: false })
      return
    }

    let accepted = false
    try {
      accepted = openPaymentPage(result.repaymentUrl) === true
    } catch {
      accepted = false
    }
    if (!isCurrent(id)) return
    emit({ paymentSubmitting: false })
    if (!accepted) return
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
        emit({ entryValid: false, rootState: ORDER_DETAIL_ROOT_STATE.INACTIVE })
        return false
      }

      orderId = query.orderId
      const id = instanceId + 1
      instanceId = id
      emit({
        entryValid: true,
        rootState: ORDER_DETAIL_ROOT_STATE.LOADING,
        displayModel: EMPTY_DISPLAY_MODEL,
        historyCount: null,
        historyVisible: false,
        paymentSubmitting: false,
        navigationLocked: false,
      })
      try { showNativeLoading?.() } catch {}
      void loadDetail(id)
      return true
    },
    requestBack() {
      if (disposed || !state.entryValid || state.navigationLocked) return false
      return navigate(onNavigateBack)
    },
    requestHelp() {
      if (disposed || state.navigationLocked) return false
      return navigate(onNavigateHelpCenter)
    },
    requestPayment() {
      if (
        disposed
        || state.navigationLocked
        || state.paymentSubmitting
        || !isRepaymentRootState(state.rootState)
        || state.rootState === ORDER_DETAIL_ROOT_STATE.COMPLETED
        || textMessage(state.displayModel.billId) === ''
      ) return false

      const id = paymentSequence + 1
      paymentSequence = id
      paymentController = createAbortController()
      emit({ paymentSubmitting: true })
      void submitRepayment(id, paymentController.signal)
      return true
    },
    requestExtension() {
      if (
        disposed
        || state.navigationLocked
        || (state.rootState !== ORDER_DETAIL_ROOT_STATE.REPAYING
          && state.rootState !== ORDER_DETAIL_ROOT_STATE.OVERDUE)
        || state.displayModel.extensionFlag !== 1
        || textMessage(state.displayModel.orderNo) === ''
      ) return false
      return navigate(() => onNavigateDeferDetail({ orderId: state.displayModel.orderNo }))
    },
    requestHistory() {
      if (
        disposed
        || state.navigationLocked
        || !state.historyVisible
        || textMessage(state.displayModel.orderNo) === ''
      ) return false
      return navigate(() => {
        const query = {
          orderId: state.displayModel.orderNo,
          orderStatus: state.displayModel.orderStatus,
        }
        if (textMessage(state.displayModel.productId) !== '') query.productId = state.displayModel.productId
        onNavigateDeferHistory(query)
      })
    },
    requestBankDetail() {
      if (
        disposed
        || state.navigationLocked
        || state.rootState !== ORDER_DETAIL_ROOT_STATE.TRANSFER_FAILED
        || textMessage(state.displayModel.orderNo) === ''
      ) return false
      return navigate(() => onNavigateBankDetail({
        orderId: state.displayModel.orderNo,
        type: 'bankAccess',
      }))
    },
    requestReapply() {
      if (
        disposed
        || state.navigationLocked
        || state.rootState !== ORDER_DETAIL_ROOT_STATE.COMPLETED
      ) return false
      return navigate(onNavigateHome)
    },
    dispose() {
      if (disposed) return
      invalidate()
      hideLoading()
      emit({
        rootState: ORDER_DETAIL_ROOT_STATE.INACTIVE,
        paymentSubmitting: false,
        navigationLocked: true,
      })
      disposed = true
      listeners.clear()
    },
  })
}
