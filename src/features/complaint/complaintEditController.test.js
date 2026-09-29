import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COMPLAINT_DETAILS_MAX_LENGTH,
  createComplaintEditController,
  maskComplaintContact,
} from './complaintEditController.js'

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve))
}

function createHarness(overrides = {}) {
  const calls = []
  let abortCount = 0
  const services = {
    async saveComplaintFeedback(payload) {
      calls.push({ type: 'service', payload })
      return { type: 'success' }
    },
    ...(overrides.services ?? {}),
  }
  const controller = createComplaintEditController({
    services,
    showNativeLoading: () => calls.push({ type: 'loading', action: 'show' }),
    hideNativeLoading: () => calls.push({ type: 'loading', action: 'hide' }),
    goBack: () => calls.push({ type: 'navigate', action: 'back' }),
    replaceHome: () => calls.push({ type: 'navigate', action: 'home' }),
    replaceComplainHome: () => calls.push({ type: 'navigate', action: 'complain-home' }),
    hasHistoryBack: () => true,
    createAbortController: () => ({
      signal: { aborted: false },
      abort() {
        this.signal.aborted = true
        abortCount += 1
      },
    }),
    onBusinessFailure: (message) => calls.push({ type: 'business', message }),
    onRequestFailure: (message) => calls.push({ type: 'request', message }),
    onSuccessNotice: () => calls.push({ type: 'notice', action: 'success' }),
    ...overrides,
  })
  return {
    calls,
    controller,
    getAbortCount: () => abortCount,
    serviceCalls: () => calls.filter((entry) => entry.type === 'service'),
  }
}

function initialize(controller) {
  return controller.initialize({
    agency: 'RBI',
    question: 'Recordatorio de problemas de pago',
    mobile: '913456890',
  })
}

test('initializes one editable state with masked contact and route values', () => {
  const harness = createHarness()
  assert.equal(initialize(harness.controller), true)
  assert.equal(initialize(harness.controller), false)

  const state = harness.controller.getState()
  assert.equal(state.active, true)
  assert.equal(state.agency, 'RBI')
  assert.equal(state.question, 'Recordatorio de problemas de pago')
  assert.equal(state.maskedContact, '913****890')
  assert.equal(state.details, '')
  assert.equal(state.detailsCount, 0)
  assert.equal(state.submitEnabled, false)
  assert.equal(state.submitting, false)
  assert.equal(state.navigationLocked, false)
})

test('masks contacts without storing a complete short value', () => {
  assert.equal(maskComplaintContact(''), '')
  assert.equal(maskComplaintContact(null), '')
  assert.equal(maskComplaintContact('123456'), '******')
  assert.equal(maskComplaintContact('1234567'), '123****567')
  assert.equal(maskComplaintContact(' 913456890 '), '913****890')
})

test('caps details at 100 and enables submission only for non-whitespace content', () => {
  const harness = createHarness()
  initialize(harness.controller)

  assert.equal(harness.controller.updateDetails('   '), true)
  assert.equal(harness.controller.getState().submitEnabled, false)
  assert.equal(harness.controller.updateDetails('A'.repeat(COMPLAINT_DETAILS_MAX_LENGTH + 5)), true)
  assert.equal(harness.controller.getState().details.length, COMPLAINT_DETAILS_MAX_LENGTH)
  assert.equal(harness.controller.getState().detailsCount, COMPLAINT_DETAILS_MAX_LENGTH)
  assert.equal(harness.controller.getState().submitEnabled, true)
})

