import assert from 'node:assert/strict'
import test from 'node:test'
import { ACCOUNT_TYPE } from './bankData.js'
import { BANK_DIALOG, createBankController } from './bankController.js'

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function createHarness(overrides = {}) {
  const calls = []
  let backConfig = null
  let abortCount = 0
  const services = {
    async getUserInfo() { calls.push('user:get'); return { type: 'success', recipientName: 'Ana Perez' } },
    async getLoanAccounts() { calls.push('accounts:get'); return { type: 'success', list: [] } },
    async addLoanAccount(payload) { calls.push(`add:${payload.accountNumber}:${payload.bank}:${payload.type}`); return { type: 'success', id: 'new-account' } },
    async bindLoanAccount(payload) { calls.push(`bind:${payload.remittanceAccountId}:${payload.orderId}`); return { type: 'success' } },
    ...overrides.services,
  }
  const controller = createBankController({
    services,
    showNativeLoading: () => calls.push('loading:show'),
    hideNativeLoading: () => calls.push('loading:hide'),
    setPhysicalBackIntercept(config) {
      calls.push(config.enabled ? 'back:on' : 'back:off')
      backConfig = config
      return config.enabled ? 'enable-id' : 'disable-id'
    },
    createAbortController: () => ({
      signal: { aborted: false },
      abort() { this.signal.aborted = true; abortCount += 1 },
    }),
    onBusinessFailure: (message) => calls.push(`business:${message}`),
    onAccountFormatError: (message) => calls.push(`format:${message}`),
    onNavigateLoanConfirm: ({ orderId }) => calls.push(`navigate:loanConfirm:${orderId}`),
    onNavigateBack: () => calls.push('navigate:back'),
    ...overrides,
  })
  return { calls, controller, getBackConfig: () => backConfig, abortCount: () => abortCount }
}

test('rejects invalid route input without requests, form writes, or navigation', () => {
  const harness = createHarness()
  assert.equal(harness.controller.initialize({ orderId: '', from: 'order' }), false)
  assert.equal(harness.controller.getState().entryValid, false)
  assert.deepEqual(harness.calls, [])
})

test('loads user info and prefills the first marked loan card', async () => {
  const harness = createHarness({
    services: {
      async getUserInfo() { return { type: 'success', recipientName: 'Ana Perez' } },
      async getLoanAccounts() {
        return {
          type: 'success',
          list: [
            { id: 'ignored', bank: 'BBVA', type: 1, accountNumber: '1', markLoanCard: 0 },
            { id: 'account-1', bank: 'BBVA', type: 1, accountNumber: '12345678901234567890', markLoanCard: 1 },
          ],
        }
      },
      async addLoanAccount() { throw new Error('not used') },
      async bindLoanAccount() { throw new Error('not used') },
    },
  })
  harness.controller.initialize({ orderId: 'order-1', from: 'order' })
  await flush()
  const state = harness.controller.getState()
  assert.equal(state.entryValid, true)
  assert.equal(state.bankCode, '1')
  assert.equal(state.accountType, ACCOUNT_TYPE.SAVINGS)
  assert.equal(state.accountNumber, '12345678901234567890')
  assert.equal(state.recipientName, 'Ana Perez')
  assert.equal(harness.calls.includes('loading:show'), true)
  assert.equal(harness.calls.includes('loading:hide'), true)
})

test('resets account type and account number when a bank is confirmed or changed', () => {
  const harness = createHarness()
  harness.controller.initialize({ orderId: 'order-1', from: 'order' })
  harness.controller.updateAccountNumber('12345678901234567890')
  harness.controller.setAccountType(ACCOUNT_TYPE.CHECKING)
  assert.equal(harness.controller.getState().accountType, ACCOUNT_TYPE.CHECKING)
  assert.equal(harness.controller.getState().accountNumber, '')

  harness.controller.openBankPicker()
  harness.controller.selectBankDraft('3')
  harness.controller.confirmBankSelection()
  assert.equal(harness.controller.getState().bankCode, '3')
  assert.equal(harness.controller.getState().accountType, ACCOUNT_TYPE.SAVINGS)
  assert.equal(harness.controller.getState().accountNumber, '')
})

test('validates account length only after bank and account are present, then reports one toast', async () => {
  const harness = createHarness()
  harness.controller.initialize({ orderId: 'order-1', from: 'order' })
  await flush()
  harness.controller.openBankPicker()
  harness.controller.selectBankDraft('2')
  harness.controller.confirmBankSelection()
  harness.controller.updateAccountNumber('123')
  assert.equal(harness.controller.requestConfirmation(), false)
  assert.equal(harness.controller.getState().accountError, undefined)
  assert.equal(harness.calls.includes('format:Número de cuenta del recibo con formato incorrecto'), true)
  harness.controller.updateAccountNumber('1234567890123')
  assert.equal(harness.controller.requestConfirmation(), true)
  assert.equal(harness.controller.getState().dialog, BANK_DIALOG.CONFIRM)
})

