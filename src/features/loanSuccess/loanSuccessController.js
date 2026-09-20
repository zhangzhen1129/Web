import { isBusinessHandledError } from '../../shared/businessError/index.js'
import { addDecimalStrings } from './loanSuccessAmount.js'
import { RECOMMENDED_COMMENTS, REVIEW_CONTENT_MAX_LENGTH } from './loanSuccessText.js'

const ENTRY_PATTERN = /^(0|[1-9]\d*)$/
const ROOT_STATES = Object.freeze({
  loading: 'loading',
  recommendation: 'recommendation',
  orderList: 'order_list',
  emptyResult: 'empty_result',
  submitting: 'submitting',
  inactive: 'inactive',
})
const OVERLAY_STATES = Object.freeze({
  backIntercept: 'back_intercept',
  reviewPrompt: 'review_prompt',
  reviewSubmitting: 'review_submitting',
})
const REVIEW_ORIGINS = Object.freeze({
  return: 'return',
  orderListMain: 'order_list_main',
})
const INTERCEPT_COUNTDOWN_SECONDS = 10

function createState() {
  return Object.freeze({
    entryValid: false,
    rootState: ROOT_STATES.inactive,
    overlay: null,
    reviewOrigin: null,
    products: Object.freeze([]),
    selectedIds: Object.freeze([]),
    selectedCount: 0,
    selectedAmount: '0',
    orders: Object.freeze([]),
    loadingBarStatus: null,
    submitting: false,
    reviewSubmitting: false,
    reviewRating: 5,
    reviewContent: '',
    recommendedComment: '',
    navigationLocked: false,
    interceptCountdown: INTERCEPT_COUNTDOWN_SECONDS,
  })
}

function isValidEntryQuery(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return false
  const keys = Object.keys(query)
  return keys.length === 1
    && keys[0] === 'systemTime'
    && typeof query.systemTime === 'string'
    && ENTRY_PATTERN.test(query.systemTime)
    && Number.isSafeInteger(Number(query.systemTime))
}

function textMessage(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : ''
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
  return `loan-success-${Date.now().toString(36)}-${sequence.toString(36)}`
}

function pickRecommendedComment(random = Math.random) {
  if (RECOMMENDED_COMMENTS.length === 0) return ''
  const index = Math.min(Math.floor(random() * RECOMMENDED_COMMENTS.length), RECOMMENDED_COMMENTS.length - 1)
  return RECOMMENDED_COMMENTS[index]
}

function selectedAmount(products, selectedIds) {
  const selected = new Set(selectedIds)
  const amounts = products
    .filter((product) => selected.has(product.id))
    .map((product) => product.minAmount)
  return addDecimalStrings(amounts)
}

function isCurrentRequest(id, instanceId, disposed) {
  return !disposed && id === instanceId
}

