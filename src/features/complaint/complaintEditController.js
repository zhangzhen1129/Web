import { isBusinessHandledError } from '../../shared/businessError/index.js'
import { COMPLAINT_EDIT_CONTENT } from './complaintEditContent.js'

export const COMPLAINT_DETAILS_MAX_LENGTH = 100

function textMessage(value) {
  if (typeof value !== 'string') return ''
  const message = value.trim()
  return message && !/[<>]/.test(message) ? message : ''
}

function safeRequestMessage(error) {
  return textMessage(error?.displayMessage) || textMessage(error?.message) || COMPLAINT_EDIT_CONTENT.requestFailureFallback
}

function normalizeSubmitDetails(value) {
  if (typeof value !== 'string') return ''
  return value.trim() ? value : ''
}

export function maskComplaintContact(value) {
  if (typeof value !== 'string') return ''
  const contact = value.trim()
  if (!contact) return ''
  if (contact.length < 7) return '*'.repeat(contact.length)
  return `${contact.slice(0, 3)}****${contact.slice(-3)}`
}

function createInitialState() {
  return Object.freeze({
    active: false,
    agency: '',
    question: '',
    details: '',
    detailsCount: 0,
    maskedContact: '',
    submitEnabled: false,
    submitting: false,
    navigationLocked: false,
  })
}

function canSubmitFrom(state) {
  return state.active
    && !state.submitting
    && !state.navigationLocked
    && normalizeSubmitDetails(state.details).length > 0
}

function createState(partial = {}) {
  const next = { ...createInitialState(), ...partial }
  return Object.freeze({ ...next, submitEnabled: canSubmitFrom(next) })
}

function callWithoutThrowing(callback, argument) {
  try {
    const result = callback?.(argument)
    if (result && typeof result.catch === 'function') result.catch(() => {})
    return true
  } catch {
    return false
  }
}

function defaultHasHistoryBack() {
  return typeof window !== 'undefined' && Boolean(window.history.state?.back)
}

export function createComplaintEditController({
  services,
  showNativeLoading,
  hideNativeLoading,
  goBack,
  replaceHome,
  replaceComplainHome,
  hasHistoryBack = defaultHasHistoryBack,
  createAbortController = () => new AbortController(),
  onBusinessFailure = () => {},
  onRequestFailure = () => {},
  onSuccessNotice = () => {},
} = {}) {
  if (!services || typeof services.saveComplaintFeedback !== 'function') {
    throw new TypeError('Complaint edit services are required.')
  }
  if (typeof goBack !== 'function') throw new TypeError('Complaint edit history callback is required.')
  if (typeof replaceHome !== 'function') throw new TypeError('Complaint edit home replacement is required.')
  if (typeof replaceComplainHome !== 'function') throw new TypeError('Complaint edit return replacement is required.')

  let state = createInitialState()
  let disposed = false
  let submissionId = 0
  let requestController = null
  let loadingSubmissionId = null
  const listeners = new Set()

  function emit(partial = {}) {
    if (disposed) return
    state = createState({ ...state, ...partial })
    listeners.forEach((listener) => listener(state))
  }

  function isCurrent(id) {
    return !disposed && state.active && id === submissionId
  }

  function showLoading(id) {
    if (loadingSubmissionId !== null) return
    loadingSubmissionId = id
    try {
      showNativeLoading?.()
    } catch {}
  }

  function hideLoading(id) {
    if (loadingSubmissionId !== id) return
    loadingSubmissionId = null
    try {
      hideNativeLoading?.()
    } catch {}
  }

  function hideAllLoading() {
    if (loadingSubmissionId === null) return
    hideLoading(loadingSubmissionId)
  }

  function invalidateRequest() {
    submissionId += 1
    requestController?.abort?.()
    requestController = null
  }

  function hasHistory() {
    try {
      return hasHistoryBack() === true
    } catch {
      return false
    }
  }

  function navigateBack() {
    if (hasHistory()) return callWithoutThrowing(goBack)
    return callWithoutThrowing(replaceHome)
  }

  function navigateAfterSuccess() {
    if (hasHistory()) return callWithoutThrowing(goBack)
    return callWithoutThrowing(replaceComplainHome)
  }

  async function submit() {
    if (!state.submitEnabled) return false

    const details = normalizeSubmitDetails(state.details)
    if (!details) return false

    const id = submissionId + 1
    submissionId = id

    try {
      requestController = createAbortController()
    } catch {
      requestController = null
    }

    emit({ submitting: true })
    showLoading(id)

    let result
    try {
      result = await services.saveComplaintFeedback({
        agency: state.agency,
        question: state.question,
        details,
        signal: requestController?.signal,
      })
    } catch (error) {
      if (error?.category === 'canceled') {
        result = Object.freeze({ type: 'canceled' })
      } else if (isBusinessHandledError(error)) {
        result = Object.freeze({ type: 'handled_failure' })
      } else {
        result = Object.freeze({ type: 'request_failure', message: safeRequestMessage(error) })
      }
    }

    if (!isCurrent(id)) {
      hideLoading(id)
      return false
    }

    requestController = null
    hideLoading(id)

    if (result?.type === 'success') {
      submissionId += 1
      emit({
        submitting: false,
        navigationLocked: true,
      })
      callWithoutThrowing(onSuccessNotice)
      navigateAfterSuccess()
      return true
    }

    emit({ submitting: false })

    if (result?.type === 'business_failure') {
      const message = textMessage(result.message)
      if (message) callWithoutThrowing(onBusinessFailure, message)
    } else if (result?.type === 'request_failure') {
      callWithoutThrowing(onRequestFailure, textMessage(result.message) || COMPLAINT_EDIT_CONTENT.requestFailureFallback)
    } else if (result?.type === 'invalid_response') {
      callWithoutThrowing(onRequestFailure, COMPLAINT_EDIT_CONTENT.invalidResponseMessage)
    }

    return false
  }

  function requestBack() {
    if (disposed || !state.active || state.navigationLocked) return false

    invalidateRequest()
    hideAllLoading()
    emit({
      submitting: false,
      navigationLocked: true,
    })
    navigateBack()
    return true
  }

  function initialize({ agency, question, mobile } = {}) {
    if (disposed || state.active) return false

    emit({
      active: true,
      agency: typeof agency === 'string' ? agency : '',
      question: typeof question === 'string' ? question : '',
      details: '',
      detailsCount: 0,
      maskedContact: maskComplaintContact(mobile),
      submitEnabled: false,
      submitting: false,
      navigationLocked: false,
    })
    return true
  }

  function updateDetails(value) {
    if (!state.active || state.submitting || state.navigationLocked || typeof value !== 'string') return false
    const details = value.slice(0, COMPLAINT_DETAILS_MAX_LENGTH)
    if (details === state.details) return false
    emit({
      details,
      detailsCount: details.length,
    })
    return true
  }

  function deactivate() {
    if (disposed || !state.active) return false

    invalidateRequest()
    hideAllLoading()
    emit({
      active: false,
      submitting: false,
      navigationLocked: true,
    })
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
    initialize,
    updateDetails,
    submit,
    requestBack,
    deactivate,
    dispose() {
      if (disposed) return
      if (state.active) deactivate()
      disposed = true
      listeners.clear()
    },
  })
}
