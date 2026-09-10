import assert from 'node:assert/strict'
import test from 'node:test'
import { CONTACT_DIALOG, createContactsController } from './contactsController.js'

function createHarness(overrides = {}) {
  const calls = []
  const selections = []
  const timers = []
  let backConfig = null
  let abortCount = 0
  const contactSelection = {
    select(consumer) { selections.push(consumer); return true },
    cancel() {},
    dispose() { calls.push('contact:dispose') },
  }
  const controller = createContactsController({
    submitService: { submit: async () => ({ type: 'success' }) },
    contactSelection,
    showNativeLoading: () => calls.push('loading:show'),
    hideNativeLoading: () => calls.push('loading:hide'),
    setPhysicalBackIntercept(config) { calls.push(config.enabled ? 'back:on' : 'back:off'); backConfig = config; return config.enabled ? 'enable-id' : 'disable-id' },
    createAbortController: () => ({ signal: { aborted: false }, abort() { this.signal.aborted = true; abortCount += 1 } }),
    schedule(callback, delay) { const timer = { callback, delay }; timers.push(timer); return timer },
    cancelSchedule(timer) { calls.push(`timer:cancel:${timer.delay}`) },
    onBusinessFailure: (message) => calls.push(`business:${message}`),
    onRequestFailure: (message) => calls.push(`request:${message}`),
    onNavigateIdentity: () => calls.push('navigate:identity'),
    onNavigateBack: () => calls.push('navigate:back'),
    ...overrides,
  })
  return { abortCount: () => abortCount, calls, contactSelection, controller, getBackConfig: () => backConfig, selections, timers }
}

function fillRelationsAndNames(controller) {
  controller.openRelationship('contact1')
  controller.selectRelationship('contact1', 'Padre/Madre')
  controller.updateName('contact1', 'Ana')
  controller.openRelationship('contact2')
  controller.selectRelationship('contact2', 'Hermanos')
  controller.updateName('contact2', 'Luis')
}

function selectPhone(harness, key, name, phone) {
  harness.controller.requestPhone(key)
  if (harness.controller.getState().dialog === CONTACT_DIALOG.guide) harness.controller.confirmContactGuide()
  harness.selections.at(-1)({ type: 'selected', name, phoneNumber: phone })
}

test('shows the contact guide once and atomically applies only valid unique selections', () => {
  const harness = createHarness()
  harness.controller.requestPhone('contact1')
  assert.equal(harness.controller.getState().dialog, CONTACT_DIALOG.guide)
  assert.equal(harness.selections.length, 0)
  harness.controller.confirmContactGuide()
  assert.equal(harness.selections.length, 1)

  harness.selections[0]({ type: 'selected', name: 'Ana', phoneNumber: '123 456 789' })
  assert.deepEqual(harness.controller.getState().contacts.contact1, { relationship: '', phoneNumber: '123456789', name: 'Ana' })

  harness.controller.requestPhone('contact1')
  assert.equal(harness.controller.getState().dialog, null)
  harness.selections[1]({ type: 'selected', name: 'Changed', phoneNumber: '123456789' })
  assert.equal(harness.controller.getState().dialog, CONTACT_DIALOG.duplicatePhone)
  assert.equal(harness.controller.getState().contacts.contact1.name, 'Ana')

  harness.controller.closeDialog()
  harness.controller.requestPhone('contact2')
  harness.selections[2]({ type: 'selected', name: 'Luis', phoneNumber: '123456789' })
  assert.equal(harness.controller.getState().dialog, CONTACT_DIALOG.duplicatePhone)
  assert.deepEqual(harness.controller.getState().contacts.contact2, { relationship: '', phoneNumber: '', name: '' })

  harness.controller.closeDialog()
  harness.controller.requestPhone('contact2')
  harness.selections[3]({ type: 'selected', name: 'Luis', phoneNumber: '12345678' })
  assert.equal(harness.controller.getState().dialog, CONTACT_DIALOG.invalidPhone)
  assert.deepEqual(harness.controller.getState().contacts.contact2, { relationship: '', phoneNumber: '', name: '' })
})

