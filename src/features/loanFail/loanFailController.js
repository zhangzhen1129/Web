const READY = 'ready'
const INACTIVE = 'inactive'

function createState() {
  return Object.freeze({
    phase: READY,
    navigationLocked: false,
  })
}

function isValidEntryQuery(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return false
  const keys = Object.keys(query)
  return keys.length === 1
    && keys[0] === 'orderId'
    && typeof query.orderId === 'string'
    && query.orderId.trim().length > 0
}

export function createLoanFailController({
  onNavigateBack = () => {},
  onNavigateHome = () => {},
} = {}) {
  let state = createState()
  let initialized = false
  let disposed = false
  const listeners = new Set()

  function emit(partial = {}) {
    if (disposed) return
    state = Object.freeze({ ...state, ...partial })
    listeners.forEach((listener) => listener(state))
  }

  function isActive() {
    return initialized && !disposed && state.phase === READY
  }

  function lockNavigation() {
    emit({ phase: INACTIVE, navigationLocked: true })
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
        emit({ phase: INACTIVE, navigationLocked: true })
        return false
      }
      emit({ phase: READY, navigationLocked: false })
      return true
    },
    requestBack() {
      if (!isActive()) return false
      lockNavigation()
      onNavigateBack()
      return true
    },
    requestHome() {
      if (!isActive()) return false
      lockNavigation()
      onNavigateHome()
      return true
    },
    dispose() {
      if (disposed) return
      lockNavigation()
      disposed = true
      listeners.clear()
    },
  })
}