test('enables submit and submits with an empty recipient name when the name request yields nothing', async () => {
  const harness = createHarness({
    services: {
      async getUserInfo() { return { type: 'success', recipientName: '' } },
      async getLoanAccounts() { return { type: 'success', list: [] } },
      async addLoanAccount(payload) {
        harness.calls.push(`addName:${JSON.stringify(payload.name)}`)
        return { type: 'success', id: 'new-account' }
      },
      async bindLoanAccount() { return { type: 'success' } },
    },
  })
  harness.controller.initialize({ orderId: 'order-1', from: 'order' })
  await flush()
  harness.controller.openBankPicker()
  harness.controller.selectBankDraft('2')
  harness.controller.confirmBankSelection()
  harness.controller.updateAccountNumber('1234567890123')
  assert.equal(harness.controller.canSubmit(), true)
  assert.equal(harness.controller.requestConfirmation(), true)
  harness.controller.confirmSubmission()
  await flush()
  assert.equal(harness.calls.includes('addName:""'), true)
  assert.equal(harness.calls.includes('navigate:loanConfirm:order-1'), true)
})

test('prefills the marked loan card without applying the digit rule', async () => {
  const harness = createHarness({
    services: {
      async getUserInfo() { return { type: 'success', recipientName: 'Ana' } },
      async getLoanAccounts() {
        return {
          type: 'success',
          list: [{ id: 'account-1', bank: 'Scotiabank', type: 1, accountNumber: '123', markLoanCard: 1 }],
        }
      },
      async addLoanAccount() { throw new Error('not used') },
      async bindLoanAccount() { throw new Error('not used') },
    },
  })
  harness.controller.initialize({ orderId: 'order-1', from: 'order' })
  await flush()
  const state = harness.controller.getState()
  assert.equal(state.bankCode, '4')
  assert.equal(state.accountNumber, '123')
})

test('skips add and binds the prefilled account when bank and account match', async () => {
  const harness = createHarness({
    services: {
      async getUserInfo() { return { type: 'success', recipientName: 'Ana Perez' } },
      async getLoanAccounts() {
        return { type: 'success', list: [{ id: 'account-1', bank: 'BBVA', type: 0, accountNumber: '12345678901234567890', markLoanCard: 1 }] }
      },
      async addLoanAccount() { throw new Error('add must be skipped') },
      async bindLoanAccount(payload) { harness.calls.push(`bind:${payload.remittanceAccountId}:${payload.orderId}`); return { type: 'success' } },
    },
  })
  harness.controller.initialize({ orderId: 'order-1', from: 'order' })
  await flush()
  harness.controller.setAccountType(ACCOUNT_TYPE.SAVINGS)
  harness.controller.updateAccountNumber('12345678901234567890')
  harness.controller.requestConfirmation()
  harness.controller.confirmSubmission()
  await flush()
  assert.equal(harness.calls.includes('add:12345678901234567890:BBVA:1'), false)
  assert.equal(harness.calls.includes('bind:account-1:order-1'), true)
  assert.equal(harness.calls.includes('navigate:loanConfirm:order-1'), true)
})

test('adds a new account before binding and reports a business failure once', async () => {
  const harness = createHarness()
  harness.controller.initialize({ orderId: 'order-1', from: 'order' })
  await flush()
  harness.controller.openBankPicker()
  harness.controller.selectBankDraft('3')
  harness.controller.confirmBankSelection()
  harness.controller.updateAccountNumber('12345678901234')
  harness.controller.requestConfirmation()
  harness.controller.confirmSubmission()
  await flush()
  assert.equal(harness.calls.includes('add:12345678901234:BCP:1'), true)
  assert.equal(harness.calls.includes('bind:new-account:order-1'), true)

  const failure = createHarness({
    services: {
      async getUserInfo() { return { type: 'success', recipientName: 'Ana Perez' } },
      async getLoanAccounts() { return { type: 'success', list: [] } },
      async addLoanAccount() { return { type: 'business_failure', message: 'Try again.' } },
      async bindLoanAccount() { throw new Error('must not bind') },
    },
  })
  failure.controller.initialize({ orderId: 'order-1', from: 'order' })
  await flush()
  failure.controller.openBankPicker()
  failure.controller.selectBankDraft('3')
  failure.controller.confirmBankSelection()
  failure.controller.updateAccountNumber('12345678901234')
  failure.controller.requestConfirmation()
  failure.controller.confirmSubmission()
  await flush()
  assert.equal(failure.calls.includes('business:Try again.'), true)
  assert.equal(failure.calls.some((call) => call.startsWith('navigate:')), false)
})

test('keeps visible and physical back on the same leave confirmation lifecycle', async () => {
  const harness = createHarness()
  harness.controller.initialize({ orderId: 'order-1', from: 'order' })
  await flush()
  const back = harness.getBackConfig()
  back.onIntercept()
  assert.equal(harness.controller.getState().dialog, BANK_DIALOG.LEAVE)
  harness.controller.cancelLeave()
  assert.equal(harness.controller.getState().dialog, null)
  back.onIntercept()
  harness.controller.confirmLeave()
  assert.equal(harness.calls.includes('back:off'), true)
  assert.equal(harness.calls.includes('navigate:back'), true)
  back.onIntercept()
  assert.equal(harness.controller.getState().dialog, null)
})

test('aborts in-flight requests and hides loading on disposal', async () => {
  const harness = createHarness({
    services: {
      async getUserInfo() { return new Promise(() => {}) },
      async getLoanAccounts() { return new Promise(() => {}) },
      async addLoanAccount() { throw new Error('not used') },
      async bindLoanAccount() { throw new Error('not used') },
    },
  })
  harness.controller.initialize({ orderId: 'order-1', from: 'order' })
  harness.controller.dispose()
  assert.equal(harness.abortCount(), 2)
  assert.equal(harness.calls.filter((call) => call === 'loading:hide').length, 1)
})
