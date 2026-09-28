function createState() {
  return Object.freeze({
    entryValid: false,
    rootState: 'loading',
    accounts: Object.freeze([]),
    selectedAccountId: '',
    submitting: false,
    navigationLocked: false,
  })
}

function isValidEntryQuery(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return false
  if (Object.keys(query).some((key) => key !== 'orderId')) return false
  if (typeof query.orderId === 'undefined') return true
  return typeof query.orderId === 'string' && query.orderId.trim().length > 0
}

function normalizeMessage(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
}

function findDefaultAccountId(accounts) {
  const account = accounts.find((item) => item.markLoanCard === 1)
  return typeof account?.id === 'string' ? account.id : ''
}

function createConsumerProxy() {
  let consumer = null
  return Object.freeze({
    handle() {
      consumer?.()
    },
    set(nextConsumer) {
      consumer = typeof nextConsumer === 'function' ? nextConsumer : null
    },
    clear() {
      consumer = null
    },
  })
}

export function createBankDetailController({
  services,
  showNativeLoading,
  hideNativeLoading,
  setPhysicalBackIntercept,
  createAbortController = () => new AbortController(),
  onBusinessFailure = () => {},
  onSuccessNotice = () => {},
  onNavigateBack = () => {},
  onNavigateAddPaymentMethod = () => true,
} = {}) {
  if (!services || typeof services.loadBankAccounts !== 'function' || typeof services.updateLoanCard !== 'function') {
    throw new TypeError('Bank detail services are required.')
  }

  let state = createState()
  let disposed = false
  let initialized = false
  let instanceId = 0
  let accountController = null
  let submissionController = null
  let submissionId = 0
  let backInterceptEnabled = false
  const loadingOwners = new Set()
  const listeners = new Set()
  const physicalBackProxy = createConsumerProxy()

  function emit(partial = {}) {
    if (disposed) return
    state = Object.freeze({ ...state, ...partial })
    listeners.forEach((listener) => listener(state))
  }

  function isCurrent(id) {
    return !disposed && id === instanceId
  }

  function showLoading(ownerKey) {
    const wasEmpty = loadingOwners.size === 0
    loadingOwners.add(ownerKey)
    if (!wasEmpty) return
    try {
      showNativeLoading?.()
    } catch {}
  }

  function hideLoading(ownerKey) {
    if (!loadingOwners.delete(ownerKey) || loadingOwners.size > 0) return
    try {
      hideNativeLoading?.()
    } catch {}
  }

  function hideAllLoading() {
    if (loadingOwners.size === 0) return
    loadingOwners.clear()
    try {
      hideNativeLoading?.()
    } catch {}
  }

  function clearRequestControllers() {
    accountController?.abort()
    submissionController?.abort()
    accountController = null
    submissionController = null
    submissionId += 1
  }

  function invalidate() {
    instanceId += 1
    clearRequestControllers()
  }

  function disableBackIntercept() {
    physicalBackProxy.clear()
    if (!backInterceptEnabled) return true
    backInterceptEnabled = false
    try {
      return setPhysicalBackIntercept?.({ enabled: false }) != null
    } catch {
      return false
    }
  }

  function enableBackIntercept() {
    physicalBackProxy.set(handlePhysicalBack)
    try {
      const requestId = setPhysicalBackIntercept?.({
        enabled: true,
        onIntercept: physicalBackProxy.handle,
      })
      backInterceptEnabled = requestId != null
    } catch {
      backInterceptEnabled = false
    }
  }

  function canSubmit() {
    return state.entryValid
      && state.rootState === 'list'
      && !state.submitting
      && !state.navigationLocked
      && state.accounts.some((item) => item.id === state.selectedAccountId)
  }

  function selectAccount(accountId) {
    if (
      disposed
      || state.rootState !== 'list'
      || state.submitting
      || state.navigationLocked
      || typeof accountId !== 'string'
      || accountId.length === 0
      || accountId === state.selectedAccountId
    ) return false
    if (!state.accounts.some((item) => item.id === accountId)) return false
    emit({ selectedAccountId: accountId })
    return true
  }

  async function loadAccounts(id) {
    accountController = createAbortController()
    let result
    try {
      result = await services.loadBankAccounts({ signal: accountController.signal })
    } catch {
      result = { type: 'request_failure' }
    }
    if (!isCurrent(id)) return
    accountController = null
    hideLoading(`load-${id}`)

    if (result?.type === 'success') {
      const accounts = Array.isArray(result.accounts) ? Object.freeze([...result.accounts]) : Object.freeze([])
      const rootState = accounts.length > 0 ? 'list' : 'empty'
      emit({
        rootState,
        accounts,
        selectedAccountId: rootState === 'list' ? findDefaultAccountId(accounts) : '',
      })
      return
    }

    emit({
      rootState: 'empty',
      accounts: Object.freeze([]),
      selectedAccountId: '',
    })
    if (result?.type === 'business_failure') {
      const message = normalizeMessage(result.message)
      if (message) onBusinessFailure(message)
    }
  }

  async function runSubmission() {
    if (!canSubmit()) return false
    const id = submissionId + 1
    submissionId = id
    submissionController = createAbortController()
    const accountId = state.selectedAccountId
    emit({ submitting: true })
    showLoading(`submit-${id}`)

    let result
    try {
      result = await services.updateLoanCard({
        accountId,
        signal: submissionController.signal,
      })
    } catch {
      result = { type: 'request_failure' }
    }

    if (disposed || id !== submissionId) return false
    submissionController = null
    hideLoading(`submit-${id}`)

    if (result?.type === 'success') {
      emit({ submitting: false, navigationLocked: true })
      try {
        onSuccessNotice()
      } catch {}
      onNavigateBack()
      return true
    }

    emit({ submitting: false })
    if (result?.type === 'business_failure') {
      const message = normalizeMessage(result.message)
      if (message) onBusinessFailure(message)
    }
    return false
  }

  function leave() {
    if (disposed || state.navigationLocked) return false
    invalidate()
    hideAllLoading()
    disableBackIntercept()
    emit({
      accounts: Object.freeze([]),
      selectedAccountId: '',
      submitting: false,
      navigationLocked: true,
    })
    onNavigateBack()
    return true
  }

  function handlePhysicalBack() {
    leave()
  }

  async function navigateAddPaymentMethod() {
    if (
      disposed
      || state.rootState !== 'list'
      || state.submitting
      || state.navigationLocked
    ) return false

    emit({ navigationLocked: true })
    try {
      const result = await onNavigateAddPaymentMethod()
      if (result === false && !disposed) emit({ navigationLocked: false })
      return result !== false
    } catch {
      if (!disposed) emit({ navigationLocked: false })
      return false
    }
  }

  return Object.freeze({
    initialize(query) {
      if (disposed || initialized) return false
      initialized = true
      if (!isValidEntryQuery(query)) {
        emit({ entryValid: false, rootState: 'empty' })
        return false
      }

      const id = instanceId + 1
      instanceId = id
      emit({
        entryValid: true,
        rootState: 'loading',
        accounts: Object.freeze([]),
        selectedAccountId: '',
        submitting: false,
        navigationLocked: false,
      })
      enableBackIntercept()
      showLoading(`load-${id}`)
      void loadAccounts(id)
      return true
    },
    selectAccount,
    submit() {
      if (!canSubmit()) return false
      void runSubmission()
      return true
    },
    navigateAddPaymentMethod,
    requestBack: leave,
    getState() {
      return state
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {}
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },
    canSubmit,
    dispose() {
      if (disposed) return
      invalidate()
      disableBackIntercept()
      hideAllLoading()
      disposed = true
      listeners.clear()
    },
  })
}
