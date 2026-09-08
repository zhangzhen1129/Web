import assert from 'node:assert/strict'
import test from 'node:test'
import { createInformationController } from './informationController.js'

const selections = [
  ['marital', 'single'], ['education', 'master'], ['occupation', 'retired'], ['monthlyIncome', 'over_5001'], ['loanPurpose', 'family'], ['houseType', 'rented'],
]

function createHarness(submit = async () => ({ type: 'success' }), overrides = {}) {
  const calls = []
  const timers = []
  let intercept = null
  const controller = createInformationController({
    submitService: { submit },
    showNativeLoading: () => calls.push('show'),
    hideNativeLoading: () => calls.push('hide'),
    setPhysicalBackIntercept: (config) => { calls.push(config.enabled ? 'intercept:on' : 'intercept:off'); intercept = config; return config.enabled ? 'back-request-1' : 'back-request-2' },
    schedule: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer },
    cancelSchedule: (timer) => calls.push(`cancel:${timer.delay}`),
    onBusinessFailure: (message) => calls.push(`failure:${message}`),
    onNavigateContacts: () => calls.push('contacts'),
    onNavigateBack: () => calls.push('back'),
    ...overrides,
  })
  return { calls, controller, getIntercept: () => intercept, timers }
}

function complete(controller) {
  for (const [fieldKey, optionKey] of selections) assert.equal(controller.select(fieldKey, optionKey), true)
}

test('shows success only after the current successful submission, then replaces to contacts', async () => {
  let resolveSubmit
  const harness = createHarness(() => new Promise((resolve) => { resolveSubmit = resolve }))
  harness.controller.initialize()
  complete(harness.controller)

  const pending = harness.controller.submit()
  assert.equal(harness.controller.getState().submitting, true)
  assert.deepEqual(harness.calls, ['intercept:on', 'show'])
  resolveSubmit({ type: 'success' })
  assert.equal(await pending, true)
  assert.equal(harness.controller.getState().successOpen, true)
  assert.deepEqual(harness.calls, ['intercept:on', 'show', 'hide'])

  harness.timers.find((timer) => timer.delay === 1000).callback()
  assert.equal(harness.controller.getState().successOpen, false)
  assert.deepEqual(harness.calls, ['intercept:on', 'show', 'hide', 'intercept:off', 'contacts'])
})

test('hides loading for business failures and exceptions without successful navigation', async () => {
  const failed = createHarness(async () => ({ type: 'business_failure', message: 'Try again.' }))
  complete(failed.controller)
  assert.equal(await failed.controller.submit(), false)
  assert.deepEqual(failed.calls, ['show', 'hide', 'failure:Try again.'])
  assert.equal(failed.controller.getState().successOpen, false)

  const exceptional = createHarness(async () => { throw new Error('request failed') }, {
    showNativeLoading: () => { throw new Error('loading unavailable') },
    hideNativeLoading: () => { throw new Error('loading unavailable') },
  })
  complete(exceptional.controller)
  assert.equal(await exceptional.controller.submit(), false)
  assert.equal(exceptional.controller.getState().submitting, false)
  assert.equal(exceptional.controller.getState().successOpen, false)
  assert.equal(exceptional.calls.includes('contacts'), false)
  assert.equal(exceptional.calls.some((call) => call.startsWith('failure:')), false)
})

test('keeps back interception through cancel and releases it for leave and disposal', () => {
  const harness = createHarness()
  harness.controller.initialize()
  complete(harness.controller)
  harness.getIntercept().onIntercept({ status: 'intercepted' })
  harness.getIntercept().onIntercept({ status: 'intercepted' })
  assert.equal(harness.controller.getState().leaveConfirmationOpen, true)
  assert.deepEqual(harness.calls, ['intercept:on'])

  harness.controller.cancelLeave()
  assert.equal(harness.controller.getState().leaveConfirmationOpen, false)
  assert.deepEqual(harness.controller.getState().values, Object.fromEntries(selections))
  assert.deepEqual(harness.calls, ['intercept:on'])

  harness.controller.openLeaveConfirmation()
  harness.controller.confirmLeave()
  assert.deepEqual(harness.calls, ['intercept:on', 'intercept:off', 'back'])
  harness.controller.dispose()
  assert.deepEqual(harness.calls, ['intercept:on', 'intercept:off', 'back', 'cancel:500'])
})

test('disposes an in-flight submission and ignores its late success result', async () => {
  let resolveSubmit
  const harness = createHarness(() => new Promise((resolve) => { resolveSubmit = resolve }))
  harness.controller.initialize()
  complete(harness.controller)
  const pending = harness.controller.submit()

  harness.controller.dispose()
  assert.deepEqual(harness.calls, ['intercept:on', 'show', 'cancel:500', 'hide', 'intercept:off'])
  resolveSubmit({ type: 'success' })
  assert.equal(await pending, false)
  assert.equal(harness.calls.includes('contacts'), false)
  assert.equal(harness.calls.filter((call) => call === 'hide').length, 1)
})
