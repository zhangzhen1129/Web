import {
  createEmptyContacts,
  isCompleteContactsForm,
  isContactKey,
  isDuplicatePhoneNumber,
  isValidPhoneNumber,
  isValidRelationship,
  normalizePhoneNumber,
} from './contactForm.js'
import { isBusinessHandledError } from '../../shared/businessError/index.js'

export const CONTACT_DIALOG = Object.freeze({
  relationship: 'relationship',
  guide: 'guide',
  invalidPhone: 'invalid_phone',
  duplicatePhone: 'duplicate_phone',
  leave: 'leave',
  success: 'success',
})

function freezeContacts(contacts) {
  return Object.freeze({
    contact1: Object.freeze({ ...contacts.contact1 }),
    contact2: Object.freeze({ ...contacts.contact2 }),
  })
}

function createState() {
  return Object.freeze({
    contacts: createEmptyContacts(),
    dialog: null,
    activeContactKey: null,
    submitting: false,
  })
}

function safeRequestMessage(error) {
  if (typeof error?.displayMessage === 'string' && error.displayMessage.length > 0) return error.displayMessage
  if (typeof error?.message === 'string' && error.message.length > 0) return error.message
  return 'Unable to complete the request.'
}

export function createContactsController({
  submitService,
  contactSelection,
  showNativeLoading,
  hideNativeLoading,
  setPhysicalBackIntercept,
  createAbortController = () => new AbortController(),
  schedule = globalThis.setTimeout,
  cancelSchedule = globalThis.clearTimeout,
  onBusinessFailure = () => {},
  onRequestFailure = () => {},
  onNavigateIdentity = () => {},
  onNavigateBack = () => {},
} = {}) {
  if (!submitService || typeof submitService.submit !== 'function') throw new TypeError('submitService is required.')
  if (
    !contactSelection
    || typeof contactSelection.select !== 'function'
    || typeof contactSelection.cancel !== 'function'
    || typeof contactSelection.dispose !== 'function'
  ) {
    throw new TypeError('contactSelection is required.')
  }

  let state = createState()
  let initialized = false
  let disposed = false
  let contactGuideShown = false
  let pendingGuideContactKey = null
  let submissionId = 0
  let loadingSubmissionId = null
  let submitAbortController = null
  let successTimer = null
  let backInterceptEnabled = false
  let backConsumer = null
  const listeners = new Set()

  function emit() {
    listeners.forEach((listener) => listener(state))
  }

  function update(partial) {
    if (disposed) return
    state = Object.freeze({ ...state, ...partial })
    emit()
  }

  function replaceContact(contactKey, partial) {
    if (!isContactKey(contactKey)) return false
    const contacts = freezeContacts({
      ...state.contacts,
      [contactKey]: { ...state.contacts[contactKey], ...partial },
    })
    update({ contacts })
    return true
  }

  function hideLoadingForSubmission(id) {
    if (loadingSubmissionId !== id) return
    loadingSubmissionId = null
    try { hideNativeLoading?.() } catch {}
  }

  function releaseBackConsumer() {
    backConsumer = null
  }

  function disableBackIntercept() {
    releaseBackConsumer()
    if (!backInterceptEnabled) return
    backInterceptEnabled = false
    try { setPhysicalBackIntercept?.({ enabled: false }) } catch {}
  }

  function openLeaveConfirmation() {
    if (disposed || state.dialog === CONTACT_DIALOG.success) return
    pendingGuideContactKey = null
    update({ dialog: CONTACT_DIALOG.leave, activeContactKey: null })
  }

  function handleSelectionResult(contactKey, result) {
    if (disposed || state.submitting || !isContactKey(contactKey)) return
    if (result?.type === 'canceled' || result?.type === 'unavailable' || result?.type === 'not_completed') return
    if (result?.type === 'no_phone') {
      update({ dialog: CONTACT_DIALOG.invalidPhone, activeContactKey: null })
      return
    }
    if (result?.type !== 'selected') return

    const normalizedPhone = normalizePhoneNumber(result.phoneNumber)
    if (!isValidPhoneNumber(normalizedPhone)) {
      update({ dialog: CONTACT_DIALOG.invalidPhone, activeContactKey: null })
      return
    }
    if (isDuplicatePhoneNumber(state.contacts, normalizedPhone)) {
      update({ dialog: CONTACT_DIALOG.duplicatePhone, activeContactKey: null })
      return
    }
    replaceContact(contactKey, { name: result.name, phoneNumber: normalizedPhone })
  }

  function startContactSelection(contactKey) {
    if (disposed || state.submitting || !isContactKey(contactKey)) return false
    update({ dialog: null, activeContactKey: null })
    return contactSelection.select((result) => handleSelectionResult(contactKey, result))
  }

  async function submit() {
    if (disposed || state.submitting || state.dialog === CONTACT_DIALOG.success || !isCompleteContactsForm(state.contacts)) return false
    const id = submissionId + 1
    submissionId = id
    contactSelection.cancel()
    submitAbortController?.abort()
    submitAbortController = createAbortController()
    loadingSubmissionId = id
    update({ submitting: true, dialog: null, activeContactKey: null })
    try { showNativeLoading?.() } catch {}

    let result
    try {
      result = await submitService.submit(state.contacts, { signal: submitAbortController.signal })
    } catch (error) {
      if (submitAbortController.signal.aborted || error?.category === 'canceled') {
        result = Object.freeze({ type: 'canceled' })
      } else if (isBusinessHandledError(error)) {
        result = Object.freeze({ type: 'handled_failure' })
      } else {
        result = Object.freeze({ type: 'request_failure', message: safeRequestMessage(error) })
      }
    }
    if (disposed || id !== submissionId) return false
    submitAbortController = null
    hideLoadingForSubmission(id)

    if (result?.type === 'success') {
      update({ submitting: false, dialog: CONTACT_DIALOG.success })
      successTimer = schedule(() => {
        if (disposed || id !== submissionId) return
        update({ dialog: null })
        contactSelection.dispose()
        disableBackIntercept()
        onNavigateIdentity()
      }, 1000)
      return true
    }

    update({ submitting: false })
    if (result?.type === 'business_failure') onBusinessFailure(result.message)
    if (result?.type === 'request_failure') onRequestFailure(result.message)
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
      if (disposed || initialized) return
      initialized = true
      backConsumer = openLeaveConfirmation
      try {
        const requestId = setPhysicalBackIntercept?.({ enabled: true, onIntercept: (...args) => backConsumer?.(...args) })
        backInterceptEnabled = requestId !== null && requestId !== undefined
      } catch {
        releaseBackConsumer()
      }
    },
    openRelationship(contactKey) {
      if (disposed || state.submitting || !isContactKey(contactKey)) return false
      pendingGuideContactKey = null
      update({ dialog: CONTACT_DIALOG.relationship, activeContactKey: contactKey })
      return true
    },
    selectRelationship(contactKey, value) {
      if (disposed || state.submitting || state.activeContactKey !== contactKey || !isValidRelationship(value)) return false
      replaceContact(contactKey, { relationship: value })
      update({ dialog: null, activeContactKey: null })
      return true
    },
    updateName(contactKey, value) {
      if (disposed || state.submitting || typeof value !== 'string') return false
      return replaceContact(contactKey, { name: value })
    },
    requestPhone(contactKey) {
      if (disposed || state.submitting || !isContactKey(contactKey)) return false
      if (!contactGuideShown) {
        pendingGuideContactKey = contactKey
        update({ dialog: CONTACT_DIALOG.guide, activeContactKey: null })
        return true
      }
      return startContactSelection(contactKey)
    },
    confirmContactGuide() {
      if (disposed || state.dialog !== CONTACT_DIALOG.guide || !isContactKey(pendingGuideContactKey)) return false
      const contactKey = pendingGuideContactKey
      pendingGuideContactKey = null
      contactGuideShown = true
      startContactSelection(contactKey)
      return true
    },
    closeDialog() {
      if (disposed || state.dialog === CONTACT_DIALOG.success) return
      pendingGuideContactKey = null
      update({ dialog: null, activeContactKey: null })
    },
    openLeaveConfirmation,
    cancelLeave() {
      if (state.dialog === CONTACT_DIALOG.leave) update({ dialog: null })
    },
    confirmLeave() {
      if (disposed || state.dialog !== CONTACT_DIALOG.leave) return
      update({ dialog: null })
      submissionId += 1
      submitAbortController?.abort()
      submitAbortController = null
      contactSelection.dispose()
      if (loadingSubmissionId !== null) hideLoadingForSubmission(loadingSubmissionId)
      disableBackIntercept()
      onNavigateBack()
    },
    canSubmit: () => !state.submitting
      && state.dialog !== CONTACT_DIALOG.success
      && isCompleteContactsForm(state.contacts),
    submit,
    dispose() {
      if (disposed) return
      disposed = true
      submissionId += 1
      submitAbortController?.abort()
      submitAbortController = null
      if (successTimer !== null) cancelSchedule(successTimer)
      if (loadingSubmissionId !== null) {
        try { hideNativeLoading?.() } catch {}
        loadingSubmissionId = null
      }
      contactSelection.dispose()
      disableBackIntercept()
      listeners.clear()
    },
  })
}
