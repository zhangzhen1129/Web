import assert from 'node:assert/strict'
import test from 'node:test'
import { COMPLAINT_CONTENT } from './complaintContent.js'
import { createComplaintController } from './complaintController.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue
    reject = rejectValue
  })
  return { promise, resolve, reject }
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function createHarness(options = {}) {
  const calls = []
  let abortCount = 0
  const loadComplaintRedDot = options.loadComplaintRedDot
    ?? (async () => ({ type: 'success', showRedDot: false }))
  const hasHistoryBack = options.hasHistoryBack ?? (() => false)
  const controller = createComplaintController({
    services: {
      async loadComplaintRedDot(request) {
        calls.push(['redDot', request])
        return loadComplaintRedDot(request)
      },
    },
    navigate(location) {
      calls.push(['navigate', location])
      return Promise.resolve()
    },
    goBack() {
      calls.push(['back'])
      return Promise.resolve()
    },
    replaceHome() {
      calls.push(['replaceHome'])
      return Promise.resolve()
    },
    markPageInactive() {
      calls.push(['inactive'])
    },
    hasHistoryBack,
    createAbortController() {
      const signal = { aborted: false }
      return {
        signal,
        abort() {
          signal.aborted = true
          abortCount += 1
        },
      }
    },
  })
  return {
    controller,
    calls,
    count: (name) => calls.filter(([callName]) => callName === name).length,
    abortCount: () => abortCount,
  }
}

function getNavigationCalls(calls) {
  return calls.filter(([name]) => name === 'navigate')
}

test('starts once and displays the red dot only for strict success', async () => {
  const harness = createHarness({
    loadComplaintRedDot: async () => ({ type: 'success', showRedDot: true }),
  })

  assert.equal(harness.controller.start(), true)
  assert.equal(harness.controller.start(), false)
  assert.equal(harness.controller.getState().active, true)
  assert.equal(harness.controller.getState().showRedDot, false)

  await flush()

  assert.equal(harness.count('redDot'), 1)
  assert.equal(harness.controller.getState().showRedDot, true)
})

test('keeps non-strict red dot results and request failures silent', async () => {
  const results = [
    { type: 'success', showRedDot: false },
    { type: 'success', showRedDot: 'true' },
    { type: 'success', showRedDot: 1 },
    { type: 'business_failure', showRedDot: true },
    null,
  ]

  for (const result of results) {
    const harness = createHarness({
      loadComplaintRedDot: async () => result,
    })
    harness.controller.start()
    await flush()
    assert.equal(harness.controller.getState().showRedDot, false)
  }

  const harness = createHarness({
    loadComplaintRedDot: async () => {
      throw new Error('Unavailable')
    },
  })
  harness.controller.start()
  await flush()
  assert.equal(harness.controller.getState().showRedDot, false)
})

test('opens one question popup, updates agency selection, and preserves it on close', () => {
  const harness = createHarness()
  harness.controller.start()

  assert.equal(harness.controller.selectAgency('DineroPro'), true)
  assert.equal(harness.controller.getState().selectedAgency, COMPLAINT_CONTENT.agencyOptions[0])
  assert.equal(harness.controller.getState().questionPopupVisible, true)

  assert.equal(harness.controller.closeQuestionPopup(), true)
  assert.equal(harness.controller.getState().questionPopupVisible, false)
  assert.equal(harness.controller.getState().selectedAgency, COMPLAINT_CONTENT.agencyOptions[0])

  assert.equal(
    harness.controller.selectAgency('Plataforma de quejas en línea'),
    true,
  )
  assert.equal(harness.controller.getState().selectedAgency, COMPLAINT_CONTENT.agencyOptions[1])
  assert.equal(harness.controller.getState().questionPopupVisible, true)
  assert.equal(harness.controller.selectAgency('Unknown agency'), false)
})