test('keeps existing fields for cancellation, missing phone, and unavailable selection', () => {
  const harness = createHarness()
  selectPhone(harness, 'contact1', 'Ana', '123456789')
  const before = harness.controller.getState().contacts
  for (const type of ['canceled', 'unavailable', 'not_completed']) {
    harness.controller.requestPhone('contact2')
    harness.selections.at(-1)({ type })
    assert.equal(harness.controller.getState().contacts, before)
    assert.equal(harness.controller.getState().dialog, null)
  }
  harness.controller.requestPhone('contact2')
  harness.selections.at(-1)({ type: 'no_phone' })
  assert.equal(harness.controller.getState().contacts, before)
  assert.equal(harness.controller.getState().dialog, CONTACT_DIALOG.invalidPhone)
})

test('submits once, sequences loading and success, then disables back before identity navigation', async () => {
  let resolveSubmit
  let submitCount = 0
  const harness = createHarness({ submitService: { submit: () => { submitCount += 1; return new Promise((resolve) => { resolveSubmit = resolve }) } } })
  harness.controller.initialize()
  fillRelationsAndNames(harness.controller)
  selectPhone(harness, 'contact1', 'Ana', '123456789')
  selectPhone(harness, 'contact2', 'Luis', '987654321')

  const pending = harness.controller.submit()
  assert.equal(harness.controller.getState().submitting, true)
  assert.equal(await harness.controller.submit(), false)
  assert.deepEqual(harness.calls, ['back:on', 'loading:show'])
  resolveSubmit({ type: 'success' })
  assert.equal(await pending, true)
  assert.equal(harness.controller.getState().dialog, CONTACT_DIALOG.success)
  assert.equal(harness.controller.canSubmit(), false)
  assert.equal(await harness.controller.submit(), false)
  assert.equal(submitCount, 1)
  assert.deepEqual(harness.calls, ['back:on', 'loading:show', 'loading:hide'])

  const successTimer = harness.timers.find((timer) => timer.delay === 1000)
  successTimer.callback()
  assert.deepEqual(harness.calls, ['back:on', 'loading:show', 'loading:hide', 'contact:dispose', 'back:off', 'navigate:identity'])
})

test('cancels contact selection and ignores its late result while submitting', async () => {
  let resolveSubmit
  let cancelCount = 0
  const contactSelection = {
    select(consumer) { harness.selections.push(consumer); return true },
    cancel() { cancelCount += 1 },
    dispose() {},
  }
  const harness = createHarness({
    contactSelection,
    submitService: { submit: () => new Promise((resolve) => { resolveSubmit = resolve }) },
  })
  fillRelationsAndNames(harness.controller)
  selectPhone(harness, 'contact1', 'Ana', '123456789')
  selectPhone(harness, 'contact2', 'Luis', '987654321')
  harness.controller.requestPhone('contact1')
  const lateSelection = harness.selections.at(-1)
  const before = harness.controller.getState().contacts

  const pending = harness.controller.submit()
  lateSelection({ type: 'selected', name: 'Late', phoneNumber: '111111111' })
  assert.equal(cancelCount, 1)
  assert.equal(harness.controller.getState().contacts, before)
  assert.equal(harness.controller.getState().dialog, null)

  resolveSubmit({ type: 'request_failure', message: 'Try later.' })
  assert.equal(await pending, false)
})

test('reports business and request failures after hiding loading without navigation', async () => {
  const business = createHarness({ submitService: { submit: async () => ({ type: 'business_failure', message: 'Try again.' }) } })
  fillRelationsAndNames(business.controller)
  selectPhone(business, 'contact1', 'Ana', '123456789')
  selectPhone(business, 'contact2', 'Luis', '987654321')
  assert.equal(await business.controller.submit(), false)
  assert.deepEqual(business.calls, ['loading:show', 'loading:hide', 'business:Try again.'])

  const request = createHarness({ submitService: { submit: async () => { throw new Error('Request unavailable.') } } })
  fillRelationsAndNames(request.controller)
  selectPhone(request, 'contact1', 'Ana', '123456789')
  selectPhone(request, 'contact2', 'Luis', '987654321')
  assert.equal(await request.controller.submit(), false)
  assert.deepEqual(request.calls, ['loading:show', 'loading:hide', 'request:Request unavailable.'])
  assert.equal(request.calls.includes('navigate:identity'), false)

  const handledError = Object.assign(new Error('Already handled.'), { businessHandled: true })
  const handled = createHarness({ submitService: { submit: async () => { throw handledError } } })
  fillRelationsAndNames(handled.controller)
  selectPhone(handled, 'contact1', 'Ana', '123456789')
  selectPhone(handled, 'contact2', 'Luis', '987654321')
  assert.equal(await handled.controller.submit(), false)
  assert.deepEqual(handled.calls, ['loading:show', 'loading:hide'])

  const canceled = createHarness({ submitService: { submit: async () => { throw Object.assign(new Error('Canceled.'), { category: 'canceled' }) } } })
  fillRelationsAndNames(canceled.controller)
  selectPhone(canceled, 'contact1', 'Ana', '123456789')
  selectPhone(canceled, 'contact2', 'Luis', '987654321')
  assert.equal(await canceled.controller.submit(), false)
  assert.deepEqual(canceled.calls, ['loading:show', 'loading:hide'])
})

