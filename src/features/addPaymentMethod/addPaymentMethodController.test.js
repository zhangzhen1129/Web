import assert from 'node:assert/strict'
import test from 'node:test'
import { ACCOUNT_TYPE } from '../bank/bankData.js'
import { getAccountNumberError } from '../bank/bankForm.js'
import { createAddPaymentMethodController } from './addPaymentMethodController.js'

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createHarness(overrides = {}) {
  const calls = []
  let backConfig = null
  let abortCount = 0
  const services = {
    async getUserInfo() {
      calls.push('user:get')
      return { type: 'success', recipientName: 'Fixture User' }
    },
    async addLoanAccount(payload) {
      calls.push({ kind: 'service', payload })
      return { type: 'success' }
    },
    ...(overrides.services ?? {}),
  }
  const { services: ignoredServices, ...options } = overrides
  const controller = createAddPaymentMethodController({
    services,
    showNativeLoading: () => calls.push('loading:show'),
    hideNativeLoading: () => calls.push('loading:hide'),
    setPhysicalBackIntercept(config) {
      calls.push(config.enabled ? 'back:on' : 'back:off')
      backConfig = config
      return config.enabled ? 'enable-id' : 'disable-id'
    },
    createAbortController() {
      const controller = {
        signal: { aborted: false },
        abort() {
          controller.signal.aborted = true
          abortCount += 1
        },
      }
      return controller
    },
    onBusinessFailure: (message) => calls.push(`business:${message}`),
    onAccountFormatError: (message) => calls.push(`format:${message}`),
    onSuccessNotice: () => calls.push('notice:success'),
    onNavigateBack: () => calls.push('navigate:back'),
    ...options,
  })
  return {
    calls,
    controller,
    getBackConfig: () => backConfig,
    getAbortCount: () => abortCount,
    serviceCalls: () => calls.filter((call) => call.kind === 'service'),
    count: (value) => calls.filter((call) => call === value).length,
  }
}

function selectBank(controller, bankCode) {
  assert.equal(controller.openBankPicker(), true)
  assert.equal(controller.selectBankDraft(bankCode), true)
  assert.equal(controller.confirmBankSelection(), true)
}

function prepareConfirmation(controller, bankCode, accountNumber) {
  selectBank(controller, bankCode)
  controller.updateAccountNumber(accountNumber)
  assert.equal(controller.requestConfirmation(), true)
}

test('initializes an empty form, requests user information, and enables physical back once', () => {
  const harness = createHarness()
  const snapshots = []
  const unsubscribe = harness.controller.subscribe((state) => snapshots.push(state))

  assert.equal(harness.controller.initialize(), true)
  const state = harness.controller.getState()
  assert.equal(state.entryValid, true)
  assert.equal(state.bankCode, '')
  assert.equal(state.accountType, ACCOUNT_TYPE.SAVINGS)
  assert.equal(state.accountNumber, '')
  assert.equal(state.dialog, null)
  assert.equal(state.draftBankCode, '')
  assert.equal(state.submitting, false)
  assert.equal(state.navigationLocked, false)
  assert.equal(state.submitEnabled, false)
  assert.equal(harness.controller.initialize(), false)
  assert.deepEqual(harness.calls, ['back:on', 'user:get'])
  assert.equal(snapshots.at(-1).entryValid, true)
  unsubscribe()
})

test('loads user information once and uses the resolved name in the submission snapshot', async () => {
  const harness = createHarness()
  harness.controller.initialize()
  await flush()

  assert.equal(harness.count('user:get'), 1)
  assert.equal(harness.controller.getState().recipientName, 'Fixture User')

  prepareConfirmation(harness.controller, '2', '1234567890123')
  harness.controller.confirmSubmission()
  await flush()

  assert.equal(harness.serviceCalls().length, 1)
  assert.equal(harness.serviceCalls()[0].payload.name, 'Fixture User')
})

test('keeps a user information business failure silent after one message and submits an empty name', async () => {
  const harness = createHarness({
    services: {
      async getUserInfo() {
        harness.calls.push('user:get')
        return { type: 'business_failure', message: 'User information unavailable' }
      },
    },
  })
  harness.controller.initialize()
  await flush()

  assert.equal(harness.count('user:get'), 1)
  assert.equal(harness.count('business:User information unavailable'), 1)
  assert.equal(harness.controller.getState().recipientName, '')

  prepareConfirmation(harness.controller, '2', '1234567890123')
  harness.controller.confirmSubmission()
  await flush()
  assert.equal(harness.serviceCalls()[0].payload.name, '')
})

