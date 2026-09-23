import { isBusinessHandledError } from '../../shared/businessError/index.js'

const MENU_ROUTES = Object.freeze({
  orderList: 'orderList',
  bankCardInfo: 'bankDetail',
  helpCenter: 'helpCenter',
  complaints: 'complainHome',
  settings: 'settings',
})

function createInitialState(phoneText) {
  return Object.freeze({
    phoneText,
    showComplaintRedDot: false,
    deleteDialogVisible: false,
    deleteSubmitting: false,
    navigationLocked: false,
  })
}

export function createMineController(options = {}) {
  const services = options.services
  const navigate = options.navigate
  const clearGlobal = options.clearGlobal
  const logout = options.logout
  const getFallbackMobileText = options.getFallbackMobileText ?? (() => '')
  const onBusinessFailure = options.onBusinessFailure ?? (() => {})
  const onRequestFailure = options.onRequestFailure ?? (() => {})
  const onTerminalRisk = options.onTerminalRisk ?? (() => {})
  const createAbortController = options.createAbortController ?? (() => new AbortController())

  if (!services
    || typeof services.loadProfile !== 'function'
    || typeof services.loadComplaintRedDot !== 'function'
    || typeof services.deleteAccount !== 'function') {
    throw new TypeError('Mine services are required.')
  }
  if (typeof navigate !== 'function') throw new TypeError('Mine navigation callback is required.')

  function fallbackMobileText() {
    try {
      const value = getFallbackMobileText()
      return typeof value === 'string' ? value : ''
    } catch {
      return ''
    }
  }

  let state = createInitialState(fallbackMobileText())
  let disposed = false
  let initialized = false
  let instanceId = 0
  let activeRequest = null
  let deletionTerminalHandled = false
  const listeners = new Set()

  function emit(partial = {}) {
    if (disposed) return
    state = Object.freeze({ ...state, ...partial })
    listeners.forEach((listener) => listener(state))
  }

  function isCurrent(id) {
    return !disposed && id === instanceId
  }

  function invalidateRequests() {
    instanceId += 1
    activeRequest?.abort()
    activeRequest = null
  }

  function applyProfileResult(id, result) {
    if (!isCurrent(id)) return
    if (result?.type === 'success' && typeof result.maskedMobile === 'string' && result.maskedMobile) {
      emit({ phoneText: result.maskedMobile })
      return
    }
    if (result?.type === 'business_failure') {
      if (result.message) onBusinessFailure(result.message)
      emit({ phoneText: fallbackMobileText() })
      return
    }
    emit({ phoneText: fallbackMobileText() })
  }

  function applyComplaintResult(id, result) {
    if (!isCurrent(id)) return
    emit({ showComplaintRedDot: result?.type === 'success' && result.showRedDot === true })
  }

  async function loadProfile(id, signal) {
    try {
      const result = await services.loadProfile({ signal })
      applyProfileResult(id, result)
    } catch (error) {
      if (!isCurrent(id) || error?.category === 'canceled') return
      if (!isBusinessHandledError(error)) onRequestFailure(error)
      emit({ phoneText: fallbackMobileText() })
    }
  }

  async function loadComplaintRedDot(id, signal) {
    try {
      const result = await services.loadComplaintRedDot({ signal })
      applyComplaintResult(id, result)
    } catch (error) {
      if (!isCurrent(id) || error?.category === 'canceled') return
      emit({ showComplaintRedDot: false })
    }
  }

  async function loadPage(id, signal) {
    await Promise.allSettled([
      loadProfile(id, signal),
      loadComplaintRedDot(id, signal),
    ])
  }

  function startRequestCycle() {
    invalidateRequests()
    const id = instanceId
    const controller = createAbortController()
    activeRequest = controller
    emit(createInitialState(fallbackMobileText()))
    void loadPage(id, controller.signal).finally(() => {
      if (isCurrent(id)) activeRequest = null
    })
  }

  function start() {
    if (disposed || initialized) return false
    initialized = true
    startRequestCycle()
    return true
  }

  function activate() {
    if (disposed || !initialized) return false
    startRequestCycle()
    return true
  }

  function deactivate() {
    if (disposed) return
    invalidateRequests()
    emit({
      deleteDialogVisible: false,
      navigationLocked: false,
    })
  }

  function openDeleteDialog() {
    if (disposed || state.deleteSubmitting || state.deleteDialogVisible) return false
    emit({ deleteDialogVisible: true })
    return true
  }

  function cancelDelete() {
    if (disposed || state.deleteSubmitting) return false
    emit({ deleteDialogVisible: false })
    return true
  }

  function reportTerminalRisk(code) {
    try { onTerminalRisk(code) } catch {}
  }

  function completeDeletion() {
    if (deletionTerminalHandled) return
    deletionTerminalHandled = true
    try {
      if (typeof clearGlobal === 'function' && clearGlobal() === false) {
        reportTerminalRisk('CLEAR_GLOBAL_FAILED')
      }
    } catch {
      reportTerminalRisk('CLEAR_GLOBAL_FAILED')
    }
    try {
      if (typeof logout !== 'function' || logout() === false) {
        reportTerminalRisk('LOGOUT_FAILED')
      }
    } catch {
      reportTerminalRisk('LOGOUT_FAILED')
    }
  }

  async function confirmDelete() {
    if (disposed || state.deleteSubmitting) return false
    emit({ deleteDialogVisible: false, deleteSubmitting: true })

    try {
      const result = await services.deleteAccount()
      if (result?.type === 'success') {
        completeDeletion()
        return true
      }
      if (result?.type === 'business_failure') {
        if (result.message) onBusinessFailure(result.message)
      }
      emit({ deleteSubmitting: false })
      return false
    } catch (error) {
      if (!isBusinessHandledError(error)) onRequestFailure(error)
      emit({ deleteSubmitting: false })
      return false
    }
  }

  function requestMenu(key) {
    if (disposed) return false
    if (key === 'deleteAccount') return openDeleteDialog()
    const routeName = MENU_ROUTES[key]
    if (!routeName || state.navigationLocked) return false
    emit({ navigationLocked: true })
    try {
      const result = navigate({ name: routeName })
      if (result && typeof result.catch === 'function') {
        result.catch(() => emit({ navigationLocked: false }))
      }
      return true
    } catch {
      emit({ navigationLocked: false })
      return false
    }
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
    activate,
    deactivate,
    requestMenu,
    openDeleteDialog,
    cancelDelete,
    confirmDelete,
    dispose() {
      if (disposed) return
      invalidateRequests()
      disposed = true
      listeners.clear()
    },
  })
}
