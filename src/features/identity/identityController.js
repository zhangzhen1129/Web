import {
  cancelNativeFaceCameraConsumer,
  cancelNativeIdCardCameraConsumer,
  hideNativeLoading,
  openFaceCameraNative,
  openIdCardCameraNative,
  setPhysicalBackIntercept,
  showNativeLoading,
} from '../../shared/bridge/index.js'
import { isBusinessHandledError } from '../../shared/businessError/index.js'
import { createIdentityAdvanceLivePort } from './identityAdvanceLivePort.js'
import { createIdentityImagePreview, revokeIdentityImagePreview } from './services/identityImagePreview.js'
import { createIdentityServices } from './services/identityServices.js'

export const IDENTITY_PHASE = Object.freeze({
  DOCUMENT_EMPTY: 'document_empty',
  DOCUMENT_CAPTURING: 'document_capturing',
  DOCUMENT_RECOGNIZING: 'document_recognizing',
  DOCUMENT_READY: 'document_ready',
  LIVENESS_PREPARING: 'liveness_preparing',
  LIVENESS_RUNNING: 'liveness_running',
  IDENTITY_SAVING: 'identity_saving',
  RESULT_REFRESHING: 'result_refreshing',
  RECOVERABLE_ERROR: 'recoverable_error',
  INACTIVE: 'inactive',
})

const ACTIVE_PHASES = new Set([
  IDENTITY_PHASE.DOCUMENT_CAPTURING,
  IDENTITY_PHASE.DOCUMENT_RECOGNIZING,
  IDENTITY_PHASE.LIVENESS_PREPARING,
  IDENTITY_PHASE.LIVENESS_RUNNING,
  IDENTITY_PHASE.IDENTITY_SAVING,
  IDENTITY_PHASE.RESULT_REFRESHING,
])

function cloneState(state) {
  return Object.freeze({
    ...state,
    canSubmit: state.phase === IDENTITY_PHASE.DOCUMENT_READY && state.hasDocument === true && Boolean(state.dni.trim()) && !state.busy,
  })
}

