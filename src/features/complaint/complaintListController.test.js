import assert from 'node:assert/strict'
import test from 'node:test'

import { createComplaintListController } from './complaintListController.js'

function deferred() {
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

function fixtureRecord(overrides = {}) {
  return {
    id: 'id-1',
    feedbackMechanism: 'Controlled Agency',
    problemType: 'Controlled type',
    problemContent: 'Controlled detail',
    submitStatus: 0,
    createTime: '2026-01-01',
    ...overrides,
  }
}

function createHarness(overrides = {}) {
  const loadingCalls = []
  const notices = {
    business: [],
    request: [],
    invalid: [],
  }
  const navigation = {
    back: 0,
    replaceComplainHome: 0,
  }
  const request = deferred()
  const calls = []

  const controller = createComplaintListController({
    services: {
      loadComplaintRecords(options) {
        calls.push(options)
        return request.promise
      },
    },
    showNativeLoading: () => loadingCalls.push('show'),
    hideNativeLoading: () => loadingCalls.push('hide'),
    goBack: () => { navigation.back += 1 },
    replaceComplainHome: () => { navigation.replaceComplainHome += 1 },
    hasHistoryBack: () => true,
    createAbortController: () => new AbortController(),
    onBusinessFailure: (message) => notices.business.push(message),
    onRequestFailure: (message) => notices.request.push(message),
    onInvalidResponse: (message) => notices.invalid.push(message),
    ...overrides,
  })

  return {
    controller,
    request,
    calls,
    loadingCalls,
    notices,
    navigation,
  }
}

test('starts once, delays content until the request settles, and maps records', async () => {
  const harness = createHarness()
  const states = []
  const unsubscribe = harness.controller.subscribe((state) => states.push(state))

  assert.equal(harness.controller.start(), true)
  assert.equal(harness.controller.start(), false)
  await flush()
  assert.equal(harness.calls.length, 1)
  assert.deepEqual(harness.loadingCalls, ['show'])
  assert.equal(states.at(-1).loading, true)
  assert.equal(states.at(-1).records.length, 0)
  assert.equal(states.at(-1).empty, false)

  harness.request.resolve({
    type: 'success',
    records: [
      fixtureRecord(),
      fixtureRecord({ id: 'id-2', submitStatus: 1 }),
    ],
  })
  await flush()

  const state = harness.controller.getState()
  assert.equal(state.loading, false)
  assert.equal(state.loaded, true)
  assert.equal(state.empty, false)
  assert.equal(state.records.length, 2)
  assert.equal(state.records[0].statusModifier, 'processing')
  assert.equal(state.records[1].statusModifier, 'processed')
  assert.deepEqual(harness.loadingCalls, ['show', 'hide'])
  assert.deepEqual(harness.notices, { business: [], request: [], invalid: [] })

  unsubscribe()
})

test('shows the empty state only for a strict successful empty list', async () => {
  const harness = createHarness()
  harness.controller.start()
  harness.request.resolve({ type: 'success', records: [] })
  await flush()

  const state = harness.controller.getState()
  assert.equal(state.loading, false)
  assert.equal(state.loaded, true)
  assert.equal(state.empty, true)
  assert.equal(state.records.length, 0)
  assert.deepEqual(harness.loadingCalls, ['show', 'hide'])
})

test('shows one safe business message and never enters the empty state', async () => {
  const harness = createHarness()
  harness.controller.start()
  harness.request.resolve({ type: 'business_failure', message: 'Controlled failure' })
  await flush()

  const state = harness.controller.getState()
  assert.equal(state.empty, false)
  assert.equal(state.records.length, 0)
  assert.deepEqual(harness.notices.business, ['Controlled failure'])
  assert.deepEqual(harness.notices.request, [])
  assert.deepEqual(harness.notices.invalid, [])
  assert.deepEqual(harness.loadingCalls, ['show', 'hide'])
})

test('keeps an unsafe business message silent and still leaves the loading terminal state', async () => {
  const harness = createHarness()
  harness.controller.start()
  harness.request.resolve({ type: 'business_failure', message: '<unsafe>' })
  await flush()

  assert.deepEqual(harness.notices.business, [])
  assert.equal(harness.controller.getState().loading, false)
  assert.equal(harness.controller.getState().empty, false)
})

test('maps request and invalid response failures to one controlled notice', async () => {
  const requestHarness = createHarness()
  requestHarness.controller.start()
  requestHarness.request.reject(Object.assign(new Error('Transport failed'), {
    displayMessage: 'Controlled transport failure',
  }))
  await flush()
  assert.deepEqual(requestHarness.notices.request, ['Controlled transport failure'])
  assert.equal(requestHarness.controller.getState().empty, false)

  const invalidHarness = createHarness()
  invalidHarness.controller.start()
  invalidHarness.request.resolve({ type: 'invalid_response' })
  await flush()
  assert.deepEqual(invalidHarness.notices.invalid, ['Unable to validate the server response.'])
  assert.equal(invalidHarness.controller.getState().empty, false)
})

test('does not show a notice for cancellation and clears loading', async () => {
  const harness = createHarness()
  harness.controller.start()
  harness.request.reject(Object.assign(new Error('canceled'), { category: 'canceled' }))
  await flush()

  assert.deepEqual(harness.notices, { business: [], request: [], invalid: [] })
  assert.deepEqual(harness.loadingCalls, ['show', 'hide'])
  assert.equal(harness.controller.getState().loading, false)
})

test('returns through history once and ignores a late response', async () => {
  const harness = createHarness()
  harness.controller.start()
  assert.equal(harness.controller.requestBack(), true)
  assert.equal(harness.controller.requestBack(), false)
  assert.equal(harness.navigation.back, 1)
  assert.equal(harness.navigation.replaceComplainHome, 0)
  assert.deepEqual(harness.loadingCalls, ['show', 'hide'])

  harness.request.resolve({ type: 'success', records: [fixtureRecord()] })
  await flush()
  assert.equal(harness.controller.getState().records.length, 0)
  assert.equal(harness.controller.getState().active, false)
})

test('uses the controlled replacement route when no history exists', () => {
  const harness = createHarness({ hasHistoryBack: () => false })
  harness.controller.start()
  assert.equal(harness.controller.requestBack(), true)
  assert.equal(harness.navigation.back, 0)
  assert.equal(harness.navigation.replaceComplainHome, 1)
})

test('deactivate clears loading and prevents late page updates', async () => {
  const harness = createHarness()
  harness.controller.start()
  assert.equal(harness.controller.deactivate(), true)
  assert.equal(harness.controller.deactivate(), false)
  assert.deepEqual(harness.loadingCalls, ['show', 'hide'])

  harness.request.resolve({ type: 'success', records: [fixtureRecord()] })
  await flush()
  assert.equal(harness.controller.getState().active, false)
  assert.equal(harness.controller.getState().records.length, 0)
})