test('submits one normalized snapshot, pairs native loading, and returns once on success', async () => {
  const harness = createHarness()
  initialize(harness.controller)
  harness.controller.updateDetails('  Controlled details  ')

  assert.equal(await harness.controller.submit(), true)
  assert.equal(await harness.controller.submit(), false)

  assert.equal(harness.serviceCalls().length, 1)
  assert.deepEqual(harness.serviceCalls()[0].payload, {
    agency: 'RBI',
    question: 'Recordatorio de problemas de pago',
    details: '  Controlled details  ',
    signal: harness.serviceCalls()[0].payload.signal,
  })
  assert.equal(harness.calls.filter((entry) => entry.type === 'loading' && entry.action === 'show').length, 1)
  assert.equal(harness.calls.filter((entry) => entry.type === 'loading' && entry.action === 'hide').length, 1)
  assert.equal(harness.calls.filter((entry) => entry.type === 'notice').length, 1)
  assert.equal(harness.calls.filter((entry) => entry.type === 'navigate' && entry.action === 'back').length, 1)
  assert.equal(harness.controller.getState().navigationLocked, true)
  assert.equal(harness.controller.getState().submitEnabled, false)
})

test('uses complainHome replacement only when success has no history', async () => {
  const harness = createHarness({ hasHistoryBack: () => false })
  initialize(harness.controller)
  harness.controller.updateDetails('Controlled details')

  assert.equal(await harness.controller.submit(), true)
  assert.equal(harness.calls.filter((entry) => entry.type === 'navigate' && entry.action === 'complain-home').length, 1)
  assert.equal(harness.calls.filter((entry) => entry.type === 'navigate' && entry.action === 'back').length, 0)
})

test('keeps the page editable after business failure and preserves details for retry', async () => {
  let callCount = 0
  const harness = createHarness({
    services: {
      async saveComplaintFeedback(payload) {
        callCount += 1
        harness.calls.push({ type: 'service', payload })
        return callCount === 1
          ? { type: 'business_failure', message: 'Controlled failure' }
          : { type: 'success' }
      },
    },
  })
  initialize(harness.controller)
  harness.controller.updateDetails('Controlled details')

  assert.equal(await harness.controller.submit(), false)
  assert.equal(harness.controller.getState().details, 'Controlled details')
  assert.equal(harness.controller.getState().submitEnabled, true)
  assert.equal(harness.calls.filter((entry) => entry.type === 'business').length, 1)
  assert.equal(harness.calls.some((entry) => entry.type === 'notice'), false)
  assert.equal(harness.calls.some((entry) => entry.type === 'navigate'), false)

  assert.equal(await harness.controller.submit(), true)
  assert.equal(callCount, 2)
})

test('uses request normalization for request failures and invalid response structures', async () => {
  const requestFailure = Object.assign(new Error('network down'), {
    displayMessage: 'Safe request failure',
  })
  const harness = createHarness({
    services: {
      async saveComplaintFeedback() {
        throw requestFailure
      },
    },
  })
  initialize(harness.controller)
  harness.controller.updateDetails('Controlled details')

  assert.equal(await harness.controller.submit(), false)
  assert.deepEqual(harness.calls.filter((entry) => entry.type === 'request'), [
    { type: 'request', message: 'Safe request failure' },
  ])
  assert.equal(harness.calls.some((entry) => entry.type === 'navigate'), false)
  assert.equal(harness.calls.filter((entry) => entry.type === 'loading' && entry.action === 'hide').length, 1)

  const invalid = createHarness({
    services: {
      async saveComplaintFeedback() {
        return { type: 'invalid_response' }
      },
    },
  })
  initialize(invalid.controller)
  invalid.controller.updateDetails('Controlled details')
  assert.equal(await invalid.controller.submit(), false)
  assert.deepEqual(invalid.calls.filter((entry) => entry.type === 'request'), [
    { type: 'request', message: 'Unable to validate the server response.' },
  ])
})

test('keeps cancellation silent and restores the current page', async () => {
  const harness = createHarness({
    services: {
      async saveComplaintFeedback() {
        throw Object.assign(new Error('canceled'), { category: 'canceled' })
      },
    },
  })
  initialize(harness.controller)
  harness.controller.updateDetails('Controlled details')

  assert.equal(await harness.controller.submit(), false)
  assert.equal(harness.calls.some((entry) => entry.type === 'request'), false)
  assert.equal(harness.calls.some((entry) => entry.type === 'business'), false)
  assert.equal(harness.calls.some((entry) => entry.type === 'notice'), false)
  assert.equal(harness.calls.some((entry) => entry.type === 'navigate'), false)
  assert.equal(harness.controller.getState().submitEnabled, true)
})

