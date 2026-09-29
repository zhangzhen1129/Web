import { isBusinessHandledError } from '../../shared/businessError/index.js'
import {
  COMPLAINT_LIST_CONTENT,
  getComplaintRecordStatusPresentation,
} from './complaintListContent.js'

function textMessage(value) {
  if (typeof value !== 'string') return ''
  const message = value.trim()
  return message && !/[<>]/.test(message) ? message : ''
}

function safeRequestMessage(error) {
  return textMessage(error?.displayMessage) || textMessage(error?.message) || COMPLAINT_LIST_CONTENT.requestFailureFallback
}

function createInitialState() {
  return Object.freeze({
    active: false,
    loading: false,
    loaded: false,
    records: Object.freeze([]),
    empty: false,
    navigationLocked: false,
  })
}

function createState(partial = {}) {
  return Object.freeze({ ...createInitialState(), ...partial })
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

function mapRecord(record) {
  const status = getComplaintRecordStatusPresentation(record)
  if (!status) return null
  return Object.freeze({
    ...record,
    statusText: status.text,
    statusModifier: status.modifier,
  })
}

export function createComplaintListController({
  services,
  showNativeLoading,
  hideNativeLoading,
  goBack,
  replaceComplainHome,
  hasHistoryBack = defaultHasHistoryBack,
  createAbortController = () => new AbortController(),
  onBusinessFailure = () => {},
  onRequestFailure = () => {},
  onInvalidResponse = () => {},
} = {}) {
  if (!services || typeof services.loadComplaintRecords !== 'function') {
    throw new TypeError('Complaint list services are required.')
  }
  if (typeof goBack !== 'function') throw new TypeError('Complaint list history callback is required.')
  if (typeof replaceComplainHome !== 'function') throw new TypeError('Complaint list return replacement is required.')

  let state = createInitialState()
  let disposed = false
  let started = false
  let requestSequence = 0
  let requestController = null
  let loadingId = null
  const listeners = new Set()

  function emit(partial = {}) {
    if (disposed) return
    state = createState({ ...state, ...partial })
    listeners.forEach((listener) => listener(state))
  }

  function isCurrent(id) {
    return !disposed && state.active && id === requestSequence && loadingId === id
  }

  function showLoading(id) {
    if (loadingId !== null) return
    loadingId = id
    try {
      showNativeLoading?.()
    } catch {}
  }

  function hideLoading(id) {
    if (loadingId !== id) return
    loadingId = null
    try {
      hideNativeLoading?.()
    } catch {}
  }

  function hideAllLoading() {
    if (loadingId === null) return
    hideLoading(loadingId)
  }

  function invalidateRequest() {
    requestSequence += 1
    requestController?.abort?.()
    requestController = null
  }

  function finish(id, partial, notice) {
    if (!isCurrent(id)) return
    requestController = null
    hideLoading(id)
    emit(partial)
    if (notice) callWithoutThrowing(notice.callback, notice.message)
  }

  function handleResult(id, result) {
    if (!isCurrent(id)) return

    if (result?.type === 'success') {
      if (!Array.isArray(result.records)) {
        finish(id, { loading: false, loaded: true, records: Object.freeze([]), empty: false }, {
          callback: onInvalidResponse,
          message: COMPLAINT_LIST_CONTENT.invalidResponseMessage,
        })
        return
      }

      const records = result.records.map(mapRecord).filter(Boolean)
      if (records.length !== result.records.length) {
        finish(id, { loading: false, loaded: true, records: Object.freeze([]), empty: false }, {
          callback: onInvalidResponse,
          message: COMPLAINT_LIST_CONTENT.invalidResponseMessage,
        })
        return
      }

      finish(id, {
        loading: false,
        loaded: true,
        records: Object.freeze(records),
        empty: records.length === 0,
      })
      return
    }

    if (result?.type === 'business_failure') {
      finish(id, { loading: false, loaded: true, records: Object.freeze([]), empty: false })
      const message = textMessage(result.message)
      if (message) callWithoutThrowing(onBusinessFailure, message)
      return
    }

    if (result?.type === 'request_failure') {
      finish(id, { loading: false, loaded: true, records: Object.freeze([]), empty: false }, {
        callback: onRequestFailure,
        message: textMessage(result.message) || COMPLAINT_LIST_CONTENT.requestFailureFallback,
      })
      return
    }

    if (result?.type === 'invalid_response') {
      finish(id, { loading: false, loaded: true, records: Object.freeze([]), empty: false }, {
        callback: onInvalidResponse,
        message: COMPLAINT_LIST_CONTENT.invalidResponseMessage,
      })
      return
    }

    if (result?.type === 'canceled') {
      finish(id, { loading: false, loaded: true, records: Object.freeze([]), empty: false })
      return
    }

    if (result?.type === 'handled_failure') {
      finish(id, { loading: false, loaded: true, records: Object.freeze([]), empty: false })
      return
    }

    finish(id, { loading: false, loaded: true, records: Object.freeze([]), empty: false }, {
      callback: onInvalidResponse,
      message: COMPLAINT_LIST_CONTENT.invalidResponseMessage,
    })
  }

  function start() {
    if (disposed || started) return false
    started = true

    const id = requestSequence + 1
    requestSequence = id

    try {
      requestController = createAbortController()
    } catch {
      requestController = null
    }

    emit({
      active: true,
      loading: true,
      loaded: false,
      records: Object.freeze([]),
      empty: false,
      navigationLocked: false,
    })
    showLoading(id)

    const request = Promise.resolve()
      .then(() => services.loadComplaintRecords({ signal: requestController?.signal }))
      .then((result) => {
        handleResult(id, result)
      })
      .catch((error) => {
        if (!isCurrent(id)) return
        if (error?.category === 'canceled') {
          handleResult(id, Object.freeze({ type: 'canceled' }))
        } else if (isBusinessHandledError(error)) {
          handleResult(id, Object.freeze({ type: 'handled_failure' }))
        } else {
          handleResult(id, Object.freeze({
            type: 'request_failure',
            message: safeRequestMessage(error),
          }))
        }
      })
      .finally(() => {
        if (isCurrent(id)) {
          requestController = null
          hideLoading(id)
        }
      })

    void request
    return true
  }

  function requestBack() {
    if (disposed || !state.active || state.navigationLocked) return false

    invalidateRequest()
    hideAllLoading()
    emit({
      active: false,
      loading: false,
      navigationLocked: true,
    })

    const useHistoryBack = (() => {
      try {
        return hasHistoryBack() === true
      } catch {
        return false
      }
    })()

    return useHistoryBack
      ? callWithoutThrowing(goBack)
      : callWithoutThrowing(replaceComplainHome)
  }

  function deactivate() {
    if (disposed || !state.active) return false

    invalidateRequest()
    hideAllLoading()
    emit({
      active: false,
      loading: false,
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
    start,
    requestBack,
    deactivate,
    dispose() {
      if (disposed) return
      invalidateRequest()
      hideAllLoading()
      state = createState({
        ...state,
        active: false,
        loading: false,
        navigationLocked: true,
      })
      disposed = true
      listeners.clear()
    },
  })
}