test('aborts user information on leave and ignores its late result', async () => {
  const deferred = createDeferred()
  const harness = createHarness({
    services: {
      async getUserInfo() {
        harness.calls.push('user:get')
        return deferred.promise
      },
    },
  })
  harness.controller.initialize()
  assert.equal(harness.controller.requestBack(), true)
  assert.equal(harness.getAbortCount(), 1)

  deferred.resolve({ type: 'success', recipientName: 'Late User' })
  await flush()

  assert.equal(harness.controller.getState().recipientName, '')
  assert.equal(harness.count('navigate:back'), 1)
})
test('does not let an API-002 result resolved after confirmation rewrite the submission snapshot', async () => {
  const deferred = createDeferred()
  const harness = createHarness({
    services: {
      async getUserInfo() {
        harness.calls.push('user:get')
        return deferred.promise
      },
    },
  })
  harness.controller.initialize()
  prepareConfirmation(harness.controller, '2', '1234567890123')

  deferred.resolve({ type: 'success', recipientName: 'Late User' })
  await flush()
  assert.equal(harness.controller.getState().recipientName, 'Late User')

  harness.controller.confirmSubmission()
  await flush()
  assert.equal(harness.serviceCalls()[0].payload.name, '')
})
test('keeps confirmed values on picker close and restores the selected bank when reopened', () => {
  const harness = createHarness()
  harness.controller.initialize()

  assert.equal(harness.controller.openBankPicker(), true)
  assert.equal(harness.controller.selectBankDraft('3'), true)
  assert.equal(harness.controller.closeBankPicker(), true)
  assert.equal(harness.controller.getState().bankCode, '')
  assert.equal(harness.controller.getState().draftBankCode, '3')

  assert.equal(harness.controller.openBankPicker(), true)
  assert.equal(harness.controller.selectBankDraft('3'), true)
  assert.equal(harness.controller.confirmBankSelection(), true)
  assert.equal(harness.controller.setAccountType(ACCOUNT_TYPE.CHECKING), true)
  assert.equal(harness.controller.updateAccountNumber('12345678901234'), true)

  assert.equal(harness.controller.openBankPicker(), true)
  assert.equal(harness.controller.getState().draftBankCode, '3')
  assert.equal(harness.controller.selectBankDraft('2'), true)
  assert.equal(harness.controller.closeBankPicker(), true)

  const state = harness.controller.getState()
  assert.equal(state.bankCode, '3')
  assert.equal(state.accountType, ACCOUNT_TYPE.CHECKING)
  assert.equal(state.accountNumber, '1234567890123')
})

test('resets the form after a valid bank selection and clears it after an invalid draft', () => {
  const harness = createHarness()
  harness.controller.initialize()

  selectBank(harness.controller, '3')
  harness.controller.setAccountType(ACCOUNT_TYPE.CHECKING)
  harness.controller.updateAccountNumber('12345678901234')
  selectBank(harness.controller, '2')

  assert.equal(harness.controller.getState().bankCode, '2')
  assert.equal(harness.controller.getState().accountType, ACCOUNT_TYPE.SAVINGS)
  assert.equal(harness.controller.getState().accountNumber, '')

  assert.equal(harness.controller.openBankPicker(), true)
  assert.equal(harness.controller.selectBankDraft('missing'), true)
  assert.equal(harness.controller.confirmBankSelection(), true)

  assert.equal(harness.controller.getState().bankCode, '')
  assert.equal(harness.controller.getState().accountType, ACCOUNT_TYPE.SAVINGS)
  assert.equal(harness.controller.getState().accountNumber, '')
  assert.equal(harness.controller.getState().draftBankCode, '')
  assert.equal(harness.controller.getState().submitEnabled, false)
})

test('clears the account number on account type changes and enables submit by presence only', () => {
  const harness = createHarness()
  harness.controller.initialize()
  selectBank(harness.controller, '2')
  assert.equal(harness.controller.updateAccountNumber('1'), true)
  assert.equal(harness.controller.getState().submitEnabled, true)

  assert.equal(harness.controller.setAccountType(ACCOUNT_TYPE.CHECKING), true)
  assert.equal(harness.controller.getState().accountType, ACCOUNT_TYPE.CHECKING)
  assert.equal(harness.controller.getState().accountNumber, '')
  assert.equal(harness.controller.getState().submitEnabled, false)

  assert.equal(harness.controller.updateAccountNumber('12'), true)
  assert.equal(harness.controller.getState().submitEnabled, true)
  assert.equal(harness.controller.setAccountType(ACCOUNT_TYPE.SAVINGS), true)
  assert.equal(harness.controller.getState().accountNumber, '')
})

test('normalizes account input and applies the bank-specific maximum length', () => {
  const harness = createHarness()
  harness.controller.initialize()
  selectBank(harness.controller, '3')

  assert.equal(harness.controller.updateAccountNumber('12 34a5678901234567'), true)
  assert.equal(harness.controller.getState().accountNumber, '12345678901234')
  assert.equal(harness.controller.getState().submitEnabled, true)
})

