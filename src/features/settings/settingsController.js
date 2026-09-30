import { isBusinessHandledError } from '../../shared/businessError/index.js'

const PASSWORD_MODE = Object.freeze({
  CREATE: 'create',
  CHANGE: 'change',
})

const BRIDGE_CAPABILITY = 'setPhysicalBackInterceptConfig'
const TERMINAL_RISK = Object.freeze({
  CLEAR_GLOBAL_FAILED: 'CLEAR_GLOBAL_FAILED',
  LOGOUT_FAILED: 'LOGOUT_FAILED',
})

function createInitialState(active = false) {
  return Object.freeze({
    active,
    passwordMode: PASSWORD_MODE.CREATE,
    protocolDialogVisible: false,
    logoutDialogVisible: false,
    logoutPending: false,
    navigationLocked: false,
  })
}

function isCanceled(error) {
  return error?.category === 'canceled' || error?.code === 'CANCELED'
}

function callSafely(callback, value) {
  if (typeof callback !== 'function') return
  try {
    callback(value)
  } catch {}
}

function createPhysicalBackProxy() {
  let consumer = null

  function handle(event) {
    const current = consumer
    if (typeof current !== 'function') return
    try {
      current(event)
    } catch {}
  }

  return Object.freeze({
    handle,
    set(nextConsumer) {
      consumer = typeof nextConsumer === 'function' ? nextConsumer : null
      return handle
    },
    clear() {
      consumer = null
    },
  })
}

