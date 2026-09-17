import { isBusinessHandledError } from '../../shared/businessError/index.js'

const EMPTY_DISPLAY_MODEL = Object.freeze({
  loanAmount: '',
  receivedAmount: '',
  repaymentAmount: '',
  applicationDate: '',
  repaymentDate: '',
  bankName: '',
  bankAccount: '',
})

function createState() {
  return Object.freeze({
    entryValid: false,
    initialLoading: false,
    displayModel: EMPTY_DISPLAY_MODEL,
    submitting: false,
    navigationLocked: false,
    loadingBarStatus: null,
  })
}

function textMessage(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : ''
}

function isValidEntryQuery(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return false
  const keys = Object.keys(query)
  return keys.length === 1
    && keys[0] === 'orderId'
    && typeof query.orderId === 'string'
    && query.orderId.trim().length > 0
}

function createConsumerProxy() {
  let consumer = null
  return Object.freeze({
    handle() { consumer?.() },
    set(nextConsumer) { consumer = typeof nextConsumer === 'function' ? nextConsumer : null },
    clear() { consumer = null },
  })
}

function createOperationId(sequence) {
  return `loan-confirm-${Date.now().toString(36)}-${sequence.toString(36)}`
}

export function createLoanConfirmController({
  services,
  triggerUpload,
  uploadFailureMessage = '',
  showNativeLoading,
  hideNativeLoading,
  setPhysicalBackIntercept,
  createAbortController = () => new AbortController(),
  createOperation = createOperationId,
  onBusinessFailure = () => {},
  onUploadFailure = () => {},
  onNavigateLoanSuccess = () => {},
  onNavigateLoanFail = () => {},
  onNavigateBack = () => {},
} = {}) {
  if (!services || typeof services.loadConfirmInfo !== 'function' || typeof services.submitApplication !== 'function') {
    throw new TypeError('Loan confirmation services are required.')
  }
  if (typeof triggerUpload !== 'function') throw new TypeError('triggerUpload is required.')

  let state = createState()
  let orderId = ''
  let instanceId = 0
  let initialized = false
  let disposed = false
  let initialController = null
  let submissionController = null
  let submissionId = 0
  let backInterceptEnabled = false
  const loadingOwners = new Set()
  const listeners = new Set()
  const physicalBackProxy = createConsumerProxy()

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
    initialController?.abort()
    submissionController?.abort()
    initialController = null
    submissionController = null
    submissionId += 1
  }

  function showLoading(ownerKey) {
    const wasEmpty = loadingOwners.size === 0
    loadingOwners.add(ownerKey)
    if (!wasEmpty) return
    try { showNativeLoading?.() } catch {}
  }

  function hideLoading(ownerKey) {
    if (!loadingOwners.delete(ownerKey) || loadingOwners.size > 0) return
    try { hideNativeLoading?.() } catch {}
  }

  function hideAllLoading() {
    if (loadingOwners.size === 0) return
    loadingOwners.clear()
    try { hideNativeLoading?.() } catch {}
  }

  function disableBackIntercept() {
    physicalBackProxy.clear()
    if (!backInterceptEnabled) return true
    backInterceptEnabled = false
    try {
      return setPhysicalBackIntercept?.({ enabled: false }) != null
    } catch {
      return false
    }
  }

  function requestBack() {
    if (disposed || !state.entryValid || state.navigationLocked) return false
    invalidate()
    disableBackIntercept()
    hideAllLoading()
    emit({ submitting: false, loadingBarStatus: null, navigationLocked: true })
    onNavigateBack()
    return true
  }

  function handlePhysicalBack() {
    requestBack()
  }

  async function loadConfirmInfo(id) {
    initialController = createAbortController()
    try {
      const response = await services.loadConfirmInfo({
        orderId,
        signal: initialController.signal,
      })
      if (!isCurrent(id)) return
      if (response?.type === 'success') {
        emit({ displayModel: response.displayModel })
        return
      }
      if (response?.type === 'business_failure') {
        const message = textMessage(response.message)
        if (message) onBusinessFailure(message)
      }
    } catch (error) {
      if (isCurrent(id) && isBusinessHandledError(error)) return
    } finally {
      if (isCurrent(id)) {
        initialController = null
        hideLoading(`load-${id}`)
        emit({ initialLoading: false })
      }
    }
  }

  function finishFailure() {
    invalidate()
    emit({ submitting: false, loadingBarStatus: null, navigationLocked: true })
    disableBackIntercept()
    hideAllLoading()
    onNavigateLoanFail({ orderId })
  }

  function finishSuccess() {
    invalidate()
    emit({ submitting: false, loadingBarStatus: null, navigationLocked: true })
    disableBackIntercept()
    hideAllLoading()
    onNavigateLoanSuccess({ systemTime: String(Date.now()) })
  }

  async function runSubmission(id, signal) {
    let uploadResult
    try {
      uploadResult = await triggerUpload({
        operationId: createOperation(id),
        signal,
        onStatus(status) {
          if (!isCurrent(id) || (status !== 'collecting' && status !== 'uploading')) return
          emit({ loadingBarStatus: status })
        },
      })
    } catch {
      uploadResult = Object.freeze({ status: 'unavailable' })
    }
    if (!isCurrent(id)) return false

    if (uploadResult?.status === 'cancelled') {
      invalidate()
      submissionController = null
      hideAllLoading()
      emit({ submitting: false, loadingBarStatus: null })
      return false
    }

    if (uploadResult?.status !== 'success') {
      const message = textMessage(uploadFailureMessage)
      if (message) onUploadFailure(message)
      finishFailure()
      return true
    }

    emit({ loadingBarStatus: 'applying' })

    let applicationResult
    try {
      applicationResult = await services.submitApplication({ orderId, signal })
    } catch (error) {
      if (!isCurrent(id)) return false
      if (isBusinessHandledError(error)) {
        invalidate()
        submissionController = null
        hideAllLoading()
        emit({ submitting: false, loadingBarStatus: null })
        return false
      }
      if (error?.category === 'canceled') {
        invalidate()
        submissionController = null
        hideAllLoading()
        emit({ submitting: false, loadingBarStatus: null })
        return false
      }
      applicationResult = Object.freeze({ type: 'request_failure' })
    }
    if (!isCurrent(id)) return false

    submissionController = null
    if (applicationResult?.type === 'success') {
      finishSuccess()
      return true
    }

    if (applicationResult?.type === 'business_failure') {
      const message = textMessage(applicationResult.message)
      if (message) onBusinessFailure(message)
    }
    finishFailure()
    return true
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
        emit({ entryValid: false, initialLoading: false })
        return false
      }

      orderId = query.orderId
      physicalBackProxy.set(handlePhysicalBack)
      try {
        const requestId = setPhysicalBackIntercept?.({
          enabled: true,
          onIntercept: physicalBackProxy.handle,
        })
        backInterceptEnabled = requestId != null
      } catch {
        backInterceptEnabled = false
      }
      if (!backInterceptEnabled) physicalBackProxy.clear()

      const id = instanceId + 1
      instanceId = id
      emit({ entryValid: true, initialLoading: true })
      showLoading(`load-${id}`)
      void loadConfirmInfo(id)
      return true
    },
    confirmApplication() {
      if (disposed || !state.entryValid || state.submitting || state.navigationLocked) return false
      const id = submissionId + 1
      submissionId = id
      submissionController = createAbortController()
      emit({ submitting: true, loadingBarStatus: 'collecting' })
      void runSubmission(id, submissionController.signal)
      return true
    },
    requestBack,
    dispose() {
      if (disposed) return
      invalidate()
      disableBackIntercept()
      hideAllLoading()
      disposed = true
      listeners.clear()
    },
  })
}
