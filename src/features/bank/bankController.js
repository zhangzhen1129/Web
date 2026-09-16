import { isBusinessHandledError } from '../../shared/businessError/index.js'
import {
  ACCOUNT_TYPE,
  BANK_OPTION_BY_CODE,
  BANK_OPTION_BY_NAME,
} from './bankData.js'
import {
  DEFAULT_ACCOUNT_TYPE,
  canReusePrefilledAccount,
  getAccountNumberError,
  getMaxAccountDigits,
  isAccountNumberValid,
  isAccountType,
  isSubmitEnabled,
  normalizeAccountNumber,
} from './bankForm.js'

export const BANK_DIALOG = Object.freeze({
  BANK: 'bank',
  CONFIRM: 'confirm',
  LEAVE: 'leave',
})

function createState() {
  return Object.freeze({
    entryValid: false,
    initialLoading: false,
    bankCode: '',
    accountType: DEFAULT_ACCOUNT_TYPE,
    accountNumber: '',
    recipientName: '',
    accountError: '',
    dialog: null,
    draftBankCode: '',
    submitting: false,
    navigationLocked: false,
  })
}

function textMessage(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : ''
}

function isValidEntryQuery(query) {
  return typeof query?.orderId === 'string'
    && query.orderId.trim().length > 0
    && query.from === 'order'
}

function isMarkedLoanCard(value) {
  return value === 1
}

function createConsumerProxy() {
  let consumer = null
  return Object.freeze({
    handle() { consumer?.() },
    set(nextConsumer) { consumer = typeof nextConsumer === 'function' ? nextConsumer : null },
    clear() { consumer = null },
  })
}

