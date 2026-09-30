import assert from 'node:assert/strict'
import test from 'node:test'

import { createPasswordController } from './createPasswordController.js'

function createHarness(overrides = {}) {
  const calls = []
  const serviceCalls = []
  const globalState = overrides.globalState ?? {
    mobile: 'redacted-mobile',
    setGlobal(partial) {
      calls.push(['setGlobal', partial])
      return overrides.storeUpdated ?? true
    },
  }
  const services = {
    async createPassword(payload) {
      serviceCalls.push(payload)
      if (overrides.createPassword) return overrides.createPassword(payload)
      return { type: 'success', token: 'redacted-token', userId: 'redacted-user' }
    },
  }
  const timers = new Map()
  let scheduled
  let timerSequence = 0
  const controller = createPasswordController({
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
    onNativeWriteFailure: (capability) => calls.push(['nativeWriteFailure', capability]),
    setTimer: (callback, delay) => {
      timerSequence += 1
      timers.set(timerSequence, { callback, delay })
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
      const record = timers.get(timer)
      timers.delete(timer)
      record?.callback()
    },
  }
}

function fillValid(controller) {
  controller.setNewPassword('123456')
  controller.setConfirmPassword('123456')
}

test('initializes the read-only mobile without using it as a submit condition', async () => {
  const { controller, serviceCalls } = createHarness()
  assert.equal(controller.initialize(), true)

  let state = controller.getState()
  assert.equal(state.mobile, 'redacted-mobile')
  assert.equal(state.submitEnabled, false)

  controller.setNewPassword('12345')
  controller.setConfirmPassword('12345')
  assert.equal(controller.getState().submitEnabled, false)

  controller.setNewPassword('123456')
  assert.equal(controller.getState().submitEnabled, true)

  controller.setNewPassword('12345678901234567')
  assert.equal(controller.getState().submitEnabled, false)

  controller.setNewPassword('123456')
  controller.setConfirmPassword('')
  assert.equal(controller.getState().submitEnabled, false)

  controller.setConfirmPassword('1')
  assert.equal(controller.getState().submitEnabled, true)

  controller.setConfirmPassword('1234567890123456')
  assert.equal(controller.getState().submitEnabled, true)

  controller.setConfirmPassword('12345678901234567')
  assert.equal(controller.getState().submitEnabled, false)

  controller.setConfirmPassword('123456')
  controller.initialize()
  assert.equal(serviceCalls.length, 0)
})

test('allows a valid form when the read-only mobile is empty', () => {
  const harness = createHarness({ globalState: { mobile: null, setGlobal: () => true } })
  const { controller } = harness
  controller.initialize()
  fillValid(controller)

  assert.equal(controller.getState().mobile, '')
  assert.equal(controller.getState().submitEnabled, true)
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
  controller.setNewPassword('123456')
  controller.setConfirmPassword('654321')

  const result = await controller.submit()

  assert.deepEqual(result, { type: 'mismatch' })
  assert.deepEqual(harness.calls, [['mismatch']])
  assert.equal(harness.serviceCalls.length, 0)
  assert.equal(controller.getState().submitting, false)
})

test('submits once, sends only the new password, and completes the success sequence in order', async () => {
  const harness = createHarness()
  const { controller } = harness
  controller.initialize()
  fillValid(controller)

  const first = controller.submit()
  const second = await controller.submit()
  assert.deepEqual(second, { type: 'ignored' })
  assert.deepEqual(await first, { type: 'success' })
  assert.equal(harness.serviceCalls.length, 1)
  assert.equal(harness.serviceCalls[0].newPassword, '123456')
  assert.equal(Object.hasOwn(harness.serviceCalls[0], 'confirmPassword'), false)
  assert.equal(Object.hasOwn(harness.serviceCalls[0], 'mobile'), false)

  assert.deepEqual(harness.calls.map(([name]) => name), [
    'showLoading',
    'setGlobal',
    'setToken',
    'setUserId',
    'hideLoading',
    'successNotice',
  ])
  assert.deepEqual(harness.calls[0], ['showLoading'])
  assert.deepEqual(harness.calls[1], ['setGlobal', { token: 'redacted-token', userId: 'redacted-user' }])
  assert.deepEqual(harness.calls[2], ['setToken', 'redacted-token'])
  assert.deepEqual(harness.calls[3], ['setUserId', 'redacted-user'])
  assert.deepEqual(harness.calls[4], ['hideLoading'])
  assert.deepEqual(harness.calls[5], ['successNotice'])

  harness.runTimer()
  assert.deepEqual(harness.calls.at(-1), ['navigateAfterSuccess'])
})

test('continues the second native write and success return when one write is not accepted', async () => {
  const calls = []
  let controller
  const harness = createHarness({
    controller: {
      setNativeCachedToken: () => {
        calls.push('setToken')
        return false
      },
      setNativeCachedUserId: () => {
        calls.push('setUserId')
        return true
      },
      onNativeWriteFailure: (capability) => calls.push(`native-${capability}`),
    },
  })
  controller = harness.controller
  controller.initialize()
  fillValid(controller)

  assert.deepEqual(await controller.submit(), { type: 'success' })
  assert.deepEqual(calls, ['setToken', 'native-token', 'setUserId'])
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
    createPassword: async () => ({ type: 'business_failure', message: 'Controlled failure' }),
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
  const invalid = createHarness({ createPassword: async () => ({ type: 'invalid_response' }) })
  invalid.controller.initialize()
  fillValid(invalid.controller)
  assert.deepEqual(await invalid.controller.submit(), { type: 'invalid_response' })
  assert.deepEqual(invalid.calls.map(([name]) => name), ['showLoading', 'hideLoading', 'invalidResponse'])
  assert.equal(invalid.calls.some(([name]) => name === 'navigateAfterSuccess'), false)

  const error = new Error('network failure')
  error.category = 'network'
  error.displayMessage = 'Controlled network failure'
  const failed = createHarness({ createPassword: async () => { throw error } })
  failed.controller.initialize()
  fillValid(failed.controller)
  assert.deepEqual(await failed.controller.submit(), { type: 'request_failure' })
  assert.deepEqual(failed.calls.map(([name]) => name), ['showLoading', 'hideLoading', 'failure'])
  assert.deepEqual(failed.calls.at(-1), ['failure', 'Controlled network failure'])
})

test('deactivation aborts the request, hides loading, clears secrets, and ignores a late result', async () => {
  let resolveRequest
  const harness = createHarness({
    createPassword: () => new Promise((resolve) => { resolveRequest = resolve }),
  })
  const { controller } = harness
  controller.initialize()
  fillValid(controller)
  const pending = controller.submit()
  assert.equal(controller.getState().submitting, true)

  controller.deactivate()
  assert.equal(controller.getState().active, false)
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
  fillValid(controller)

  assert.equal(controller.requestBack(), true)
  assert.equal(controller.getState().active, false)
  assert.equal(controller.getState().newPassword, '')
  assert.equal(controller.getState().confirmPassword, '')
  assert.equal(harness.calls.at(-1)[0], 'navigateBack')
})