test('does not let native loading failures interrupt a successful submission', async () => {
  const harness = createHarness({
    showNativeLoading() { throw new Error('Unavailable.') },
    hideNativeLoading() { throw new Error('Unavailable.') },
  })
  fillRelationsAndNames(harness.controller)
  selectPhone(harness, 'contact1', 'Ana', '123456789')
  selectPhone(harness, 'contact2', 'Luis', '987654321')
  assert.equal(await harness.controller.submit(), true)
  assert.equal(harness.controller.getState().dialog, CONTACT_DIALOG.success)
})

test('detaches the back proxy before disabling and ignores late events after leave or disposal', () => {
  const harness = createHarness()
  harness.controller.initialize()
  const activeBack = harness.getBackConfig()
  activeBack.onIntercept()
  activeBack.onIntercept()
  assert.equal(harness.controller.getState().dialog, CONTACT_DIALOG.leave)
  harness.controller.cancelLeave()
  assert.equal(harness.controller.getState().dialog, null)
  activeBack.onIntercept()
  harness.controller.confirmLeave()
  assert.deepEqual(harness.calls, ['back:on', 'contact:dispose', 'back:off', 'navigate:back'])
  activeBack.onIntercept()
  assert.equal(harness.controller.getState().dialog, null)

  const disposed = createHarness()
  disposed.controller.initialize()
  const disposedBack = disposed.getBackConfig()
  disposed.controller.dispose()
  disposedBack.onIntercept()
  assert.deepEqual(disposed.calls, ['back:on', 'contact:dispose', 'back:off'])
  assert.equal(disposed.controller.getState().dialog, null)
})

test('keeps visible back usable when native back enable or disable fails', () => {
  const unaccepted = createHarness({ setPhysicalBackIntercept: () => null })
  unaccepted.controller.initialize()
  unaccepted.controller.openLeaveConfirmation()
  unaccepted.controller.confirmLeave()
  assert.deepEqual(unaccepted.calls, ['contact:dispose', 'navigate:back'])

  let staleIntercept
  const failedClose = createHarness({
    setPhysicalBackIntercept(config) {
      if (config.enabled) {
        staleIntercept = config.onIntercept
        return 'enable-id'
      }
      throw new Error('Not accepted.')
    },
  })
  failedClose.controller.initialize()
  staleIntercept()
  failedClose.controller.confirmLeave()
  staleIntercept()
  assert.equal(failedClose.controller.getState().dialog, null)
  assert.deepEqual(failedClose.calls, ['contact:dispose', 'navigate:back'])

  const thrownEnable = createHarness({ setPhysicalBackIntercept() { throw new Error('Unavailable.') } })
  assert.doesNotThrow(() => thrownEnable.controller.initialize())
  thrownEnable.controller.openLeaveConfirmation()
  thrownEnable.controller.confirmLeave()
  assert.deepEqual(thrownEnable.calls, ['contact:dispose', 'navigate:back'])
})

test('aborts an in-flight request and hides loading once when disposed', async () => {
  let resolveSubmit
  const harness = createHarness({ submitService: { submit: () => new Promise((resolve) => { resolveSubmit = resolve }) } })
  fillRelationsAndNames(harness.controller)
  selectPhone(harness, 'contact1', 'Ana', '123456789')
  selectPhone(harness, 'contact2', 'Luis', '987654321')
  const pending = harness.controller.submit()
  harness.controller.dispose()
  resolveSubmit({ type: 'success' })
  assert.equal(await pending, false)
  assert.equal(harness.abortCount(), 1)
  assert.equal(harness.calls.filter((call) => call === 'loading:hide').length, 1)
  assert.equal(harness.calls.includes('navigate:identity'), false)
})