test('validates account length only before confirmation and reports one format error', () => {
  const harness = createHarness()
  harness.controller.initialize()
  selectBank(harness.controller, '2')
  harness.controller.updateAccountNumber('123')

  assert.equal(harness.controller.requestConfirmation(), false)
  assert.equal(harness.controller.getState().dialog, null)
  assert.equal(harness.count(`format:${getAccountNumberError()}`), 1)

  assert.equal(harness.controller.updateAccountNumber('1234567890123'), true)
  assert.equal(harness.controller.requestConfirmation(), true)
  assert.equal(harness.controller.getState().dialog, 'confirm')
  assert.equal(harness.count(`format:${getAccountNumberError()}`), 1)
  assert.equal(harness.controller.requestConfirmation(), false)
})

test('canceling confirmation preserves the form and selected state', () => {
  const harness = createHarness()
  harness.controller.initialize()
  prepareConfirmation(harness.controller, '2', '1234567890123')

  const beforeCancel = harness.controller.getState()
  assert.equal(harness.controller.closeConfirm(), true)
  const afterCancel = harness.controller.getState()
  assert.equal(afterCancel.dialog, null)
  assert.equal(afterCancel.bankCode, beforeCancel.bankCode)
  assert.equal(afterCancel.accountType, beforeCancel.accountType)
  assert.equal(afterCancel.accountNumber, beforeCancel.accountNumber)
  assert.equal(harness.serviceCalls().length, 0)
})

test('submits one locked snapshot and treats a success response without id as success', async () => {
  const harness = createHarness()
  harness.controller.initialize()
  prepareConfirmation(harness.controller, '2', '1234567890123')

  assert.equal(harness.controller.confirmSubmission(), true)
  assert.equal(harness.controller.confirmSubmission(), false)
  assert.equal(harness.controller.updateAccountNumber('999'), false)
  assert.equal(harness.controller.getState().accountNumber, '1234567890123')
  assert.equal(harness.controller.getState().submitting, true)
  assert.equal(harness.count('loading:show'), 1)

  await flush()

  const serviceCalls = harness.serviceCalls()
  assert.equal(serviceCalls.length, 1)
  assert.equal(serviceCalls[0].payload.accountNumber, '1234567890123')
  assert.equal(serviceCalls[0].payload.bank, 'Interbank')
  assert.equal(serviceCalls[0].payload.name, '')
  assert.equal(serviceCalls[0].payload.bankCode, '2')
  assert.equal(serviceCalls[0].payload.type, ACCOUNT_TYPE.SAVINGS)
  assert.equal(serviceCalls[0].payload.signal.aborted, false)
  assert.equal(harness.count('loading:hide'), 1)
  assert.equal(harness.count('notice:success'), 1)
  assert.equal(harness.count('navigate:back'), 1)
  assert.equal(harness.controller.getState().submitting, false)
  assert.equal(harness.controller.getState().navigationLocked, true)
  assert.ok(harness.calls.indexOf('loading:hide') < harness.calls.indexOf('notice:success'))
  assert.ok(harness.calls.indexOf('notice:success') < harness.calls.indexOf('navigate:back'))
})

test('shows a valid business failure message once and allows a later retry', async () => {
  let serviceCount = 0
  const harness = createHarness({
    services: {
      async addLoanAccount(payload) {
        serviceCount += 1
        harness.calls.push({ kind: 'service', payload })
        return { type: 'business_failure', message: 'Try again.' }
      },
    },
  })
  harness.controller.initialize()
  prepareConfirmation(harness.controller, '2', '1234567890123')
  harness.controller.confirmSubmission()
  await flush()

  assert.equal(serviceCount, 1)
  assert.equal(harness.count('business:Try again.'), 1)
  assert.equal(harness.count('notice:success'), 0)
  assert.equal(harness.count('navigate:back'), 0)
  assert.equal(harness.count('loading:hide'), 1)
  assert.equal(harness.controller.getState().submitting, false)
  assert.equal(harness.controller.getState().navigationLocked, false)
  assert.equal(harness.controller.getState().accountNumber, '1234567890123')

  assert.equal(harness.controller.requestConfirmation(), true)
  assert.equal(harness.controller.confirmSubmission(), true)
  await flush()
  assert.equal(serviceCount, 2)
})