function textMessage(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function isSuccessStatus(value) {
  return value === '1' || value === 1
}


function createConsumerProxy() {
  let consumer = null
  return Object.freeze({
    handle() { consumer?.() },
    set(nextConsumer) { consumer = typeof nextConsumer === 'function' ? nextConsumer : null },
    clear() { consumer = null },
  })
}

function normalizeRequestFailure(error) {
  if (error?.category === 'canceled') return Object.freeze({ type: 'canceled' })
  if (isBusinessHandledError(error)) return Object.freeze({ type: 'handled_failure' })
  const message = textMessage(error?.displayMessage) || textMessage(error?.message) || 'Unable to complete the request.'
  return Object.freeze({ type: 'request_failure', message })
}

export function createIdentityController({
  services,
  getGlobalState,
  bridges = {},
  createAdvancePort = createIdentityAdvanceLivePort,
  createImagePreview = createIdentityImagePreview,
  revokeImagePreview = revokeIdentityImagePreview,
  onBusinessFailure = () => {},
  onRequestFailure = () => {},
  onNavigateAddBank = () => {},
  onNavigateBack = () => {},
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancelSchedule = (handle) => clearTimeout(handle),
} = {}) {
  const identityServices = services ?? createIdentityServices({ getGlobalState })
  const bridge = {
    showLoading: bridges.showLoading ?? showNativeLoading,
    hideLoading: bridges.hideLoading ?? hideNativeLoading,
    setPhysicalBack: bridges.setPhysicalBack ?? setPhysicalBackIntercept,
    openIdCard: bridges.openIdCard ?? openIdCardCameraNative,
    cancelIdCard: bridges.cancelIdCard ?? cancelNativeIdCardCameraConsumer,
    openFace: bridges.openFace ?? openFaceCameraNative,
    cancelFace: bridges.cancelFace ?? cancelNativeFaceCameraConsumer,
  }
  const advancePort = createAdvancePort({ onResult: handleAdvanceResult, onFailure: handleAdvanceFailure })

  let state = cloneState({
    phase: IDENTITY_PHASE.DOCUMENT_EMPTY,
    firstPromptOpen: false,
    leaveConfirmationOpen: false,
    progressOpen: false,
    progress: 0,
    firstPromptSeen: false,
    imagePreviewUrl: '',
    hasDocument: false,
    dni: '',
    identityContext: false,
    busy: false,
    operationId: 0,
  })
  const listeners = new Set()
  let initialized = false
  let disposed = false
  let operationId = 0
  let progressTimer = null
  let completionTimer = null
  let requestController = null
  let idCardHandle = null
  let faceHandle = null
  let activeAdvanceContext = null
  let physicalBackHandle = null
  const physicalBackProxy = createConsumerProxy()

  function emit(next) {
    if (disposed) return
    state = cloneState({ ...state, ...next })
    listeners.forEach((listener) => listener(state))
  }

  function invalidate() {
    operationId += 1
    emit({ operationId })
    if (requestController) requestController.abort()
    requestController = null
  }

  function clearProgress() {
    if (progressTimer !== null) cancelSchedule(progressTimer)
    if (completionTimer !== null) cancelSchedule(completionTimer)
    progressTimer = null
    completionTimer = null
    emit({ progressOpen: false, progress: 0 })
  }

  function closeBackIntercept() {
    physicalBackProxy.clear()
    if (!physicalBackHandle) return true
    let disabled = null
    try { disabled = bridge.setPhysicalBack({ enabled: false }) } catch {}
    if (disabled) physicalBackHandle = null
    return Boolean(disabled)
  }

  function stopConsumers() {
    if (idCardHandle) bridge.cancelIdCard(idCardHandle)
    if (faceHandle) bridge.cancelFace(faceHandle)
    advancePort.detach()
    idCardHandle = null
    faceHandle = null
    activeAdvanceContext = null
  }

  function failTo(phase, result, { notifyRequestFailure = false } = {}) {
    clearProgress()
    emit({ phase, busy: false })
    const message = textMessage(result?.message)
    if (result?.type === 'business_failure' && message) onBusinessFailure(message)
    else if (notifyRequestFailure && result?.type === 'request_failure') onRequestFailure(result.message)
    else if (notifyRequestFailure && result?.type === 'invalid_response') onRequestFailure('Unable to validate the server response.')
  }

  function startProgress() {
    clearProgress()
    emit({ progressOpen: true, progress: 1 })
    const tick = () => {
      if (disposed || !state.progressOpen) return
      const nextProgress = Math.min(99, state.progress + 1)
      emit({ progress: nextProgress })
      progressTimer = nextProgress < 99 ? schedule(tick, 100) : null
    }
    progressTimer = schedule(tick, 100)
  }

  function finishProgress(next) {
    if (disposed) return
    if (progressTimer !== null) cancelSchedule(progressTimer)
    progressTimer = null
    emit({ progress: 100 })
    completionTimer = schedule(() => {
      completionTimer = null
      clearProgress()
      next()
    }, 1000)
  }

  function isCurrent(id) {
    return !disposed && id === operationId
  }

  async function recognizeImage(imageBase64, mimeType, id) {
    emit({ phase: IDENTITY_PHASE.DOCUMENT_RECOGNIZING, busy: true, progressOpen: true, progress: 1 })
    startProgress()
    requestController = new AbortController()
    let result
    try {
      result = await identityServices.saveIdentity({ mark: 1, cardFrontBase64Src: imageBase64, signal: requestController.signal })
    } catch (error) {
      if (isCurrent(id)) failTo(state.hasDocument ? IDENTITY_PHASE.DOCUMENT_READY : IDENTITY_PHASE.DOCUMENT_EMPTY, normalizeRequestFailure(error))
      return
    } finally {
      requestController = null
    }
    if (!isCurrent(id)) return
    if (result?.type !== 'success' || !isSuccessStatus(result.status) || !result.idNumber.trim()) {
      failTo(state.hasDocument ? IDENTITY_PHASE.DOCUMENT_READY : IDENTITY_PHASE.DOCUMENT_EMPTY, result)
      return
    }
    const nextDni = result.idNumber.trim()
    let previewUrl = ''
    try {
      previewUrl = await createImagePreview({ imageBase64, mimeType })
    } catch {}
    if (!isCurrent(id)) {
      revokeImagePreview(previewUrl)
      return
    }
    finishProgress(() => {
      if (!isCurrent(id)) {
        revokeImagePreview(previewUrl)
        return
      }
      const previousPreviewUrl = state.imagePreviewUrl
      emit({ phase: IDENTITY_PHASE.DOCUMENT_READY, busy: false, imagePreviewUrl: previewUrl, hasDocument: true, dni: nextDni, identityContext: true })
      revokeImagePreview(previousPreviewUrl)
    })
  }

  function openDocumentCamera() {
    if (disposed || state.busy || ACTIVE_PHASES.has(state.phase)) return null
    const previous = { imagePreviewUrl: state.imagePreviewUrl, hasDocument: state.hasDocument, dni: state.dni, identityContext: state.identityContext }
    const id = ++operationId
    emit({ phase: IDENTITY_PHASE.DOCUMENT_CAPTURING, busy: true, operationId: id, firstPromptOpen: false })
    const handle = bridge.openIdCard((reply) => {
      idCardHandle = null
      if (!isCurrent(id)) return
      const imageBase64 = reply?.status === 'success' && typeof reply.imageBase64 === 'string' ? reply.imageBase64.trim() : ''
      if (!imageBase64) {
        emit({ ...previous, phase: previous.identityContext ? IDENTITY_PHASE.DOCUMENT_READY : IDENTITY_PHASE.DOCUMENT_EMPTY, busy: false })
        return
      }
      void recognizeImage(imageBase64, reply.mimeType, id)
    }, { onFailure: () => {
      idCardHandle = null
      if (isCurrent(id)) emit({ ...previous, phase: previous.identityContext ? IDENTITY_PHASE.DOCUMENT_READY : IDENTITY_PHASE.DOCUMENT_EMPTY, busy: false })
    }})
    idCardHandle = handle
    if (!handle) emit({ ...previous, phase: previous.identityContext ? IDENTITY_PHASE.DOCUMENT_READY : IDENTITY_PHASE.DOCUMENT_EMPTY, busy: false })
    return handle
  }

  function openDocumentArea() {
    if (state.firstPromptSeen) return openDocumentCamera()
    if (state.busy || state.phase !== IDENTITY_PHASE.DOCUMENT_EMPTY) return null
    emit({ firstPromptSeen: true, firstPromptOpen: true })
    return true
  }

  async function submit() {
    if (disposed || !state.canSubmit || state.busy) return false
    const id = ++operationId
    const identityNo = state.dni.trim()
    emit({ phase: IDENTITY_PHASE.LIVENESS_PREPARING, busy: true, operationId: id })
    try { bridge.showLoading() } catch {}
    requestController = new AbortController()
    let channelResult
    try {
      channelResult = await identityServices.getOcrChannel({ signal: requestController.signal })
    } catch (error) {
      requestController = null
      if (isCurrent(id)) { try { bridge.hideLoading() } catch {} ; failTo(IDENTITY_PHASE.DOCUMENT_READY, normalizeRequestFailure(error), { notifyRequestFailure: true }) }
      return false
    }
    requestController = null
    if (!isCurrent(id)) return false
    if (channelResult?.type !== 'success') { try { bridge.hideLoading() } catch {} ; failTo(IDENTITY_PHASE.DOCUMENT_READY, channelResult, { notifyRequestFailure: true }); return false }
    if (channelResult.channel === 'Advance') return startAdvance(id, identityNo)
    return startFace(id, identityNo)
  }

  function startFace(id, identityNo) {
    const handle = bridge.openFace((reply) => {
      faceHandle = null
      if (!isCurrent(id)) return
      const livingBase64 = reply?.status === 'success' && typeof reply.imageBase64 === 'string' ? reply.imageBase64.trim() : ''
      try { bridge.hideLoading() } catch {}
      if (!livingBase64) { emit({ phase: IDENTITY_PHASE.DOCUMENT_READY, busy: false }); return }
      void saveLiving(id, identityNo, { livingBase64Src: livingBase64 })
    }, { onFailure: () => {
      faceHandle = null
      try { bridge.hideLoading() } catch {}
      if (isCurrent(id)) emit({ phase: IDENTITY_PHASE.DOCUMENT_READY, busy: false })
    }})
    faceHandle = handle
    if (!handle) { try { bridge.hideLoading() } catch {}; emit({ phase: IDENTITY_PHASE.DOCUMENT_READY, busy: false }) }
    else { try { bridge.hideLoading() } catch {}; emit({ phase: IDENTITY_PHASE.LIVENESS_RUNNING }) }
    return true
  }

  async function startAdvance(id, identityNo) {
    let session
    requestController = new AbortController()
    try { session = await identityServices.createAdvanceSession({ signal: requestController.signal }) } catch (error) {
      if (isCurrent(id)) { try { bridge.hideLoading() } catch {}; failTo(IDENTITY_PHASE.DOCUMENT_READY, normalizeRequestFailure(error), { notifyRequestFailure: true }) }
      return false
    } finally {
      requestController = null
    }
    if (!isCurrent(id)) return false
    if (session?.type !== 'success') { try { bridge.hideLoading() } catch {}; failTo(IDENTITY_PHASE.DOCUMENT_READY, session, { notifyRequestFailure: true }); return false }
    activeAdvanceContext = Object.freeze({ id, identityNo, requestHandle: session.requestHandle })
    if (!advancePort.open(session.url)) {
      activeAdvanceContext = null
      try { bridge.hideLoading() } catch {}
      emit({ phase: IDENTITY_PHASE.DOCUMENT_READY, busy: false })
      return false
    }
    try { bridge.hideLoading() } catch {}
    emit({ phase: IDENTITY_PHASE.LIVENESS_RUNNING })
    return true
  }

  function handleAdvanceResult(reply) {
    const context = activeAdvanceContext
    activeAdvanceContext = null
    if (!context || !isCurrent(context.id)) return
    if (reply?.type === 2) {
      emit({ phase: IDENTITY_PHASE.DOCUMENT_READY, busy: false })
      void submit()
      return
    }
    if (reply?.type !== 1) {
      emit({ phase: IDENTITY_PHASE.DOCUMENT_READY, busy: false })
      return
    }
    void saveLiving(context.id, context.identityNo, { h5LivenessId: context.requestHandle })
  }

  function handleAdvanceFailure() {
    const context = activeAdvanceContext
    activeAdvanceContext = null
    if (context && isCurrent(context.id)) emit({ phase: IDENTITY_PHASE.DOCUMENT_READY, busy: false })
  }

  async function saveLiving(id, identityNo, payload) {
    if (!isCurrent(id)) return
    emit({ phase: IDENTITY_PHASE.IDENTITY_SAVING, progressOpen: true, progress: 1 })
    startProgress()
    let result
    requestController = new AbortController()
    try { result = await identityServices.saveIdentity({ mark: 4, ...payload, signal: requestController.signal }) } catch (error) {
      if (isCurrent(id)) failTo(IDENTITY_PHASE.DOCUMENT_READY, normalizeRequestFailure(error))
      return
    } finally {
      requestController = null
    }
    if (!isCurrent(id)) return
    if (result?.type !== 'success' || !isSuccessStatus(result.status)) { failTo(IDENTITY_PHASE.DOCUMENT_READY, result); return }
    let update
    requestController = new AbortController()
    try { update = await identityServices.saveIdentity({ mark: 5, identityNo, signal: requestController.signal }) } catch (error) {
      if (isCurrent(id)) failTo(IDENTITY_PHASE.DOCUMENT_READY, normalizeRequestFailure(error))
      return
    } finally {
      requestController = null
    }
    if (!isCurrent(id)) return
    if (update?.type !== 'success' || !isSuccessStatus(update.status)) { failTo(IDENTITY_PHASE.DOCUMENT_READY, update); return }
    emit({ phase: IDENTITY_PHASE.RESULT_REFRESHING })
    let refreshed
    requestController = new AbortController()
    try { refreshed = await identityServices.refreshAppMode({ signal: requestController.signal }) } catch (error) {
      if (isCurrent(id)) failTo(IDENTITY_PHASE.DOCUMENT_READY, normalizeRequestFailure(error), { notifyRequestFailure: true })
      return
    } finally {
      requestController = null
    }
    if (!isCurrent(id)) return
    if (refreshed?.type !== 'success' || !refreshed.orderId) { failTo(IDENTITY_PHASE.DOCUMENT_READY, refreshed, { notifyRequestFailure: true }); return }
    finishProgress(() => {
      if (!isCurrent(id)) return
      operationId += 1
      stopConsumers()
      revokeImagePreview(state.imagePreviewUrl)
      closeBackIntercept()
      emit({ phase: IDENTITY_PHASE.INACTIVE, busy: false, operationId })
      onNavigateAddBank({ orderId: refreshed.orderId, from: 'order' })
    })
  }

  function requestLeave() {
    if (disposed || state.phase === IDENTITY_PHASE.INACTIVE) return false
    if (state.leaveConfirmationOpen) return true
    emit({ leaveConfirmationOpen: true })
    return true
  }

  function cancelLeave() {
    if (!disposed) emit({ leaveConfirmationOpen: false })
  }

  function confirmLeave() {
    if (disposed) return
    invalidate()
    stopConsumers()
    revokeImagePreview(state.imagePreviewUrl)
    clearProgress()
    try { bridge.hideLoading() } catch {}
    closeBackIntercept()
    emit({ phase: IDENTITY_PHASE.INACTIVE, busy: false, leaveConfirmationOpen: false })
    onNavigateBack()
  }

  return Object.freeze({
    getState: () => state,
    subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener) },
    initialize() {
      if (disposed || initialized) return
      initialized = true
      physicalBackProxy.set(requestLeave)
      try { physicalBackHandle = bridge.setPhysicalBack({ enabled: true, onIntercept: physicalBackProxy.handle }) } catch {}
      if (!physicalBackHandle) physicalBackProxy.clear()
    },
    openDocumentArea,
    closeFirstPrompt() { if (!disposed) emit({ firstPromptOpen: false }) },
    confirmFirstPrompt: openDocumentCamera,
    openDocumentCamera,
    updateDni(value) { if (!disposed && !state.busy) emit({ dni: typeof value === 'string' ? value : '' }) },
    submit,
    requestLeave,
    cancelLeave,
    confirmLeave,
    closeProgress: () => {},
    dispose() {
      if (disposed) return
      disposed = true
      invalidate()
      stopConsumers()
      clearProgress()
      try { bridge.hideLoading() } catch {}
      closeBackIntercept()
      listeners.clear()
    },
  })
}