export function createBankController({
  services,
  showNativeLoading,
  hideNativeLoading,
  setPhysicalBackIntercept,
  createAbortController = () => new AbortController(),
  onBusinessFailure = () => {},
  onNavigateLoanConfirm = () => {},
  onNavigateBack = () => {},
} = {}) {
  if (!services || typeof services.getUserInfo !== 'function' || typeof services.getLoanAccounts !== 'function') {
    throw new TypeError('Bank services are required.')
  }
  if (typeof services.addLoanAccount !== 'function' || typeof services.bindLoanAccount !== 'function') {
    throw new TypeError('Bank submission services are required.')
  }

  let state = createState()
  let orderId = ''
  let instanceId = 0
  let initialized = false
  let disposed = false
  const loadingOwners = new Set()
  let userInfoController = null
  let loanAccountController = null
  let submissionController = null
  let submissionId = 0
  let prefillSnapshot = null
  let backInterceptEnabled = false
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

  function invalidate() {
    instanceId += 1
    userInfoController?.abort()
    loanAccountController?.abort()
    submissionController?.abort()
    userInfoController = null
    loanAccountController = null
    submissionController = null
    submissionId += 1
  }

  function showLoading(ownerKey) {
    const wasEmpty = loadingOwners.size === 0
    loadingOwners.add(ownerKey)
    if (!wasEmpty) return
    try { showNativeLoading?.() } catch {}
  }

  function hideLoading(ownerKey) {
    if (!loadingOwners.delete(ownerKey) || loadingOwners.size > 0) return
    try { hideNativeLoading?.() } catch {}
  }

  function hideAllLoading() {
    if (loadingOwners.size === 0) return
    loadingOwners.clear()
    try { hideNativeLoading?.() } catch {}
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

  function openLeaveConfirmation() {
    if (disposed || !state.entryValid || state.navigationLocked) return false
    emit({ dialog: BANK_DIALOG.LEAVE })
    return true
  }

  function handlePhysicalBack() {
    openLeaveConfirmation()
  }

  function applyPrefill(list) {
    const markedAccount = list.find((item) => item && isMarkedLoanCard(item.markLoanCard))
    if (!markedAccount) return

    const id = typeof markedAccount.id === 'string' ? markedAccount.id : ''
    const bank = typeof markedAccount.bank === 'string' ? BANK_OPTION_BY_NAME[markedAccount.bank] : null
    const accountType = markedAccount.type
    const accountNumber = typeof markedAccount.accountNumber === 'string' ? markedAccount.accountNumber : ''
    if (!id || !bank || !isAccountType(accountType) || !accountNumber || !isAccountNumberValid(bank, accountType, accountNumber)) return

    prefillSnapshot = Object.freeze({
      id,
      bankName: bank.name,
      accountNumber,
    })
    emit({
      bankCode: bank.code,
      accountType,
      accountNumber,
      accountError: '',
    })
  }

  async function loadLoanAccounts(id) {
    loanAccountController = createAbortController()
    try {
      const result = await services.getLoanAccounts({ signal: loanAccountController.signal })
      if (!isCurrent(id)) return
      if (result?.type === 'success') applyPrefill(result.list)
      else if (result?.type === 'business_failure') {
        const message = textMessage(result.message)
        if (message) onBusinessFailure(message)
      }
    } catch (error) {
      if (isCurrent(id) && isBusinessHandledError(error)) return
    } finally {
      if (isCurrent(id)) {
        loanAccountController = null
        hideLoading(`load-${id}`)
        emit({ initialLoading: false })
      }
    }
  }

  async function loadUserInfo(id) {
    userInfoController = createAbortController()
    try {
      const result = await services.getUserInfo({ signal: userInfoController.signal })
      if (!isCurrent(id)) return
      if (result?.type === 'success') {
        emit({ recipientName: result.recipientName })
      } else if (result?.type === 'business_failure') {
        const message = textMessage(result.message)
        if (message) onBusinessFailure(message)
      }
    } catch (error) {
      if (isCurrent(id) && isBusinessHandledError(error)) return
    } finally {
      if (isCurrent(id)) userInfoController = null
    }
  }

  function openBankPicker() {
    if (disposed || state.submitting || state.navigationLocked) return false
    const submittedBank = BANK_OPTION_BY_CODE[state.bankCode]
    const draftBank = BANK_OPTION_BY_CODE[state.draftBankCode]
    emit({
      dialog: BANK_DIALOG.BANK,
      draftBankCode: submittedBank?.code ?? draftBank?.code ?? '',
    })
    return true
  }

  function closeBankPicker() {
    if (state.dialog !== BANK_DIALOG.BANK) return false
    emit({ dialog: null })
    return true
  }

  function selectBankDraft(bankCode) {
    if (disposed || state.dialog !== BANK_DIALOG.BANK || !BANK_OPTION_BY_CODE[bankCode]) return false
    emit({ draftBankCode: bankCode })
    return true
  }

  function confirmBankSelection() {
    if (disposed || state.dialog !== BANK_DIALOG.BANK || state.submitting) return false
    const bank = BANK_OPTION_BY_CODE[state.draftBankCode] ?? null
    if (!bank) {
      emit({
        dialog: null,
        draftBankCode: '',
        bankCode: '',
        accountType: DEFAULT_ACCOUNT_TYPE,
        accountNumber: '',
        accountError: '',
      })
      return true
    }

    emit({
      dialog: null,
      draftBankCode: bank.code,
      bankCode: bank.code,
      accountType: DEFAULT_ACCOUNT_TYPE,
      accountNumber: '',
      accountError: '',
    })
    return true
  }

  function setAccountType(accountType) {
    if (disposed || state.submitting || !isAccountType(accountType) || state.accountType === accountType) return false
    emit({ accountType, accountNumber: '', accountError: '' })
    return true
  }

  function updateAccountNumber(value) {
    if (disposed || state.submitting) return false
    const bank = BANK_OPTION_BY_CODE[state.bankCode] ?? null
    const normalized = normalizeAccountNumber(value)
    const maxDigits = getMaxAccountDigits(bank, state.accountType)
    emit({ accountNumber: normalized.slice(0, maxDigits), accountError: '' })
    return true
  }

  function requestConfirmation() {
    if (disposed || state.submitting || state.navigationLocked || state.dialog) return false
    const bank = BANK_OPTION_BY_CODE[state.bankCode] ?? null
    if (!isSubmitEnabled({
      bank,
      accountNumber: state.accountNumber,
      recipientName: state.recipientName,
    })) return false
    if (!isAccountType(state.accountType)) return false
    if (!isAccountNumberValid(bank, state.accountType, state.accountNumber)) {
      emit({ accountError: getAccountNumberError(bank, state.accountType) })
      return false
    }
    emit({ dialog: BANK_DIALOG.CONFIRM, accountError: '' })
    return true
  }

  function closeConfirm() {
    if (state.dialog !== BANK_DIALOG.CONFIRM || state.submitting) return false
    emit({ dialog: null })
    return true
  }

  function normalizeFailure(result) {
    if (result?.type === 'business_failure') {
      return Object.freeze({ type: 'business_failure', message: textMessage(result.message) })
    }
    if (result?.type === 'invalid_response' || result?.type === 'invalid') {
      return Object.freeze({ type: 'invalid_response' })
    }
    return Object.freeze({ type: 'request_failure' })
  }

  async function runSubmission() {
    const bank = BANK_OPTION_BY_CODE[state.bankCode] ?? null
    const snapshot = Object.freeze({
      bank,
      accountType: state.accountType,
      accountNumber: state.accountNumber,
      recipientName: state.recipientName,
    })
    if (!bank || !isAccountType(snapshot.accountType) || !isAccountNumberValid(bank, snapshot.accountType, snapshot.accountNumber)) {
      return Object.freeze({ type: 'invalid' })
    }

    const id = submissionId + 1
    submissionId = id
    submissionController = createAbortController()
    emit({ submitting: true, dialog: null, accountError: '' })
    showLoading(`submit-${id}`)

    let result
    try {
      let accountId
      if (canReusePrefilledAccount({
        prefillSnapshot,
        bank: snapshot.bank,
        accountNumber: snapshot.accountNumber,
      })) {
        accountId = prefillSnapshot.id
      } else {
        const addResult = await services.addLoanAccount({
          accountNumber: snapshot.accountNumber,
          bank: snapshot.bank.name,
          name: snapshot.recipientName,
          bankCode: snapshot.bank.code,
          type: snapshot.accountType,
          signal: submissionController.signal,
        })
        if (addResult?.type !== 'success') {
          result = normalizeFailure(addResult)
        } else {
          accountId = addResult.id
        }
      }

      if (!result) {
        const bindResult = await services.bindLoanAccount({
          remittanceAccountId: accountId,
          orderId,
          signal: submissionController.signal,
        })
        result = bindResult?.type === 'success' ? Object.freeze({ type: 'success' }) : normalizeFailure(bindResult)
      }
    } catch (error) {
      result = isBusinessHandledError(error)
        ? Object.freeze({ type: 'handled_failure' })
        : error?.category === 'canceled'
          ? Object.freeze({ type: 'canceled' })
          : Object.freeze({ type: 'request_failure' })
    }

    if (disposed || id !== submissionId) return false
    submissionController = null
    hideLoading(`submit-${id}`)

    if (result?.type === 'success') {
      emit({ submitting: false, navigationLocked: true })
      disableBackIntercept()
      onNavigateLoanConfirm({ orderId })
      return true
    }

    emit({ submitting: false })
    if (result?.type === 'business_failure' && result.message) onBusinessFailure(result.message)
    return false
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
        emit({ entryValid: false, initialLoading: false })
        return false
      }

      orderId = query.orderId
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
      if (!backInterceptEnabled) physicalBackProxy.clear()

      const id = instanceId + 1
      instanceId = id
      emit({ entryValid: true, initialLoading: true })
      showLoading(`load-${id}`)
      void loadLoanAccounts(id)
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
    confirmSubmission() {
      if (disposed || state.dialog !== BANK_DIALOG.CONFIRM || state.submitting || state.navigationLocked) return false
      void runSubmission()
      return true
    },
    openLeaveConfirmation,
    cancelLeave() {
      if (state.dialog !== BANK_DIALOG.LEAVE) return false
      emit({ dialog: null })
      return true
    },
    confirmLeave() {
      if (disposed || state.navigationLocked) return false
      invalidate()
      disableBackIntercept()
      hideAllLoading()
      emit({ dialog: null, submitting: false, navigationLocked: true })
      onNavigateBack()
      return true
    },
    canSubmit() {
      const bank = BANK_OPTION_BY_CODE[state.bankCode] ?? null
      return state.entryValid
        && !state.submitting
        && !state.navigationLocked
        && isSubmitEnabled({
          bank,
          accountNumber: state.accountNumber,
          recipientName: state.recipientName,
        })
    },
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
