import { isBusinessHandledError } from '../../shared/businessError/index.js'

const PASSWORD_LIMITS = Object.freeze({
  minLength: 6,
  maxLength: 16,
})
const SUCCESS_RETURN_DELAY_MS = 1000
const PASSWORD_FIELDS = new Set(['newPassword', 'confirmPassword'])
const VISIBILITY_FIELDS = new Set(['newPassword', 'confirmPassword'])

function normalizeMobile(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
}

function hasText(value) {
  return typeof value === 'string' && value.length > 0
}

function getPasswordFieldState(state) {
  return {
    newPasswordValid: typeof state.newPassword === 'string'
      && state.newPassword.length >= PASSWORD_LIMITS.minLength
      && state.newPassword.length <= PASSWORD_LIMITS.maxLength,
    confirmPasswordValid: typeof state.confirmPassword === 'string'
      && state.confirmPassword.length > 0
      && state.confirmPassword.length <= PASSWORD_LIMITS.maxLength,
  }
}

function isSubmitEnabled(state) {
  const validity = getPasswordFieldState(state)
  return state.active
    && !state.navigationLocked
    && !state.submitting
    && !state.successPending
    && validity.newPasswordValid
    && validity.confirmPasswordValid
}

function createInitialState() {
  return Object.freeze({
    active: false,
    mobile: '',
    newPassword: '',
    confirmPassword: '',
    newPasswordVisible: false,
    confirmPasswordVisible: false,
    submitting: false,
    successPending: false,
    navigationLocked: false,
    submitEnabled: false,
  })
}

function result(type, extra) {
  return Object.freeze(extra === undefined ? { type } : { type, ...extra })
}

function callSafely(callback, value) {
  if (typeof callback !== 'function') return
  try {
    callback(value)
  } catch {}
}

