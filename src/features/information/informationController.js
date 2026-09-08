import { isCompleteInformationForm, isValidInformationSelection } from './informationOptions.js'

const INITIAL_VALUES = Object.freeze({})

function createState(values = INITIAL_VALUES) {
  return Object.freeze({
    values: Object.freeze({ ...values }),
    activeField: null,
    leaveConfirmationOpen: false,
    successOpen: false,
    submitting: false,
  })
}

export function createInformationController({
  submitService,
  showNativeLoading,
  hideNativeLoading,
  setPhysicalBackIntercept,
  schedule = globalThis.setTimeout,
  cancelSchedule = globalThis.clearTimeout,
  onBusinessFailure = () => {},
  onNavigateContacts = () => {},
  onNavigateBack = () => {},
} = {}) {
  if (!submitService || typeof submitService.submit !== 'function') throw new TypeError('submitService is required.')

  let state = createState()
  let disposed = false
  let submissionId = 0
  let loadingSubmissionId = null
  let firstFieldTimer = null
  let successTimer = null
  let backInterceptEnabled = false
  const listeners = new Set()

  function emit() {
    listeners.forEach((listener) => listener(state))
  }

  function update(partial) {
    if (disposed) return
    state = Object.freeze({ ...state, ...partial })
    emit()
  }

  function closeBackIntercept() {
    if (!backInterceptEnabled) return
    backInterceptEnabled = false
    try { setPhysicalBackIntercept?.({ enabled: false }) } catch {}
  }

  function hideLoadingForCurrentSubmission(id) {
    if (loadingSubmissionId !== id) return
    loadingSubmissionId = null
    try { hideNativeLoading?.() } catch {}
  }

  function openLeaveConfirmation() {
    if (disposed || state.successOpen) return
    update({ leaveConfirmationOpen: true, activeField: null })
  }

  function select(fieldKey, optionKey) {
    if (disposed || state.submitting || !isValidInformationSelection(fieldKey, optionKey)) return false
    const current = state.values[fieldKey]
    if (current === optionKey) return false
    const nextValues = Object.freeze({ ...state.values, [fieldKey]: optionKey })
    const fieldOrder = Object.keys({ marital: 1, education: 1, occupation: 1, monthlyIncome: 1, loanPurpose: 1, houseType: 1 })
    const nextIndex = fieldOrder.indexOf(fieldKey) + 1
    const nextField = fieldOrder[nextIndex]
    update({ values: nextValues, activeField: !nextValues[nextField] ? nextField ?? null : null })
    return true
  }

  function openField(fieldKey) {
    if (disposed || state.submitting || !Object.hasOwn({ marital: 1, education: 1, occupation: 1, monthlyIncome: 1, loanPurpose: 1, houseType: 1 }, fieldKey)) return
    update({ activeField: fieldKey })
  }

  async function submit() {
    if (disposed || state.submitting || !isCompleteInformationForm(state.values)) return false
    const id = submissionId + 1
    submissionId = id
    loadingSubmissionId = id
    update({ submitting: true, activeField: null })
    try { showNativeLoading?.() } catch {}

    let result
    try {
      result = await submitService.submit(state.values)
    } catch {
      result = Object.freeze({ type: 'exception' })
    }
    if (disposed || id !== submissionId) return false

    hideLoadingForCurrentSubmission(id)
    if (result?.type === 'success') {
      update({ submitting: false, successOpen: true })
      successTimer = schedule(() => {
        if (disposed || id !== submissionId) return
        update({ successOpen: false })
        closeBackIntercept()
        onNavigateContacts()
      }, 1000)
      return true
    }

    update({ submitting: false })
    if (result?.type === 'business_failure') onBusinessFailure(result.message)
    return false
  }

  return Object.freeze({
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },
    initialize() {
      if (disposed) return
      firstFieldTimer = schedule(() => openField('marital'), 500)
      try {
        const requestId = setPhysicalBackIntercept?.({ enabled: true, onIntercept: openLeaveConfirmation })
        backInterceptEnabled = requestId !== null && requestId !== undefined
      } catch {}
    },
    openField,
    closeOptions: () => update({ activeField: null }),
    select,
    openLeaveConfirmation,
    cancelLeave: () => update({ leaveConfirmationOpen: false }),
    confirmLeave() {
      if (disposed) return
      update({ leaveConfirmationOpen: false })
      closeBackIntercept()
      onNavigateBack()
    },
    submit,
    dispose() {
      if (disposed) return
      disposed = true
      submissionId += 1
      if (firstFieldTimer !== null) cancelSchedule(firstFieldTimer)
      if (successTimer !== null) cancelSchedule(successTimer)
      if (loadingSubmissionId !== null) {
        try { hideNativeLoading?.() } catch {}
        loadingSubmissionId = null
      }
      closeBackIntercept()
      listeners.clear()
    },
  })
}