export function createSettingsController(options = {}) {
  const services = options.services
  const navigate = options.navigate
  const navigateBack = options.navigateBack
  const clearGlobal = options.clearGlobal
  const logout = options.logout
  const setPhysicalBackIntercept = options.setPhysicalBackIntercept
  const onRequestFailure = options.onRequestFailure ?? (() => {})
  const onBridgeFailure = options.onBridgeFailure ?? (() => {})
  const onTerminalRisk = options.onTerminalRisk ?? (() => {})
  const createAbortController = options.createAbortController ?? (() => new AbortController())

  if (!services || typeof services.loadProfile !== 'function') {
    throw new TypeError('Settings services are required.')
  }
  if (typeof navigate !== 'function') throw new TypeError('Settings navigation callback is required.')
  if (typeof navigateBack !== 'function') throw new TypeError('Settings back callback is required.')

  let state = createInitialState()
  let disposed = false
  let initialized = false
  let instanceId = 0
  let activeRequest = null
  let requestFailureReported = false
  let logoutTerminalHandled = false
  let backInterceptEnabled = false
  const physicalBackProxy = createPhysicalBackProxy()
  const listeners = new Set()

  function emit(partial = {}) {
    if (disposed) return
    state = Object.freeze({ ...state, ...partial })
    for (const listener of listeners) {
      try {
        listener(state)
      } catch {}
    }
  }

  function isCurrent(id) {
    return !disposed && id === instanceId
  }

  function invalidateCurrentRequest() {
    instanceId += 1
    const controller = activeRequest
    activeRequest = null
    try {
      controller?.abort?.()
    } catch {}
  }

  function reportBridgeFailure(failure) {
    callSafely(onBridgeFailure, failure)
  }

  function createBridgeFailureHandler() {
    const handler = (failure) => {
      handler.reported = true
      reportBridgeFailure(failure)
    }
    handler.reported = false
    return handler
  }

  function startBackIntercept() {
    physicalBackProxy.set(requestBack)
    if (typeof setPhysicalBackIntercept !== 'function') {
      physicalBackProxy.clear()
      reportBridgeFailure({ capability: BRIDGE_CAPABILITY, code: 'BRIDGE_UNAVAILABLE' })
      return false
    }

    const onFailure = createBridgeFailureHandler()
    let result
    try {
      result = setPhysicalBackIntercept({
        enabled: true,
        onIntercept: physicalBackProxy.handle,
      }, { onFailure })
    } catch {
      physicalBackProxy.clear()
      reportBridgeFailure({ capability: BRIDGE_CAPABILITY, code: 'BRIDGE_CALL_FAILED' })
      return false
    }

    backInterceptEnabled = result !== null && result !== undefined && result !== false
    if (!backInterceptEnabled) {
      physicalBackProxy.clear()
      if (!onFailure.reported) {
        reportBridgeFailure({ capability: BRIDGE_CAPABILITY, code: 'BRIDGE_CALL_FAILED' })
      }
    }
    return backInterceptEnabled
  }

  function stopBackIntercept() {
    physicalBackProxy.clear()
    if (!backInterceptEnabled) return false
    backInterceptEnabled = false

    if (typeof setPhysicalBackIntercept !== 'function') {
      reportBridgeFailure({ capability: BRIDGE_CAPABILITY, code: 'BRIDGE_UNAVAILABLE' })
      return false
    }

    const onFailure = createBridgeFailureHandler()
    let result
    try {
      result = setPhysicalBackIntercept({ enabled: false }, { onFailure })
    } catch {
      if (!onFailure.reported) {
        reportBridgeFailure({ capability: BRIDGE_CAPABILITY, code: 'BRIDGE_CALL_FAILED' })
      }
      return false
    }

    if (result === null || result === undefined || result === false) {
      if (!onFailure.reported) {
        reportBridgeFailure({ capability: BRIDGE_CAPABILITY, code: 'BRIDGE_CALL_FAILED' })
      }
      return false
    }
    return true
  }

  function canNavigate({ allowDialog = false } = {}) {
    if (disposed || !state.active || state.navigationLocked || state.logoutPending) return false
    if (!allowDialog && (state.protocolDialogVisible || state.logoutDialogVisible)) return false
    return true
  }

  function followNavigationResult(result) {
    if (result && typeof result.catch === 'function') {
      result.catch(() => {
        if (!disposed && state.active) emit({ navigationLocked: false })
      })
    }
  }

  function navigateTo(routeName, { allowDialog = false } = {}) {
    if (!canNavigate({ allowDialog })) return false
    emit({ navigationLocked: true })
    let result
    try {
      result = navigate(routeName)
    } catch {
      emit({ navigationLocked: false })
      return false
    }
    if (result === false) {
      emit({ navigationLocked: false })
      return false
    }
    followNavigationResult(result)
    return true
  }

  async function loadProfile(id, signal) {
    let result
    try {
      result = await services.loadProfile({ signal })
    } catch (error) {
      if (!isCurrent(id)) return
      if (isCanceled(error)) return
      if (!isBusinessHandledError(error) && !requestFailureReported) {
        requestFailureReported = true
        callSafely(onRequestFailure, error)
      }
      return
    }

    if (!isCurrent(id) || result?.type !== 'success') return
    const passwordMode = result.hasPassword === true ? PASSWORD_MODE.CHANGE : PASSWORD_MODE.CREATE
    if (passwordMode !== state.passwordMode) emit({ passwordMode })
  }

  function initialize() {
    if (disposed || initialized) return false
    initialized = true

    const id = instanceId + 1
    instanceId = id
    let controller = null
    try {
      controller = createAbortController()
    } catch {}
    activeRequest = controller

    emit(createInitialState(true))
    startBackIntercept()
    void loadProfile(id, controller?.signal).finally(() => {
      if (isCurrent(id)) activeRequest = null
    })
    return true
  }

  function openProtocolDialog() {
    if (disposed || !state.active || state.navigationLocked || state.logoutPending) return false
    if (state.protocolDialogVisible) return false
    emit({ protocolDialogVisible: true, logoutDialogVisible: false })
    return true
  }

  function closeProtocolDialog() {
    if (disposed || !state.protocolDialogVisible) return false
    emit({ protocolDialogVisible: false })
    return true
  }

  function openLogoutDialog() {
    if (disposed || !state.active || state.navigationLocked || state.logoutPending) return false
    if (state.logoutDialogVisible) return false
    emit({ protocolDialogVisible: false, logoutDialogVisible: true })
    return true
  }

  function cancelLogout() {
    if (disposed || !state.logoutDialogVisible || state.logoutPending) return false
    emit({ logoutDialogVisible: false })
    return true
  }

  function requestPasswordNavigation() {
    const routeName = state.passwordMode === PASSWORD_MODE.CHANGE
      ? 'retrievePassword'
      : 'createPassword'
    return navigateTo(routeName)
  }

  function requestTerms() {
    return navigateTo('terms')
  }

  function requestPrivacy() {
    return navigateTo('privacy')
  }

  function requestBack() {
    if (!canNavigate({ allowDialog: true })) return false

    invalidateCurrentRequest()
    stopBackIntercept()
    emit({
      protocolDialogVisible: false,
      logoutDialogVisible: false,
      navigationLocked: true,
    })

    let result
    try {
      result = navigateBack()
    } catch {
      emit({ navigationLocked: false })
      return false
    }
    if (result === false) {
      emit({ navigationLocked: false })
      return false
    }
    followNavigationResult(result)
    return true
  }

  function reportTerminalRisk(code) {
    callSafely(onTerminalRisk, code)
  }

  function runTerminalStep(action, riskCode) {
    if (typeof action !== 'function') {
      reportTerminalRisk(riskCode)
      return
    }
    try {
      if (action() === false) reportTerminalRisk(riskCode)
    } catch {
      reportTerminalRisk(riskCode)
    }
  }

  function confirmLogout() {
    if (
      disposed
      || !state.active
      || !state.logoutDialogVisible
      || state.logoutPending
      || logoutTerminalHandled
    ) return false

    logoutTerminalHandled = true
    emit({
      protocolDialogVisible: false,
      logoutDialogVisible: false,
      logoutPending: true,
      navigationLocked: true,
    })

    runTerminalStep(clearGlobal, TERMINAL_RISK.CLEAR_GLOBAL_FAILED)
    runTerminalStep(logout, TERMINAL_RISK.LOGOUT_FAILED)
    return true
  }

  function deactivate() {
    if (disposed || !state.active) return false

    invalidateCurrentRequest()
    stopBackIntercept()
    emit({
      active: false,
      protocolDialogVisible: false,
      logoutDialogVisible: false,
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
    openProtocolDialog,
    closeProtocolDialog,
    openLogoutDialog,
    cancelLogout,
    requestPasswordNavigation,
    requestTerms,
    requestPrivacy,
    requestBack,
    confirmLogout,
    deactivate,
    dispose() {
      if (disposed) return
      invalidateCurrentRequest()
      stopBackIntercept()
      state = Object.freeze({
        ...state,
        active: false,
        protocolDialogVisible: false,
        logoutDialogVisible: false,
      })
      for (const listener of listeners) {
        try {
          listener(state)
        } catch {}
      }
      disposed = true
      listeners.clear()
    },
  })
}

