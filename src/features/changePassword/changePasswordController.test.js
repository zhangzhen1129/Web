import assert from 'node:assert/strict'
import test from 'node:test'

import { createChangePasswordController } from './changePasswordController.js'

function createHarness(overrides = {}) {
  const calls = []
  const serviceCalls = []
  const globalState = {
    mobile: 'redacted-mobile',
    setGlobal(partial) {
      calls.push(['setGlobal', partial])
      return overrides.storeUpdated ?? true
    },
  }
  const services = {
    async updatePassword(payload) {
      serviceCalls.push(payload)
      if (overrides.updatePassword) return overrides.updatePassword(payload)
      return { type: 'success', token: 'redacted-token', userId: 'redacted-user' }
    },
  }
  let scheduled
  const timers = new Map()
  let timerSequence = 0
  const controller = createChangePasswordController({
    services,
    getGlobalState: () => globalState,
    showNativeLoading: () => calls.push(['showLoading']),
    hideNativeLoading: () => calls.push(['hideLoading']),
    setNativeCachedToken: (value) => calls.push(['setToken', value]),
    setNativeCachedUserId: (value) => calls.push(['setUserId', value]),
    navigateBack: () => calls.push(['navigateBack']),
    navigateAfterSuccess: () => calls.push(['navigateAfterSuccess']),
    onMismatch: () => calls.push(['mismatch']),
    onSuccessNotice: () => calls.push(['successNotice']),
    onFailure: (message) => calls.push(['failure', message]),
    onStoreFailure: () => calls.push(['storeFailure']),
    onInvalidResponse: () => calls.push(['invalidResponse']),
    setTimer: (callback) => {
      timerSequence += 1
      timers.set(timerSequence, callback)
      scheduled = timerSequence
      return timerSequence
    },
    clearTimer: (timer) => timers.delete(timer),
    createAbortController: () => new AbortController(),
    ...overrides.controller,
  })

  return {
    calls,
    serviceCalls,
    controller,
    timers,
    runTimer(timer = scheduled) {
      const callback = timers.get(timer)
      timers.delete(timer)
      callback?.()
    },
  }
}

function fillValid(controller) {
  controller.setOldPassword('old-password')
  controller.setNewPassword('123456')
  controller.setConfirmPassword('123456')
}

test('initializes the mobile and enforces the confirmed field rules', () => {
  const { controller } = createHarness()
  assert.equal(controller.initialize(), true)

  let state = controller.getState()
  assert.equal(state.mobile, 'redacted-mobile')
  assert.equal(state.submitEnabled, false)

  controller.setOldPassword('old-password')
  controller.setNewPassword('12345')
  controller.setConfirmPassword('12345')
  assert.equal(controller.getState().submitEnabled, false)

  controller.setNewPassword('123456')
  assert.equal(controller.getState().submitEnabled, true)

  controller.setNewPassword('12345678901234567')
  assert.equal(controller.getState().submitEnabled, false)

  controller.setNewPassword('123456')
  controller.setConfirmPassword('12345678901234567')
  assert.equal(controller.getState().submitEnabled, false)
  assert.equal(controller.getState().oldPassword, 'old-password')
  assert.equal(controller.getState().newPassword, '123456')
})

test('keeps new and confirm password visibility independent', () => {
  const { controller } = createHarness()
  controller.initialize()

  controller.toggleNewPasswordVisibility()
  assert.equal(controller.getState().newPasswordVisible, true)
  assert.equal(controller.getState().confirmPasswordVisible, false)

  controller.toggleConfirmPasswordVisibility()
  assert.equal(controller.getState().newPasswordVisible, true)
  assert.equal(controller.getState().confirmPasswordVisible, true)

  controller.toggleNewPasswordVisibility()
  assert.equal(controller.getState().newPasswordVisible, false)
  assert.equal(controller.getState().confirmPasswordVisible, true)
})

test('reports a mismatch once without loading or calling the service', async () => {
  const harness = createHarness()
  const { controller } = harness
  controller.initialize()
  controller.setOldPassword('old-password')
  controller.setNewPassword('123456')
  controller.setConfirmPassword('654321')

  const result = await controller.submit()

  assert.deepEqual(result, { type: 'mismatch' })
  assert.deepEqual(harness.calls, [['mismatch']])
  assert.equal(harness.serviceCalls.length, 0)
  assert.equal(controller.getState().submitting, false)
})

test('submits once and executes the success sequence in order', async () => {
  const harness = createHarness()
  const { controller } = harness
  controller.initialize()
  fillValid(controller)

  const first = controller.submit()
  const second = await controller.submit()
  assert.deepEqual(second, { type: 'ignored' })
  assert.deepEqual(await first, { type: 'success' })
  assert.equal(harness.serviceCalls.length, 1)

  assert.deepEqual(harness.calls.map(([name]) => name), [
    'showLoading',
    'setGlobal',
    'setToken',
    'setUserId',
    'hideLoading',
    'successNotice',
  ])
  assert.deepEqual(harness.calls[1][1], { token: 'redacted-token', userId: 'redacted-user' })
  assert.deepEqual(harness.calls.slice(2, 4), [
    ['setToken', 'redacted-token'],
    ['setUserId', 'redacted-user'],
  ])
  assert.equal(controller.getState().successPending, true)

  harness.runTimer()
  assert.deepEqual(harness.calls.at(-1), ['navigateAfterSuccess'])
})

