import { COMPLAINT_CONTENT } from './complaintContent.js'

const AGENCY_BY_VALUE = new Map(
  COMPLAINT_CONTENT.agencyOptions.map((agency) => [agency.value, agency]),
)
const QUESTION_VALUES = new Set(COMPLAINT_CONTENT.questionTypes.map((question) => question.value))

function createInitialState() {
  return Object.freeze({
    selectedAgency: null,
    questionPopupVisible: false,
    customerServiceVisible: false,
    showRedDot: false,
    navigationLocked: false,
    active: false,
  })
}

function defaultHasHistoryBack() {
  return typeof window !== 'undefined' && Boolean(window.history.state?.back)
}

function callWithoutThrowing(callback, argument) {
  try {
    const result = callback(argument)
    if (result && typeof result.catch === 'function') result.catch(() => {})
    return true
  } catch {
    return false
  }
}

export function createComplaintController(options = {}) {
  const services = options.services
  const navigate = options.navigate
  const goBack = options.goBack
  const replaceHome = options.replaceHome
  const markPageInactive = options.markPageInactive ?? (() => {})
  const hasHistoryBack = options.hasHistoryBack ?? defaultHasHistoryBack
  const createAbortController = options.createAbortController ?? (() => new AbortController())

  if (!services || typeof services.loadComplaintRedDot !== 'function') {
    throw new TypeError('Complaint services are required.')
  }
  if (typeof navigate !== 'function') throw new TypeError('Complaint navigation callback is required.')
  if (typeof goBack !== 'function') throw new TypeError('Complaint history callback is required.')
  if (typeof replaceHome !== 'function') throw new TypeError('Complaint home replacement is required.')

  let state = createInitialState()
  let disposed = false
  let started = false
  let requestId = 0
  let activeRequest = null
  let inactiveNotified = false
  const listeners = new Set()

  function emit(partial = {}) {
    if (disposed) return
    state = Object.freeze({ ...state, ...partial })
    listeners.forEach((listener) => listener(state))
  }

  function isCurrentRequest(id) {
    return !disposed && state.active && id === requestId
  }

  function notifyInactive() {
    if (inactiveNotified) return
    inactiveNotified = true
    callWithoutThrowing(markPageInactive)
  }

  function invalidateAsyncWork() {
    requestId += 1
    activeRequest?.abort?.()
    activeRequest = null
  }

  function closeOverlays() {
    return {
      questionPopupVisible: false,
      customerServiceVisible: false,
    }
  }

  function canInteract() {
    return !disposed && state.active && !state.navigationLocked
  }

  function lockNavigationAndRun(callback, location) {
    if (!canInteract()) return false
    emit({ navigationLocked: true })
    return callWithoutThrowing(callback, location)
  }

  function start() {
    if (disposed || started) return false
    started = true

    const id = requestId + 1
    requestId = id

    try {
      activeRequest = createAbortController()
    } catch {
      activeRequest = null
    }

    emit({
      active: true,
      showRedDot: false,
    })

    const request = Promise.resolve()
      .then(() => services.loadComplaintRedDot({ signal: activeRequest?.signal }))
      .then((result) => {
        if (!isCurrentRequest(id)) return
        emit({
          showRedDot: result?.type === 'success' && result.showRedDot === true,
        })
      })
      .catch(() => {
        if (!isCurrentRequest(id)) return
        emit({ showRedDot: false })
      })
      .finally(() => {
        if (isCurrentRequest(id) && activeRequest !== null) activeRequest = null
      })

    void request
    return true
  }

  function selectAgency(value) {
    if (!canInteract()) return false
    const agency = AGENCY_BY_VALUE.get(value)
    if (!agency) return false

    emit({
      selectedAgency: agency,
      questionPopupVisible: true,
    })
    return true
  }

  function closeQuestionPopup() {
    if (!canInteract() || !state.questionPopupVisible) return false
    emit({ questionPopupVisible: false })
    return true
  }

  function openCustomerService() {
    if (!canInteract()) return false
    emit({ customerServiceVisible: true })
    return true
  }

  function closeCustomerService() {
    if (!canInteract() || !state.customerServiceVisible) return false
    emit({ customerServiceVisible: false })
    return true
  }

  function selectQuestion(question) {
    if (!canInteract() || !state.questionPopupVisible) return false
    if (!state.selectedAgency || !QUESTION_VALUES.has(question)) return false

    return lockNavigationAndRun(navigate, {
      name: 'complainEdit',
      query: {
        type: state.selectedAgency.value,
        question,
      },
    })
  }

  function openComplaintList() {
    return lockNavigationAndRun(navigate, {
      name: 'complainList',
      query: {
        goBack: '1',
      },
    })
  }

  function requestBack() {
    if (!canInteract()) return false
    emit({ navigationLocked: true })

    let useHistoryBack = false
    try {
      useHistoryBack = hasHistoryBack() === true
    } catch {
      useHistoryBack = false
    }

    return useHistoryBack
      ? callWithoutThrowing(goBack)
      : callWithoutThrowing(replaceHome)
  }

  function deactivate() {
    if (disposed || !state.active) return false
    invalidateAsyncWork()
    emit({
      active: false,
      ...closeOverlays(),
    })
    notifyInactive()
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
    selectAgency,
    closeQuestionPopup,
    openCustomerService,
    closeCustomerService,
    selectQuestion,
    openComplaintList,
    requestBack,
    deactivate,
    dispose() {
      if (disposed) return
      invalidateAsyncWork()
      state = Object.freeze({
        ...state,
        active: false,
        ...closeOverlays(),
      })
      notifyInactive()
      disposed = true
      listeners.clear()
    },
  })
}