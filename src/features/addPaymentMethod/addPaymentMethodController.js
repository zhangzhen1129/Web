import { isBusinessHandledError } from '../../shared/businessError/index.js'
import { BANK_OPTION_BY_CODE } from '../bank/bankData.js'
import {
  DEFAULT_ACCOUNT_TYPE,
  getAccountNumberError,
  getMaxAccountDigits,
  isAccountNumberValid,
  isAccountType,
  isSubmitEnabled,
  normalizeAccountNumber,
} from '../bank/bankForm.js'

const DIALOG = Object.freeze({
  BANK: 'bank',
  CONFIRM: 'confirm',
})

function createState() {
  return Object.freeze({
    entryValid: false,
    bankCode: '',
    accountType: DEFAULT_ACCOUNT_TYPE,
    accountNumber: '',
    recipientName: '',
    dialog: null,
    draftBankCode: '',
    submitting: false,
    navigationLocked: false,
    submitEnabled: false,
  })
}

function getBank(bankCode) {
  return BANK_OPTION_BY_CODE[bankCode] ?? null
}

function textMessage(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : ''
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

export function createAddPaymentMethodController({
  services,
  showNativeLoading,
  hideNativeLoading,
  setPhysicalBackIntercept,
  createAbortController = () => new AbortController(),
  onBusinessFailure = () => {},
  onAccountFormatError = () => {},
  onSuccessNotice = () => {},
  onNavigateBack = () => {},
} = {}) {
  if (!services || typeof services.getUserInfo !== 'function' || typeof services.addLoanAccount !== 'function') {
    throw new TypeError('addPaymentMethod services are required.')
  }

  let state = createState()
  let initialized = false
  let disposed = false
  let instanceId = 0
  let submissionId = 0
  let submissionController = null
  let userInfoController = null
  let confirmationSnapshot = null
  let loadingOwner = null
  let backInterceptEnabled = false
  const listeners = new Set()
  const physicalBackProxy = createConsumerProxy()

  function emit(partial = {}) {
    if (disposed) return

    const nextState = { ...state, ...partial }
    nextState.submitEnabled = nextState.entryValid
      && !nextState.submitting
      && !nextState.navigationLocked
      && nextState.dialog === null
      && isSubmitEnabled({
        bank: getBank(nextState.bankCode),
        accountNumber: nextState.accountNumber,
      })

    state = Object.freeze(nextState)
    listeners.forEach((listener) => listener(state))
  }

  function isCurrentInstance(id) {
    return !disposed && id === instanceId
  }

  function isCurrentSubmission(id) {
    return !disposed && id === submissionId
  }

  function invalidate() {
    instanceId += 1
    submissionId += 1
    userInfoController?.abort()
    submissionController?.abort()
    userInfoController = null
    submissionController = null
    confirmationSnapshot = null
  }

  async function loadUserInfo(id) {
    try {
      userInfoController = createAbortController()
    } catch {
      userInfoController = null
      return false
    }

    try {
      const result = await services.getUserInfo({ signal: userInfoController.signal })
      if (!isCurrentInstance(id)) return false
      if (result?.type === 'success') {
        emit({ recipientName: typeof result.recipientName === 'string' ? result.recipientName : '' })
      } else if (result?.type === 'business_failure') {
        const message = textMessage(result.message)
        if (message) onBusinessFailure(message)
      }
      return result?.type === 'success'
    } catch (error) {
      if (isCurrentInstance(id) && !isBusinessHandledError(error) && error?.category !== 'canceled') {
        // Request failures leave the name empty and do not block the form.
      }
      return false
    } finally {
      if (isCurrentInstance(id)) userInfoController = null
    }
  }

  function showLoading(ownerKey) {
    if (loadingOwner !== null) return
    loadingOwner = ownerKey
    try {
      showNativeLoading?.()
    } catch {
      // Loading failures must not change page flow.
    }
  }

  function hideLoading(ownerKey) {
    if (loadingOwner !== ownerKey) return
    loadingOwner = null
    try {
      hideNativeLoading?.()
    } catch {
      // Loading failures must not change page flow.
    }
  }

  function hideAllLoading() {
    if (loadingOwner === null) return
    const ownerKey = loadingOwner
    hideLoading(ownerKey)
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

  function isInteractionBlocked() {
    return disposed
      || !state.entryValid
      || state.navigationLocked
      || state.submitting
      || state.dialog !== null
  }

  function openBankPicker() {
    if (isInteractionBlocked()) return false

    const selectedBank = getBank(state.bankCode)
    const previousDraft = getBank(state.draftBankCode)
    const draftBankCode = selectedBank?.code ?? previousDraft?.code ?? ''

    emit({
      dialog: DIALOG.BANK,
      draftBankCode,
    })
    return true
  }

  function closeBankPicker() {
    if (disposed || state.dialog !== DIALOG.BANK) return false
    emit({ dialog: null })
    return true
  }

  function selectBankDraft(bankCode) {
    if (disposed || state.dialog !== DIALOG.BANK) return false
    emit({ draftBankCode: typeof bankCode === 'string' ? bankCode : '' })
    return true
  }

  function confirmBankSelection() {
    if (disposed || state.dialog !== DIALOG.BANK) return false

    const bank = getBank(state.draftBankCode)
    confirmationSnapshot = null

    if (!bank) {
      emit({
        bankCode: '',
        accountType: DEFAULT_ACCOUNT_TYPE,
        accountNumber: '',
        draftBankCode: '',
        dialog: null,
      })
      return true
    }

    emit({
      bankCode: bank.code,
      accountType: DEFAULT_ACCOUNT_TYPE,
      accountNumber: '',
      draftBankCode: bank.code,
      dialog: null,
    })
    return true
  }

  function setAccountType(accountType) {
    if (isInteractionBlocked() || !isAccountType(accountType)) return false
    if (state.accountType === accountType) return false

    confirmationSnapshot = null
    emit({
      accountType,
      accountNumber: '',
    })
    return true
  }

  function updateAccountNumber(accountNumber) {
    if (isInteractionBlocked()) return false

    const maxDigits = getMaxAccountDigits(getBank(state.bankCode), state.accountType)
    const normalizedAccountNumber = normalizeAccountNumber(accountNumber).slice(0, maxDigits)
    if (normalizedAccountNumber === state.accountNumber) return false

    confirmationSnapshot = null
    emit({ accountNumber: normalizedAccountNumber })
    return true
  }

  function requestConfirmation() {
    if (isInteractionBlocked()) return false

    const bank = getBank(state.bankCode)
    if (!bank || state.accountNumber.length === 0) return false
    if (!isAccountType(state.accountType)) return false
    if (!isAccountNumberValid(bank, state.accountType, state.accountNumber)) {
      onAccountFormatError(getAccountNumberError())
      return false
    }

    confirmationSnapshot = Object.freeze({
      bankCode: bank.code,
      bankName: bank.name,
      accountType: state.accountType,
      accountNumber: state.accountNumber,
      recipientName: state.recipientName,
    })
    emit({ dialog: DIALOG.CONFIRM })
    return true
  }

  function closeConfirm() {
    if (disposed || state.dialog !== DIALOG.CONFIRM || state.submitting || state.navigationLocked) {
      return false
    }

    confirmationSnapshot = null
    emit({ dialog: null })
    return true
  }

  async function runSubmission(id, snapshot, signal) {
    const ownerKey = `submit-${id}`
    let result

    try {
      result = await services.addLoanAccount({
        accountNumber: snapshot.accountNumber,
        bank: snapshot.bankName,
        name: snapshot.recipientName,
        bankCode: snapshot.bankCode,
        type: snapshot.accountType,
        signal,
      })
    } catch (error) {
      if (!isCurrentSubmission(id)) return false
      if (isBusinessHandledError(error)) {
        result = Object.freeze({ type: 'handled_failure' })
      } else if (error?.category === 'canceled') {
        result = Object.freeze({ type: 'canceled' })
      } else {
        result = Object.freeze({ type: 'request_failure' })
      }
    }

    if (!isCurrentSubmission(id)) return false

    submissionController = null
    hideLoading(ownerKey)
    confirmationSnapshot = null

    if (result?.type === 'success') {
      submissionId += 1
      disableBackIntercept()
      emit({
        dialog: null,
        submitting: false,
        navigationLocked: true,
      })
      onSuccessNotice()
      onNavigateBack()
      return true
    }

    emit({
      dialog: null,
      submitting: false,
    })

    if (result?.type === 'business_failure') {
      const message = textMessage(result.message)
      if (message) onBusinessFailure(message)
    }
    return false
  }

  function confirmSubmission() {
    if (disposed || !state.entryValid || state.dialog !== DIALOG.CONFIRM || state.submitting || state.navigationLocked) {
      return false
    }

    const snapshot = confirmationSnapshot
    const bank = snapshot ? getBank(snapshot.bankCode) : null
    if (!snapshot || !bank || !isAccountType(snapshot.accountType) || !isAccountNumberValid(bank, snapshot.accountType, snapshot.accountNumber)) {
      return false
    }

    const id = submissionId + 1
    submissionId = id

    try {
      submissionController = createAbortController()
    } catch {
      submissionController = null
      return false
    }

    emit({
      dialog: null,
      submitting: true,
    })
    showLoading(`submit-${id}`)
    void runSubmission(id, snapshot, submissionController.signal)
    return true
  }

  function requestBack() {
    if (disposed || !state.entryValid || state.navigationLocked) return false

    invalidate()
    disableBackIntercept()
    hideAllLoading()
    emit({
      dialog: null,
      submitting: false,
      navigationLocked: true,
    })
    onNavigateBack()
    return true
  }

  function handlePhysicalBack() {
    requestBack()
  }

  return Object.freeze({
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },
    initialize() {
      if (disposed || initialized) return false
      initialized = true

      physicalBackProxy.set(handlePhysicalBack)
      try {
        backInterceptEnabled = setPhysicalBackIntercept?.({
          enabled: true,
          onIntercept: physicalBackProxy.handle,
        }) != null
      } catch {
        backInterceptEnabled = false
      }
      if (!backInterceptEnabled) physicalBackProxy.clear()

      const id = instanceId + 1
      instanceId = id
      emit({
        entryValid: true,
        bankCode: '',
        accountType: DEFAULT_ACCOUNT_TYPE,
        accountNumber: '',
        recipientName: '',
        dialog: null,
        draftBankCode: '',
        submitting: false,
        navigationLocked: false,
      })
      void loadUserInfo(id)
      return true
    },
    openBankPicker,
    closeBankPicker,
    selectBankDraft,
    confirmBankSelection,
    setAccountType,
    updateAccountNumber,
    requestConfirmation,
    closeConfirm,
    confirmSubmission,
    requestBack,
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