test('keeps request exceptions and globally handled errors silent', async () => {
  const requestFailure = createHarness({
    services: {
      async addLoanAccount() {
        throw new Error('network down')
      },
    },
  })
  requestFailure.controller.initialize()
  prepareConfirmation(requestFailure.controller, '2', '1234567890123')
  requestFailure.controller.confirmSubmission()
  await flush()

  assert.equal(requestFailure.count('business:network down'), 0)
  assert.equal(requestFailure.count('notice:success'), 0)
  assert.equal(requestFailure.count('navigate:back'), 0)
  assert.equal(requestFailure.count('loading:hide'), 1)
  assert.equal(requestFailure.controller.getState().submitting, false)

  const handledFailure = createHarness({
    services: {
      async addLoanAccount() {
        const error = new Error('handled')
        error.businessHandled = true
        throw error
      },
    },
  })
  handledFailure.controller.initialize()
  prepareConfirmation(handledFailure.controller, '2', '1234567890123')
  handledFailure.controller.confirmSubmission()
  await flush()

  assert.equal(handledFailure.count('business:handled'), 0)
  assert.equal(handledFailure.count('notice:success'), 0)
  assert.equal(handledFailure.count('navigate:back'), 0)
  assert.equal(handledFailure.count('loading:hide'), 1)
})

test('keeps cancellation results and canceled exceptions silent', async () => {
  const returnedCancellation = createHarness({
    services: {
      async addLoanAccount() {
        return { type: 'canceled' }
      },
    },
  })
  returnedCancellation.controller.initialize()
  prepareConfirmation(returnedCancellation.controller, '2', '1234567890123')
  returnedCancellation.controller.confirmSubmission()
  await flush()

  assert.equal(returnedCancellation.count('notice:success'), 0)
  assert.equal(returnedCancellation.count('navigate:back'), 0)
  assert.equal(returnedCancellation.count('loading:hide'), 1)
  assert.equal(returnedCancellation.controller.getState().submitting, false)

  const thrownCancellation = createHarness({
    services: {
      async addLoanAccount() {
        throw { category: 'canceled' }
      },
    },
  })
  thrownCancellation.controller.initialize()
  prepareConfirmation(thrownCancellation.controller, '2', '1234567890123')
  thrownCancellation.controller.confirmSubmission()
  await flush()

  assert.equal(thrownCancellation.count('notice:success'), 0)
  assert.equal(thrownCancellation.count('navigate:back'), 0)
  assert.equal(thrownCancellation.count('loading:hide'), 1)
})

test('visible return aborts work, cleans up once, and ignores a late success result', async () => {
  const deferred = createDeferred()
  const harness = createHarness({
    services: {
      async addLoanAccount(payload) {
        harness.calls.push({ kind: 'service', payload })
        return deferred.promise
      },
    },
  })
  harness.controller.initialize()
  prepareConfirmation(harness.controller, '2', '1234567890123')
  harness.controller.confirmSubmission()

  assert.equal(harness.controller.requestBack(), true)
  assert.equal(harness.controller.requestBack(), false)
  assert.equal(harness.getAbortCount(), 2)
  assert.equal(harness.count('back:off'), 1)
  assert.equal(harness.count('loading:hide'), 1)
  assert.equal(harness.count('navigate:back'), 1)
  assert.equal(harness.controller.getState().dialog, null)
  assert.equal(harness.controller.getState().submitting, false)
  assert.equal(harness.controller.getState().navigationLocked, true)

  deferred.resolve({ type: 'success' })
  await flush()

  assert.equal(harness.count('notice:success'), 0)
  assert.equal(harness.count('navigate:back'), 1)
  assert.equal(harness.count('loading:hide'), 1)
  assert.equal(harness.getAbortCount(), 2)
})

test('physical back uses direct leave cleanup without a leave dialog', () => {
  const harness = createHarness()
  harness.controller.initialize()
  harness.controller.openBankPicker()

  const backConfig = harness.getBackConfig()
  backConfig.onIntercept()

  assert.equal(harness.controller.getState().dialog, null)
  assert.equal(harness.controller.getState().navigationLocked, true)
  assert.equal(harness.count('back:off'), 1)
  assert.equal(harness.count('navigate:back'), 1)

  backConfig.onIntercept()
  assert.equal(harness.count('back:off'), 1)
  assert.equal(harness.count('navigate:back'), 1)
})

test('dispose aborts active work, cleans resources once, and ignores late results', async () => {
  const deferred = createDeferred()
  const harness = createHarness({
    services: {
      async addLoanAccount(payload) {
        harness.calls.push({ kind: 'service', payload })
        return deferred.promise
      },
    },
  })
  harness.controller.initialize()
  prepareConfirmation(harness.controller, '2', '1234567890123')
  harness.controller.confirmSubmission()

  harness.controller.dispose()
  harness.controller.dispose()

  assert.equal(harness.getAbortCount(), 2)
  assert.equal(harness.count('back:off'), 1)
  assert.equal(harness.count('loading:hide'), 1)
  assert.equal(harness.count('notice:success'), 0)
  assert.equal(harness.count('navigate:back'), 0)

  deferred.resolve({ type: 'success' })
  await flush()

  assert.equal(harness.count('notice:success'), 0)
  assert.equal(harness.count('navigate:back'), 0)
  assert.equal(harness.count('loading:hide'), 1)
})