test('continues the second native write and success return when one write is not accepted', async () => {
  const calls = []
  const controller = createChangePasswordController({
    services: {
      async updatePassword() {
        return { type: 'success', token: 'redacted-token', userId: 'redacted-user' }
      },
    },
    getGlobalState: () => ({ mobile: 'redacted-mobile', setGlobal: () => true }),
    showNativeLoading: () => calls.push('showLoading'),
    hideNativeLoading: () => calls.push('hideLoading'),
    setNativeCachedToken: () => {
      calls.push('setToken')
      return false
    },
    setNativeCachedUserId: () => {
      calls.push('setUserId')
      return true
    },
    navigateBack: () => {},
    navigateAfterSuccess: () => calls.push('navigateAfterSuccess'),
    onSuccessNotice: () => calls.push('successNotice'),
  })
  controller.initialize()
  fillValid(controller)

  assert.deepEqual(await controller.submit(), { type: 'success' })
  assert.deepEqual(calls, ['showLoading', 'setToken', 'setUserId', 'hideLoading', 'successNotice'])
})
test('does not write native values or navigate when global state update fails', async () => {
  const harness = createHarness({ storeUpdated: false })
  const { controller } = harness
  controller.initialize()
  fillValid(controller)

  assert.deepEqual(await controller.submit(), { type: 'store_failure' })
  assert.deepEqual(harness.calls.map(([name]) => name), [
    'showLoading',
    'setGlobal',
    'hideLoading',
    'storeFailure',
  ])
  assert.equal(harness.calls.some(([name]) => name === 'setToken' || name === 'setUserId'), false)
  assert.equal(controller.getState().submitting, false)
})

test('hides loading before a business failure and allows retry', async () => {
  const harness = createHarness({
    updatePassword: async () => ({ type: 'business_failure', message: 'Controlled failure' }),
  })
  const { controller } = harness
  controller.initialize()
  fillValid(controller)

  assert.deepEqual(await controller.submit(), { type: 'business_failure' })
  assert.deepEqual(harness.calls.map(([name]) => name), ['showLoading', 'hideLoading', 'failure'])
  assert.deepEqual(harness.calls.at(-1), ['failure', 'Controlled failure'])
  assert.equal(controller.getState().submitEnabled, true)
})

test('handles invalid and throwing responses without a success path', async () => {
  const invalid = createHarness({ updatePassword: async () => ({ type: 'invalid_response' }) })
  invalid.controller.initialize()
  fillValid(invalid.controller)
  assert.deepEqual(await invalid.controller.submit(), { type: 'invalid_response' })
  assert.deepEqual(invalid.calls.map(([name]) => name), ['showLoading', 'hideLoading', 'invalidResponse'])
  assert.equal(invalid.calls.some(([name]) => name === 'navigateAfterSuccess'), false)

  const error = new Error('network failure')
  error.category = 'network'
  error.displayMessage = 'Controlled network failure'
  const failed = createHarness({ updatePassword: async () => { throw error } })
  failed.controller.initialize()
  fillValid(failed.controller)
  assert.deepEqual(await failed.controller.submit(), { type: 'request_failure' })
  assert.deepEqual(failed.calls.map(([name]) => name), ['showLoading', 'hideLoading', 'failure'])
  assert.deepEqual(failed.calls.at(-1), ['failure', 'Controlled network failure'])
})

test('deactivation aborts the request, hides loading, clears secrets, and ignores a late result', async () => {
  let resolveRequest
  const harness = createHarness({
    updatePassword: () => new Promise((resolve) => { resolveRequest = resolve }),
  })
  const { controller } = harness
  controller.initialize()
  fillValid(controller)
  const pending = controller.submit()
  assert.equal(controller.getState().submitting, true)

  controller.deactivate()
  assert.equal(controller.getState().active, false)
  assert.equal(controller.getState().oldPassword, '')
  assert.equal(controller.getState().newPassword, '')
  assert.equal(controller.getState().confirmPassword, '')
  assert.deepEqual(harness.calls.map(([name]) => name), ['showLoading', 'hideLoading'])

  resolveRequest({ type: 'success', token: 'late-token', userId: 'late-user' })
  assert.deepEqual(await pending, { type: 'stale' })
  assert.equal(harness.calls.some(([name]) => name === 'setToken' || name === 'setUserId'), false)
})

test('back invalidates the page before invoking routed history behavior', () => {
  const harness = createHarness()
  const { controller } = harness
  controller.initialize()
  controller.setOldPassword('old-password')
  controller.setNewPassword('123456')
  controller.setConfirmPassword('123456')

  assert.equal(controller.requestBack(), true)
  assert.equal(controller.getState().active, false)
  assert.equal(controller.getState().oldPassword, '')
  assert.equal(controller.getState().newPassword, '')
  assert.equal(controller.getState().confirmPassword, '')
  assert.equal(harness.calls.at(-1)[0], 'navigateBack')
})