export function createPasswordController(options = {}) {
  const services = options.services
  const getGlobalState = options.getGlobalState
  const showNativeLoading = options.showNativeLoading
  const hideNativeLoading = options.hideNativeLoading
  const setNativeCachedToken = options.setNativeCachedToken
  const setNativeCachedUserId = options.setNativeCachedUserId
  const navigateBack = options.navigateBack
  const navigateAfterSuccess = options.navigateAfterSuccess ?? navigateBack
  const onMismatch = options.onMismatch ?? (() => {})
  const onSuccessNotice = options.onSuccessNotice ?? (() => {})
  const onFailure = options.onFailure ?? (() => {})
  const onStoreFailure = options.onStoreFailure ?? (() => {})
  const onInvalidResponse = options.onInvalidResponse ?? (() => {})
  const onNativeWriteFailure = options.onNativeWriteFailure ?? (() => {})
  const createAbortController = options.createAbortController ?? (() => new AbortController())
  const setTimer = options.setTimer ?? ((callback, delay) => globalThis.setTimeout(callback, delay))
  const clearTimer = options.clearTimer ?? ((timer) => globalThis.clearTimeout(timer))
  const successReturnDelayMs = options.successReturnDelayMs ?? SUCCESS_RETURN_DELAY_MS

  if (!services || typeof services.createPassword !== 'function') {
    throw new TypeError('Create password services are required.')
  }
  if (typeof getGlobalState !== 'function') throw new TypeError('getGlobalState is required.')
  if (typeof navigateBack !== 'function') throw new TypeError('navigateBack is required.')

  let state = createInitialState()
  let disposed = false
  let initialized = false
  let instanceId = 0
  let submissionId = 0
  let activeRequest = null
  let successTimer = null
  let loadingVisible = false
  const listeners = new Set()

  function emit(partial = {}) {
    if (disposed) return
    const next = { ...state, ...partial }
    next.submitEnabled = isSubmitEnabled(next)
    state = Object.freeze(next)
    for (const listener of listeners) callSafely(listener, state)
  }

  function isCurrentSubmission(request) {
    return !disposed
      && state.active
      && request?.instanceId === instanceId
      && request?.id === submissionId
  }

  function clearSuccessTimer() {
    if (successTimer === null) return
    try { clearTimer(successTimer) } catch {}
    successTimer = null
  }

  function cleanupSensitiveFields() {
    emit({
      newPassword: '',
      confirmPassword: '',
      newPasswordVisible: false,
      confirmPasswordVisible: false,
    })
  }

  function showLoading() {
    if (loadingVisible) return
    loadingVisible = true
    try { showNativeLoading?.() } catch {}
  }

  function hideLoading() {
    if (!loadingVisible) return
    loadingVisible = false
    try { hideNativeLoading?.() } catch {}
  }

  function invalidateCurrentRequest() {
    instanceId += 1
    submissionId += 1
    const request = activeRequest
    activeRequest = null
    try { request?.controller?.abort?.() } catch {}
    clearSuccessTimer()
    hideLoading()
  }

  function readMobile() {
    try {
      return normalizeMobile(getGlobalState()?.mobile)
    } catch {
      return ''
    }
  }

  function initialize() {
    if (disposed || initialized) return false
    initialized = true
    emit({
      active: true,
      mobile: readMobile(),
      newPassword: '',
      confirmPassword: '',
      newPasswordVisible: false,
      confirmPasswordVisible: false,
      submitting: false,
      successPending: false,
      navigationLocked: false,
    })
    return true
  }

  function canEdit() {
    return !disposed
      && state.active
      && !state.navigationLocked
      && !state.submitting
      && !state.successPending
  }

  function setPassword(field, value) {
    if (!PASSWORD_FIELDS.has(field) || !canEdit()) return false
    emit({ [field]: typeof value === 'string' ? value : '' })
    return true
  }

  function toggleVisibility(field) {
    if (!VISIBILITY_FIELDS.has(field) || !canEdit()) return false
    const stateField = field === 'newPassword' ? 'newPasswordVisible' : 'confirmPasswordVisible'
    emit({ [stateField]: !state[stateField] })
    return true
  }

  function beginSubmission() {
    if (!state.submitEnabled) return null
    emit({ submitting: true, successPending: false, navigationLocked: false })
    const id = ++submissionId
    let controller = null
    try { controller = createAbortController() } catch {}
    activeRequest = { id, instanceId, controller }
    showLoading()
    return { id, instanceId, controller }
  }

  function finishLoadingAndUnlock(request, partial = {}) {
    if (activeRequest?.id === request.id) activeRequest = null
    if (!isCurrentSubmission(request)) return
    hideLoading()
    emit({ submitting: false, successPending: false, ...partial })
  }

  function writeNativeValue(name, writer, value) {
    if (typeof writer !== 'function') {
      callSafely(onNativeWriteFailure, name)
      return false
    }

    try {
      const accepted = writer(value)
      if (accepted === false) {
        callSafely(onNativeWriteFailure, name)
        return false
      }
      return true
    } catch {
      callSafely(onNativeWriteFailure, name)
      return false
    }
  }

  function scheduleSuccessReturn(request) {
    clearSuccessTimer()
    try {
      successTimer = setTimer(() => {
        successTimer = null
        if (!isCurrentSubmission(request) || !state.successPending) return
        emit({ navigationLocked: true })
        try {
          navigateAfterSuccess()
        } catch {}
      }, successReturnDelayMs)
    } catch {
      successTimer = null
    }
  }

  async function submit() {
    if (disposed || !state.active || state.submitting || state.successPending) {
      return result('ignored')
    }
    if (!hasText(state.newPassword) || !hasText(state.confirmPassword)) {
      return result('invalid')
    }
    if (state.newPassword.length < PASSWORD_LIMITS.minLength || state.newPassword.length > PASSWORD_LIMITS.maxLength) {
      return result('invalid')
    }
    if (state.confirmPassword.length > PASSWORD_LIMITS.maxLength) return result('invalid')
    if (state.newPassword !== state.confirmPassword) {
      callSafely(onMismatch)
      return result('mismatch')
    }

    const submission = beginSubmission()
    if (!submission) return result('invalid')

    try {
      const response = await services.createPassword({
        newPassword: state.newPassword,
        signal: submission.controller?.signal,
      })
      if (!isCurrentSubmission(submission)) return result('stale')
      if (!response || response.type === 'invalid_response') {
        finishLoadingAndUnlock(submission)
        callSafely(onInvalidResponse)
        return result('invalid_response')
      }
      if (response.type !== 'success') {
        finishLoadingAndUnlock(submission)
        if (typeof response.message === 'string' && response.message.trim().length > 0) {
          callSafely(onFailure, response.message)
        }
        return result('business_failure')
      }

      let storeUpdated = false
      try {
        storeUpdated = getGlobalState().setGlobal({ token: response.token, userId: response.userId }) === true
      } catch {
        storeUpdated = false
      }
      if (!storeUpdated) {
        finishLoadingAndUnlock(submission)
        callSafely(onStoreFailure)
        return result('store_failure')
      }

      writeNativeValue('token', setNativeCachedToken, response.token)
      writeNativeValue('userId', setNativeCachedUserId, response.userId)
      hideLoading()
      if (activeRequest?.id === submission.id) activeRequest = null
      emit({ submitting: false, successPending: true })
      callSafely(onSuccessNotice)
      scheduleSuccessReturn(submission)
      return result('success')
    } catch (error) {
      if (!isCurrentSubmission(submission)) return result('stale')
      finishLoadingAndUnlock(submission)
      if (error?.category === 'canceled' || error?.code === 'CANCELED' || isBusinessHandledError(error)) {
        return result('canceled')
      }
      callSafely(onFailure, error?.displayMessage)
      return result('request_failure')
    }
  }

  function requestBack() {
    if (disposed || !state.active) return false
    invalidateCurrentRequest()
    emit({ active: false, navigationLocked: true, submitting: false, successPending: false })
    cleanupSensitiveFields()
    try {
      navigateBack()
    } catch {}
    return true
  }

  function deactivate() {
    if (disposed || !state.active) return false
    invalidateCurrentRequest()
    emit({
      active: false,
      navigationLocked: true,
      submitting: false,
      successPending: false,
    })
    cleanupSensitiveFields()
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
    setNewPassword: (value) => setPassword('newPassword', value),
    setConfirmPassword: (value) => setPassword('confirmPassword', value),
    toggleNewPasswordVisibility: () => toggleVisibility('newPassword'),
    toggleConfirmPasswordVisibility: () => toggleVisibility('confirmPassword'),
    submit,
    requestBack,
    deactivate,
    dispose() {
      if (disposed) return
      invalidateCurrentRequest()
      emit({
        active: false,
        navigationLocked: true,
        submitting: false,
        successPending: false,
      })
      cleanupSensitiveFields()
      disposed = true
      listeners.clear()
    },
  })
}

export const CREATE_PASSWORD_LIMITS = PASSWORD_LIMITS