test('visible back aborts work, hides loading once, and ignores a late success', async () => {
  const deferred = createDeferred()
  const harness = createHarness({
    services: {
      async saveComplaintFeedback() {
        return deferred.promise
      },
    },
  })
  initialize(harness.controller)
  harness.controller.updateDetails('Controlled details')

  const pending = harness.controller.submit()
  assert.equal(harness.controller.requestBack(), true)
  assert.equal(harness.controller.requestBack(), false)
  assert.equal(harness.getAbortCount(), 1)
  assert.equal(harness.calls.filter((entry) => entry.type === 'loading' && entry.action === 'hide').length, 1)
  assert.equal(harness.calls.filter((entry) => entry.type === 'navigate' && entry.action === 'back').length, 1)

  deferred.resolve({ type: 'success' })
  assert.equal(await pending, false)
  assert.equal(harness.calls.filter((entry) => entry.type === 'notice').length, 0)
  assert.equal(harness.calls.filter((entry) => entry.type === 'navigate').length, 1)
})

test('deactivation also ignores late results and does not navigate', async () => {
  const deferred = createDeferred()
  const harness = createHarness({
    services: {
      async saveComplaintFeedback() {
        return deferred.promise
      },
    },
  })
  initialize(harness.controller)
  harness.controller.updateDetails('Controlled details')

  const pending = harness.controller.submit()
  assert.equal(harness.controller.deactivate(), true)
  assert.equal(harness.controller.deactivate(), false)
  deferred.resolve({ type: 'success' })
  assert.equal(await pending, false)
  assert.equal(harness.calls.some((entry) => entry.type === 'notice'), false)
  assert.equal(harness.calls.some((entry) => entry.type === 'navigate'), false)
  assert.equal(harness.calls.filter((entry) => entry.type === 'loading' && entry.action === 'hide').length, 1)
})

test('native loading failures never block request results', async () => {
  const harness = createHarness({
    showNativeLoading() {
      throw new Error('Unavailable')
    },
    hideNativeLoading() {
      throw new Error('Unavailable')
    },
  })
  initialize(harness.controller)
  harness.controller.updateDetails('Controlled details')

  assert.equal(await harness.controller.submit(), true)
  assert.equal(harness.calls.filter((entry) => entry.type === 'notice').length, 1)
  assert.equal(harness.calls.filter((entry) => entry.type === 'navigate' && entry.action === 'back').length, 1)
})

test('keeps business failures without a valid message silent', async () => {
  const harness = createHarness({
    services: {
      async saveComplaintFeedback() {
        return { type: 'business_failure', message: null }
      },
    },
  })
  initialize(harness.controller)
  harness.controller.updateDetails('Controlled details')

  assert.equal(await harness.controller.submit(), false)
  assert.equal(harness.calls.some((entry) => entry.type === 'business'), false)
  assert.equal(harness.calls.some((entry) => entry.type === 'notice'), false)
  assert.equal(harness.calls.some((entry) => entry.type === 'navigate'), false)
  assert.equal(harness.controller.getState().submitEnabled, true)
})

test('visible back replaces home when no history is available', () => {
  const harness = createHarness({ hasHistoryBack: () => false })
  initialize(harness.controller)

  assert.equal(harness.controller.requestBack(), true)
  assert.equal(harness.controller.requestBack(), false)
  assert.equal(harness.calls.filter((entry) => entry.type === 'navigate' && entry.action === 'home').length, 1)
  assert.equal(harness.calls.filter((entry) => entry.type === 'navigate' && entry.action === 'back').length, 0)
})