test('does not navigate for an invalid question value', () => {
  const harness = createHarness()
  harness.controller.start()
  harness.controller.selectAgency('DineroPro')

  assert.equal(harness.controller.selectQuestion('Unknown question'), false)
  assert.equal(harness.controller.getState().navigationLocked, false)
  assert.equal(harness.controller.getState().questionPopupVisible, true)
  assert.equal(getNavigationCalls(harness.calls).length, 0)
})

for (const questionType of COMPLAINT_CONTENT.questionTypes) {
  test(`navigates once for ${questionType.value}`, () => {
    const harness = createHarness()
    harness.controller.start()
    harness.controller.selectAgency('DineroPro')

    assert.equal(harness.controller.selectQuestion(questionType.value), true)
    assert.equal(harness.controller.selectQuestion(questionType.value), false)
    assert.equal(harness.controller.getState().navigationLocked, true)
    assert.deepEqual(getNavigationCalls(harness.calls), [
      [
        'navigate',
        {
          name: 'complainEdit',
          query: {
            type: 'DineroPro',
            question: questionType.value,
          },
        },
      ],
    ])
  })
}

test('navigates to complaint records once with the controlled query', () => {
  const harness = createHarness()
  harness.controller.start()

  assert.equal(harness.controller.openComplaintList(), true)
  assert.equal(harness.controller.openComplaintList(), false)
  assert.equal(harness.controller.getState().navigationLocked, true)
  assert.deepEqual(getNavigationCalls(harness.calls), [
    ['navigate', { name: 'complainList', query: { goBack: '1' } }],
  ])
})

test('uses history back once when history is available', () => {
  const harness = createHarness({ hasHistoryBack: () => true })
  harness.controller.start()

  assert.equal(harness.controller.requestBack(), true)
  assert.equal(harness.controller.requestBack(), false)
  assert.equal(harness.count('back'), 1)
  assert.equal(harness.count('replaceHome'), 0)
})

test('replaces with the default home route when history is unavailable', () => {
  const harness = createHarness({ hasHistoryBack: () => false })
  harness.controller.start()

  assert.equal(harness.controller.requestBack(), true)
  assert.equal(harness.controller.requestBack(), false)
  assert.equal(harness.count('back'), 0)
  assert.equal(harness.count('replaceHome'), 1)
})

test('deactivation closes overlays, aborts the request, and ignores late red dot updates', async () => {
  const pending = deferred()
  const harness = createHarness({
    loadComplaintRedDot: () => pending.promise,
  })
  harness.controller.start()
  await Promise.resolve()
  harness.controller.selectAgency('DineroPro')
  harness.controller.openCustomerService()

  assert.equal(harness.controller.deactivate(), true)
  assert.equal(harness.controller.deactivate(), false)
  assert.equal(harness.controller.getState().active, false)
  assert.equal(harness.controller.getState().questionPopupVisible, false)
  assert.equal(harness.controller.getState().customerServiceVisible, false)
  assert.equal(harness.abortCount(), 1)
  assert.equal(harness.count('inactive'), 1)

  pending.resolve({ type: 'success', showRedDot: true })
  await flush()

  assert.equal(harness.controller.getState().showRedDot, false)
})

test('dispose closes overlays, aborts the request, and ignores late red dot updates', async () => {
  const pending = deferred()
  const harness = createHarness({
    loadComplaintRedDot: () => pending.promise,
  })
  harness.controller.start()
  await Promise.resolve()
  harness.controller.selectAgency('DineroPro')

  harness.controller.dispose()
  harness.controller.dispose()

  assert.equal(harness.controller.getState().active, false)
  assert.equal(harness.controller.getState().questionPopupVisible, false)
  assert.equal(harness.controller.getState().customerServiceVisible, false)
  assert.equal(harness.abortCount(), 1)
  assert.equal(harness.count('inactive'), 1)

  pending.resolve({ type: 'success', showRedDot: true })
  await flush()

  assert.equal(harness.controller.getState().showRedDot, false)
})