export function createLoanSuccessController({
  services,
  triggerUpload,
  uploadFailureMessage = '',
  showNativeLoading,
  hideNativeLoading,
  setPhysicalBackIntercept,
  openGooglePlay,
  copyText,
  createAbortController = () => new AbortController(),
  createOperation = createOperationId,
  random = Math.random,
  setTimer = setInterval,
  clearTimer = clearInterval,
  onBusinessFailure = () => {},
  onUploadFailure = () => {},
  onSuccessNotice = () => {},
  onCopySuccess = () => {},
  onCopyFailure = () => {},
  onNavigateOrderList = () => {},
  onNavigateOrderDetail = () => {},
  onNavigateBack = () => {},
} = {}) {
  if (!services || typeof services.loadRecommendedProducts !== 'function' || typeof services.loadOrders !== 'function') {
    throw new TypeError('Loan success services are required.')
  }
  if (typeof triggerUpload !== 'function') throw new TypeError('triggerUpload is required.')

  let state = createState()
  let disposed = false
  let initialized = false
  let systemTime = ''
  let instanceId = 0
  let loadCycleId = 0
  let submissionId = 0
  let loadController = null
  let submissionController = null
  let reviewGateController = null
  let reviewSubmitController = null
  let reviewGateInFlight = false
  let nativeLoadingVisible = false
  let backInterceptEnabled = false
  let interceptCountdownTimer = null
  const listeners = new Set()
  const physicalBackProxy = createConsumerProxy()

  function emit(partial = {}) {
    if (disposed) return
    state = Object.freeze({ ...state, ...partial })
    listeners.forEach((listener) => listener(state))
  }

  function isCurrent(id) {
    return isCurrentRequest(id, instanceId, disposed)
  }

  function isCurrentSubmission(id) {
    return !disposed && id === submissionId
  }

  function isCurrentCycle(id) {
    return !disposed && id === loadCycleId
  }

  function invalidate() {
    instanceId += 1
    loadCycleId += 1
    submissionId += 1
    loadController?.abort()
    submissionController?.abort()
    reviewGateController?.abort()
    reviewSubmitController?.abort()
    loadController = null
    submissionController = null
    reviewGateController = null
    reviewSubmitController = null
    reviewGateInFlight = false
    stopInterceptCountdown()
  }

  function stopInterceptCountdown() {
    if (interceptCountdownTimer === null) return
    clearTimer(interceptCountdownTimer)
    interceptCountdownTimer = null
  }

  function startInterceptCountdown() {
    stopInterceptCountdown()
    emit({ interceptCountdown: INTERCEPT_COUNTDOWN_SECONDS })
    interceptCountdownTimer = setTimer(() => {
      if (disposed || state.overlay !== OVERLAY_STATES.backIntercept) {
        stopInterceptCountdown()
        return
      }
      const next = Math.max(0, state.interceptCountdown - 1)
      emit({ interceptCountdown: next })
      if (next === 0) stopInterceptCountdown()
    }, 1000)
  }

  function showNativeLoadingOnce() {
    if (nativeLoadingVisible) return
    nativeLoadingVisible = true
    try { showNativeLoading?.() } catch {}
  }

  function hideNativeLoadingOnce() {
    if (!nativeLoadingVisible) return
    nativeLoadingVisible = false
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

  function setRecommendationProducts(products) {
    const selectedIds = products.map((product) => product.id)
    emit({
      rootState: ROOT_STATES.recommendation,
      products: Object.freeze([...products]),
      selectedIds: Object.freeze([...selectedIds]),
      selectedCount: selectedIds.length,
      selectedAmount: selectedAmount(products, selectedIds),
      orders: Object.freeze([]),
      loadingBarStatus: null,
      submitting: false,
      overlay: null,
      reviewOrigin: null,
    })
  }

  function setEmptyResult() {
    emit({
      rootState: ROOT_STATES.emptyResult,
      products: Object.freeze([]),
      selectedIds: Object.freeze([]),
      selectedCount: 0,
      selectedAmount: '0',
      orders: Object.freeze([]),
      loadingBarStatus: null,
      submitting: false,
      overlay: null,
      reviewOrigin: null,
    })
  }

  function setOrderList(orders) {
    emit({
      rootState: ROOT_STATES.orderList,
      products: Object.freeze([]),
      selectedIds: Object.freeze([]),
      selectedCount: 0,
      selectedAmount: '0',
      orders: Object.freeze([...orders]),
      loadingBarStatus: null,
      submitting: false,
      overlay: null,
      reviewOrigin: null,
    })
  }

  function completeNavigation(callback) {
    invalidate()
    disableBackIntercept()
    hideNativeLoadingOnce()
    emit({
      rootState: ROOT_STATES.inactive,
      overlay: null,
      reviewOrigin: null,
      loadingBarStatus: null,
      submitting: false,
      reviewSubmitting: false,
      navigationLocked: true,
    })
    callback()
  }

  function navigateBack() {
    completeNavigation(onNavigateBack)
  }

  function navigateToOrderList() {
    completeNavigation(onNavigateOrderList)
  }

  function completeReviewFlow(origin) {
    if (origin === REVIEW_ORIGINS.orderListMain) {
      navigateToOrderList()
      return
    }
    navigateBack()
  }

  function handleBusinessFailure(result) {
    const message = textMessage(result?.message)
    if (message) onBusinessFailure(message)
  }

  function handleUploadFailure(status) {
    if (!['collect_failed', 'upload_failed', 'unavailable'].includes(status)) return
    const message = textMessage(uploadFailureMessage)
    if (message) onUploadFailure(message)
  }

  async function loadOrders(id, signal) {
    let result
    try {
      result = await services.loadOrders({ startApplyTime: systemTime, signal })
    } catch (error) {
      if (!isCurrentCycle(id)) return
      if (isBusinessHandledError(error)) {
        hideNativeLoadingOnce()
        setEmptyResult()
        return
      }
      hideNativeLoadingOnce()
      setEmptyResult()
      return
    }
    if (!isCurrentCycle(id)) return
    hideNativeLoadingOnce()
    if (result?.type === 'success') {
      setOrderList(result.orders)
      return
    }
    if (result?.type === 'business_failure') handleBusinessFailure(result)
    setEmptyResult()
  }

  async function loadProducts(id, signal) {
    let result
    try {
      result = await services.loadRecommendedProducts({ signal })
    } catch (error) {
      if (!isCurrentCycle(id)) return
      if (isBusinessHandledError(error)) {
        hideNativeLoadingOnce()
        setEmptyResult()
        return
      }
      hideNativeLoadingOnce()
      setEmptyResult()
      return
    }
    if (!isCurrentCycle(id)) return
    if (result?.type === 'success') {
      hideNativeLoadingOnce()
      setRecommendationProducts(result.products)
      return
    }
    if (result?.type === 'empty') {
      void loadOrders(id, signal)
      return
    }
    if (result?.type === 'business_failure') handleBusinessFailure(result)
    hideNativeLoadingOnce()
    setEmptyResult()
  }

  function startLoadCycle() {
    loadController?.abort()
    loadCycleId += 1
    const id = loadCycleId
    loadController = createAbortController()
    emit({
      rootState: ROOT_STATES.loading,
      products: Object.freeze([]),
      selectedIds: Object.freeze([]),
      selectedCount: 0,
      selectedAmount: '0',
      orders: Object.freeze([]),
      loadingBarStatus: null,
      submitting: false,
      overlay: null,
      reviewOrigin: null,
    })
    showNativeLoadingOnce()
    void loadProducts(id, loadController.signal)
  }

  async function runReviewGate(id, origin, signal) {
    let result
    try {
      result = await services.getReviewPromptEnabled({ signal })
    } catch (error) {
      if (!isCurrent(id)) return
      if (isBusinessHandledError(error)) {
        completeReviewFlow(origin)
        return
      }
      completeReviewFlow(origin)
      return
    }
    if (!isCurrent(id)) return
    if (result?.type === 'success' && result.enabled === true) {
      emit({
        overlay: OVERLAY_STATES.reviewPrompt,
        reviewOrigin: origin,
        reviewRating: 5,
        reviewContent: '',
        recommendedComment: pickRecommendedComment(random),
        reviewSubmitting: false,
      })
      return
    }
    if (result?.type === 'business_failure') handleBusinessFailure(result)
    completeReviewFlow(origin)
  }

  function requestReviewGate(origin) {
    if (
      disposed
      || state.navigationLocked
      || ![ROOT_STATES.orderList, ROOT_STATES.emptyResult].includes(state.rootState)
      || state.overlay !== null
      || reviewGateInFlight
    ) return false

    const id = instanceId
    reviewGateInFlight = true
    reviewGateController = createAbortController()
    void runReviewGate(id, origin, reviewGateController.signal).finally(() => {
      if (!isCurrent(id)) return
      reviewGateInFlight = false
      reviewGateController = null
    })
    return true
  }

  async function runSubmission(id, signal) {
    let uploadResult
    try {
      uploadResult = await triggerUpload({
        operationId: createOperation(id),
        signal,
        onStatus(status) {
          if (
            !isCurrentSubmission(id)
            || submissionController === null
            || (status !== 'collecting' && status !== 'uploading')
          ) return
          emit({ loadingBarStatus: status })
        },
      })
    } catch {
      uploadResult = Object.freeze({ status: 'unavailable' })
    }
    if (!isCurrentSubmission(id)) return

    if (uploadResult?.status === 'cancelled') {
      submissionController = null
      emit({ rootState: ROOT_STATES.recommendation, loadingBarStatus: null, submitting: false })
      return
    }
    if (uploadResult?.status !== 'success') {
      submissionController = null
      handleUploadFailure(uploadResult?.status)
      emit({ rootState: ROOT_STATES.recommendation, loadingBarStatus: null, submitting: false })
      return
    }

    emit({ loadingBarStatus: 'applying' })
    let preApplicationResult
    try {
      preApplicationResult = await services.preApply({
        productIds: [...state.selectedIds],
        signal,
      })
    } catch (error) {
      if (!isCurrentSubmission(id)) return
      submissionController = null
      emit({ rootState: ROOT_STATES.recommendation, loadingBarStatus: null, submitting: false })
      if (isBusinessHandledError(error)) return
      return
    }
    if (!isCurrentSubmission(id)) return
    if (preApplicationResult?.type !== 'success') {
      submissionController = null
      if (preApplicationResult?.type === 'business_failure') handleBusinessFailure(preApplicationResult)
      emit({ rootState: ROOT_STATES.recommendation, loadingBarStatus: null, submitting: false })
      return
    }

    let applicationResult
    try {
      applicationResult = await services.apply({
        orderIds: preApplicationResult.orderIds,
        signal,
      })
    } catch (error) {
      if (!isCurrentSubmission(id)) return
      submissionController = null
      emit({ rootState: ROOT_STATES.recommendation, loadingBarStatus: null, submitting: false })
      if (isBusinessHandledError(error)) return
      return
    }
    if (!isCurrentSubmission(id)) return
    submissionController = null
    if (applicationResult?.type === 'success') {
      emit({ rootState: ROOT_STATES.recommendation, loadingBarStatus: null, submitting: false })
      startLoadCycle()
      try { onSuccessNotice() } catch {}
      return
    }
    if (applicationResult?.type === 'business_failure') handleBusinessFailure(applicationResult)
    emit({ rootState: ROOT_STATES.recommendation, loadingBarStatus: null, submitting: false })
  }

  function requestBack() {
    if (disposed || state.navigationLocked) return false
    if (state.overlay === OVERLAY_STATES.backIntercept) {
      stopInterceptCountdown()
      emit({ overlay: null })
      return true
    }
    if (state.overlay === OVERLAY_STATES.reviewSubmitting) return false
    if (state.overlay === OVERLAY_STATES.reviewPrompt) {
      const origin = state.reviewOrigin
      emit({ overlay: null, reviewSubmitting: false, reviewOrigin: null })
      completeReviewFlow(origin)
      return true
    }
    if (state.rootState === ROOT_STATES.recommendation) {
      emit({ overlay: OVERLAY_STATES.backIntercept })
      startInterceptCountdown()
      return true
    }
    if ([ROOT_STATES.orderList, ROOT_STATES.emptyResult].includes(state.rootState)) {
      return requestReviewGate(REVIEW_ORIGINS.return)
    }
    navigateBack()
    return true
  }

  function handlePhysicalBack() {
    requestBack()
  }

  function toggleProduct(productId) {
    if (disposed || state.rootState !== ROOT_STATES.recommendation || state.submitting) return false
    if (typeof productId !== 'string' || productId.length === 0) return false
    if (!state.products.some((product) => product.id === productId)) return false
    const selected = new Set(state.selectedIds)
    if (selected.has(productId)) {
      if (selected.size <= 1) return false
      selected.delete(productId)
    } else {
      selected.add(productId)
    }
    const selectedIds = state.products
      .filter((product) => selected.has(product.id))
      .map((product) => product.id)
    emit({
      selectedIds: Object.freeze(selectedIds),
      selectedCount: selectedIds.length,
      selectedAmount: selectedAmount(state.products, selectedIds),
    })
    return true
  }

  function submitRecommendation() {
    if (
      disposed
      || state.rootState !== ROOT_STATES.recommendation
      || state.submitting
      || state.navigationLocked
      || state.selectedCount < 1
    ) return false
    const id = submissionId + 1
    submissionId = id
    submissionController = createAbortController()
    emit({ rootState: ROOT_STATES.submitting, submitting: true, loadingBarStatus: 'collecting' })
    void runSubmission(id, submissionController.signal)
    return true
  }

  async function submitReview() {
    if (
      disposed
      || state.overlay !== OVERLAY_STATES.reviewPrompt
      || state.reviewSubmitting
      || !Number.isInteger(state.reviewRating)
      || state.reviewRating < 1
      || state.reviewRating > 5
    ) return false

    const origin = state.reviewOrigin
    const content = state.reviewRating >= 4 ? state.recommendedComment : state.reviewContent
    if (state.reviewRating >= 4) {
      let copied = false
      try { copied = await copyText?.(content) === true } catch { copied = false }
      if (!isCurrent(instanceId) || state.overlay !== OVERLAY_STATES.reviewPrompt) return false
      if (!copied) {
        onCopyFailure()
        return false
      }
      onCopySuccess()
    }
    if (!isCurrent(instanceId) || state.overlay !== OVERLAY_STATES.reviewPrompt) return false

    reviewSubmitController = createAbortController()
    emit({ overlay: OVERLAY_STATES.reviewSubmitting, reviewSubmitting: true })
    let result
    try {
      result = await services.saveReview({
        grade: state.reviewRating,
        content,
        signal: reviewSubmitController.signal,
      })
    } catch (error) {
      if (!isCurrent(instanceId)) return false
      reviewSubmitController = null
      emit({ overlay: OVERLAY_STATES.reviewPrompt, reviewSubmitting: false })
      if (isBusinessHandledError(error)) return false
      return false
    }
    if (!isCurrent(instanceId)) return false
    reviewSubmitController = null
    if (result?.type === 'success') {
      try { openGooglePlay?.() } catch {}
      emit({ overlay: null, reviewSubmitting: false, reviewOrigin: null })
      completeReviewFlow(origin)
      return true
    }
    if (result?.type === 'business_failure') handleBusinessFailure(result)
    emit({ overlay: OVERLAY_STATES.reviewPrompt, reviewSubmitting: false })
    return false
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
        emit({ entryValid: false, rootState: ROOT_STATES.inactive })
        return false
      }
      systemTime = query.systemTime
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
      instanceId += 1
      emit({ entryValid: true })
      startLoadCycle()
      return true
    },
    requestBack,
    toggleProduct,
    submitRecommendation,
    openReviewFromMain() {
      return requestReviewGate(REVIEW_ORIGINS.orderListMain)
    },
    closeBackIntercept() {
      if (state.overlay !== OVERLAY_STATES.backIntercept) return false
      stopInterceptCountdown()
      emit({ overlay: null })
      return true
    },
    cancelBackIntercept() {
      if (state.overlay !== OVERLAY_STATES.backIntercept) return false
      stopInterceptCountdown()
      emit({ overlay: null })
      navigateBack()
      return true
    },
    cancelReview() {
      if (state.overlay !== OVERLAY_STATES.reviewPrompt) return false
      const origin = state.reviewOrigin
      emit({ overlay: null, reviewSubmitting: false, reviewOrigin: null })
      completeReviewFlow(origin)
      return true
    },
    setReviewRating(rating) {
      if (
        disposed
        || state.overlay !== OVERLAY_STATES.reviewPrompt
        || state.reviewSubmitting
        || !Number.isInteger(rating)
        || rating < 1
        || rating > 5
      ) return false
      emit({ reviewRating: rating })
      return true
    },
    setReviewContent(content) {
      if (
        disposed
        || state.overlay !== OVERLAY_STATES.reviewPrompt
        || state.reviewSubmitting
        || state.reviewRating > 3
        || typeof content !== 'string'
      ) return false
      emit({ reviewContent: content.slice(0, REVIEW_CONTENT_MAX_LENGTH) })
      return true
    },
    refreshRecommendedComment() {
      if (
        disposed
        || state.overlay !== OVERLAY_STATES.reviewPrompt
        || state.reviewSubmitting
        || state.reviewRating < 4
      ) return false
      emit({ recommendedComment: pickRecommendedComment(random) })
      return true
    },
    submitReview,
    dispose() {
      if (disposed) return
      invalidate()
      disableBackIntercept()
      hideNativeLoadingOnce()
      disposed = true
      listeners.clear()
    },
  })
}
