import assert from 'node:assert/strict'
import test from 'node:test'
import { createIdentityController, IDENTITY_PHASE } from './identityController.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function flush(times = 4) {
  for (let index = 0; index < times; index += 1) await new Promise((resolve) => setImmediate(resolve))
}

function schedule(callback, delay) {
  if (delay === 1000) queueMicrotask(callback)
  return Object.freeze({ delay })
}

function bridgeFixture() {
  const calls = []
  let id = 0
  const fixture = {
    calls,
    idConsumer: null,
    idFailure: null,
    faceConsumer: null,
    faceFailure: null,
    advanceConsumer: null,
    advanceFailure: null,
    physicalConsumer: null,
    showLoading: () => calls.push('showLoading'),
    hideLoading: () => calls.push('hideLoading'),
    setPhysicalBack: (config) => {
      calls.push(['physicalBack', config.enabled])
      if (config.enabled) fixture.physicalConsumer = config.onIntercept
      return `back-${++id}`
    },
    openIdCard: (consumer, options) => {
      calls.push(['idCard'])
      fixture.idConsumer = consumer
      fixture.idFailure = options.onFailure
      return `id-${++id}`
    },
    cancelIdCard: (handle) => calls.push(['cancelId', handle]),
    openFace: (consumer, options) => {
      calls.push(['face'])
      fixture.faceConsumer = consumer
      fixture.faceFailure = options.onFailure
      return `face-${++id}`
    },
    cancelFace: (handle) => calls.push(['cancelFace', handle]),
    openAdvance: (url, consumer, options) => {
      calls.push(['advance', url])
      fixture.advanceConsumer = consumer
      fixture.advanceFailure = options.onFailure
      return `advance-${++id}`
    },
    cancelAdvance: (handle) => calls.push(['cancelAdvance', handle]),
  }
  return fixture
}

function createAdvancePortFactory(fixture) {
  return ({ onResult, onFailure }) => ({
    open(url) {
      fixture.calls.push(['advance', url])
      fixture.advanceConsumer = onResult
      fixture.advanceFailure = onFailure
      return true
    },
    detach() {
      fixture.calls.push(['detachAdvance'])
      fixture.advanceConsumer = null
      fixture.advanceFailure = null
      return true
    },
  })
}

function createController(options = {}) {
  return createIdentityController({ schedule, cancelSchedule: () => {}, createImagePreview: async () => 'blob:identity-test-preview', revokeImagePreview: () => {}, ...options })
}

async function makeReady(controller, bridge, idNumber = 'DNI-1') {
  controller.openDocumentArea()
  controller.confirmFirstPrompt()
  bridge.idConsumer({ status: 'success', imageBase64: 'front-image' })
  await flush()
  assert.equal(controller.getState().phase, IDENTITY_PHASE.DOCUMENT_READY)
  assert.equal(controller.getState().dni, idNumber)
}

test('shows the first prompt once and initializes physical back only once', () => {
  const bridge = bridgeFixture()
  const controller = createController({ bridges: bridge, services: {} })
  controller.initialize()
  controller.initialize()
  assert.deepEqual(bridge.calls.filter((call) => Array.isArray(call) && call[0] === 'physicalBack'), [['physicalBack', true]])
  controller.openDocumentArea()
  assert.equal(controller.getState().firstPromptOpen, true)
  controller.closeFirstPrompt()
  controller.openDocumentArea()
  assert.equal(controller.getState().phase, IDENTITY_PHASE.DOCUMENT_CAPTURING)
  assert.equal(bridge.calls.filter((call) => Array.isArray(call) && call[0] === 'idCard').length, 1)
  controller.dispose()
})

test('requires exact OCR success and atomically replaces the document context', async () => {
  const bridge = bridgeFixture()
  const ocr = deferred()
  const failures = []
  const services = { saveIdentity: ({ mark }) => mark === 1 ? ocr.promise : Promise.resolve({ type: 'success', status: '1' }) }
  const controller = createController({ bridges: bridge, services, onBusinessFailure: (message) => failures.push(message) })
  controller.openDocumentArea()
  controller.confirmFirstPrompt()
  bridge.idConsumer({ status: 'success', imageBase64: 'new-image' })
  assert.equal(controller.getState().phase, IDENTITY_PHASE.DOCUMENT_RECOGNIZING)
  assert.equal(controller.getState().imagePreviewUrl, '')
  ocr.resolve({ type: 'business_failure', message: 'OCR failed' })
  await flush()
  assert.equal(controller.getState().phase, IDENTITY_PHASE.DOCUMENT_EMPTY)
  assert.equal(controller.getState().imagePreviewUrl, '')
  assert.equal(controller.getState().dni, '')
  assert.deepEqual(failures, ['OCR failed'])
  controller.dispose()
})

test('runs the ordinary face chain in order and cleans back interception before replace navigation', async () => {
  const bridge = bridgeFixture()
  const serviceCalls = []
  const events = bridge.calls
  const services = {
    saveIdentity: async (payload) => {
      serviceCalls.push(['save', payload.mark, payload.livingBase64Src ?? '', payload.h5LivenessId ?? '', payload.identityNo ?? ''])
      if (payload.mark === 1) return { type: 'success', status: '1', idNumber: 'DNI-1' }
      return { type: 'success', status: '1', idNumber: '' }
    },
    getOcrChannel: async () => { serviceCalls.push(['channel']); return { type: 'success', channel: 'Regular' } },
    refreshAppMode: async () => { serviceCalls.push(['refresh']); return { type: 'success', orderId: 'order-1' } },
  }
  const controller = createController({
    bridges: bridge,
    services,
    onNavigateAddBank: (query) => events.push(['navigate', query]),
  })
  controller.initialize()
  await makeReady(controller, bridge)
  assert.equal(await controller.submit(), true)
  assert.equal(controller.getState().phase, IDENTITY_PHASE.LIVENESS_RUNNING)
  const showIndex = events.indexOf('showLoading')
  const faceIndex = events.findIndex((entry) => Array.isArray(entry) && entry[0] === 'face')
  const hideIndex = events.indexOf('hideLoading', showIndex)
  assert.ok(showIndex < faceIndex && faceIndex < hideIndex)
  bridge.faceConsumer({ status: 'success', imageBase64: 'face-image' })
  await flush(8)
  assert.deepEqual(serviceCalls, [
    ['save', 1, '', '', ''],
    ['channel'],
    ['save', 4, 'face-image', '', ''],
    ['save', 5, '', '', 'DNI-1'],
    ['refresh'],
  ])
  const disableIndex = events.findIndex((entry) => Array.isArray(entry) && entry[0] === 'physicalBack' && entry[1] === false)
  const navigateIndex = events.findIndex((entry) => Array.isArray(entry) && entry[0] === 'navigate')
  assert.ok(disableIndex >= 0 && disableIndex < navigateIndex)
  assert.deepEqual(events[navigateIndex][1], { orderId: 'order-1', from: 'order' })
  assert.equal(controller.getState().phase, IDENTITY_PHASE.INACTIVE)
  controller.dispose()
})

test('Advance type 2 starts a fresh channel and session chain without reusing the prior URL', async () => {
  const bridge = bridgeFixture()
  let channelCount = 0
  let sessionCount = 0
  const services = {
    saveIdentity: async ({ mark }) => mark === 1 ? { type: 'success', status: '1', idNumber: 'DNI-1' } : { type: 'success', status: '1', idNumber: '' },
    getOcrChannel: async () => { channelCount += 1; return { type: 'success', channel: 'Advance' } },
    createAdvanceSession: async () => {
      sessionCount += 1
      return { type: 'success', requestHandle: `signature-${sessionCount}`, url: `https://trusted.example/live-${sessionCount}` }
    },
  }
  const controller = createController({ bridges: bridge, services, createAdvancePort: createAdvancePortFactory(bridge) })
  await makeReady(controller, bridge)
  await controller.submit()
  assert.equal(channelCount, 1)
  assert.equal(sessionCount, 1)
  assert.deepEqual(bridge.calls.filter((entry) => Array.isArray(entry) && entry[0] === 'advance').map((entry) => entry[1]), ['https://trusted.example/live-1'])
  bridge.advanceConsumer({ type: 2 })
  await flush(8)
  assert.equal(channelCount, 2)
  assert.equal(sessionCount, 2)
  assert.deepEqual(bridge.calls.filter((entry) => Array.isArray(entry) && entry[0] === 'advance').map((entry) => entry[1]), [
    'https://trusted.example/live-1',
    'https://trusted.example/live-2',
  ])
  controller.dispose()
})

test('restores the document context when Advance returns without a result and allows a new capture', async () => {
  const bridge = bridgeFixture()
  const services = {
    saveIdentity: async ({ mark }) => mark === 1 ? { type: 'success', status: '1', idNumber: 'DNI-1' } : { type: 'success', status: '1', idNumber: '' },
    getOcrChannel: async () => ({ type: 'success', channel: 'Advance' }),
    createAdvanceSession: async () => ({ type: 'success', requestHandle: 'signature-1', url: 'https://trusted.example/live-1' }),
  }
  const controller = createController({ bridges: bridge, services, createAdvancePort: createAdvancePortFactory(bridge) })
  await makeReady(controller, bridge)
  const previewUrl = controller.getState().imagePreviewUrl
  await controller.submit()
  assert.equal(controller.getState().phase, IDENTITY_PHASE.LIVENESS_RUNNING)
  assert.equal(controller.getState().busy, true)
  assert.equal(controller.resumeFromExternalFlow(), true)
  assert.equal(controller.getState().phase, IDENTITY_PHASE.DOCUMENT_READY)
  assert.equal(controller.getState().busy, false)
  assert.equal(controller.getState().dni, 'DNI-1')
  assert.equal(controller.getState().imagePreviewUrl, previewUrl)
  assert.equal(bridge.advanceConsumer, null)
  controller.openDocumentArea()
  assert.equal(controller.getState().phase, IDENTITY_PHASE.DOCUMENT_CAPTURING)
  controller.dispose()
})

test('keeps the previous document preview when a replacement preview cannot be created', async () => {
  const bridge = bridgeFixture()
  let previewCalls = 0
  const services = { saveIdentity: async ({ mark }) => ({ type: 'success', status: '1', idNumber: mark === 1 ? 'DNI-1' : '' }) }
  const controller = createController({
    bridges: bridge,
    services,
    createImagePreview: async () => {
      previewCalls += 1
      if (previewCalls === 2) throw new Error('preview failed')
      return 'blob:identity-first-preview'
    },
  })
  await makeReady(controller, bridge, 'DNI-1')
  assert.equal(controller.getState().imagePreviewUrl, 'blob:identity-first-preview')
  controller.openDocumentArea()
  bridge.idConsumer({ status: 'success', imageBase64: 'replacement-image' })
  await flush(8)
  assert.equal(controller.getState().phase, IDENTITY_PHASE.DOCUMENT_READY)
  assert.equal(controller.getState().dni, 'DNI-1')
  assert.equal(controller.getState().imagePreviewUrl, 'blob:identity-first-preview')
  controller.dispose()
})

test('finishes OCR progress after server success without waiting for preview conversion', async () => {
  const bridge = bridgeFixture()
  const ocr = deferred()
  const preview = deferred()
  const controller = createController({
    bridges: bridge,
    services: { saveIdentity: () => ocr.promise },
    createImagePreview: () => preview.promise,
  })
  controller.openDocumentArea()
  controller.confirmFirstPrompt()
  bridge.idConsumer({ status: 'success', imageBase64: 'replacement-image' })
  ocr.resolve({ type: 'success', status: '1', idNumber: 'DNI-2' })
  await flush(8)
  assert.equal(controller.getState().progressOpen, false)
  assert.equal(controller.getState().busy, true)
  assert.equal(controller.getState().imagePreviewUrl, '')
  preview.resolve('blob:identity-replacement-preview')
  await flush(8)
  assert.equal(controller.getState().phase, IDENTITY_PHASE.DOCUMENT_READY)
  assert.equal(controller.getState().busy, false)
  assert.equal(controller.getState().dni, 'DNI-2')
  assert.equal(controller.getState().imagePreviewUrl, 'blob:identity-replacement-preview')
  controller.dispose()
})

test('does not leave OCR progress open when preview conversion rejects', async () => {
  const bridge = bridgeFixture()
  const controller = createController({
    bridges: bridge,
    services: { saveIdentity: async () => ({ type: 'success', status: '1', idNumber: 'DNI-2' }) },
    createImagePreview: async () => { throw new Error('preview failed') },
  })
  controller.openDocumentArea()
  controller.confirmFirstPrompt()
  bridge.idConsumer({ status: 'success', imageBase64: 'replacement-image' })
  await flush(8)
  assert.equal(controller.getState().progressOpen, false)
  assert.equal(controller.getState().busy, false)
  assert.equal(controller.getState().phase, IDENTITY_PHASE.DOCUMENT_EMPTY)
  controller.dispose()
})

test('leave confirmation suspends presentation and confirmation aborts current work and detaches consumers', async () => {
  const bridge = bridgeFixture()
  const pending = deferred()
  let signal
  let navigated = 0
  const services = {
    saveIdentity: ({ mark, signal: nextSignal }) => {
      if (mark === 1) { signal = nextSignal; return pending.promise }
      return Promise.resolve({ type: 'success', status: '1', idNumber: '' })
    },
  }
  const controller = createController({ bridges: bridge, services, onNavigateBack: () => { navigated += 1 } })
  controller.initialize()
  controller.openDocumentArea()
  controller.confirmFirstPrompt()
  bridge.idConsumer({ status: 'success', imageBase64: 'front-image' })
  await flush(1)
  assert.equal(controller.getState().progressOpen, true)
  controller.requestLeave()
  assert.equal(controller.getState().leaveConfirmationOpen, true)
  assert.equal(controller.getState().progressOpen, true)
  controller.cancelLeave()
  assert.equal(controller.getState().leaveConfirmationOpen, false)
  assert.equal(controller.getState().progressOpen, true)
  controller.requestLeave()
  controller.confirmLeave()
  assert.equal(signal.aborted, true)
  assert.equal(controller.getState().phase, IDENTITY_PHASE.INACTIVE)
  assert.equal(navigated, 1)
  assert.ok(bridge.calls.some((entry) => Array.isArray(entry) && entry[0] === 'physicalBack' && entry[1] === false))
  pending.resolve({ type: 'success', status: '1', idNumber: 'late' })
  await flush()
  assert.equal(controller.getState().phase, IDENTITY_PHASE.INACTIVE)
})

test('does not submit without a ready non-empty DNI and aborts a pending channel request on dispose', async () => {
  const bridge = bridgeFixture()
  const pending = deferred()
  let channelSignal
  const services = {
    saveIdentity: async ({ mark }) => mark === 1 ? { type: 'success', status: '1', idNumber: 'DNI-1' } : { type: 'success', status: '1', idNumber: '' },
    getOcrChannel: ({ signal }) => { channelSignal = signal; return pending.promise },
  }
  const controller = createController({ bridges: bridge, services })
  assert.equal(await controller.submit(), false)
  await makeReady(controller, bridge)
  void controller.submit()
  await flush(1)
  controller.dispose()
  assert.equal(channelSignal.aborted, true)
  pending.resolve({ type: 'success', channel: 'Regular' })
})

test('ignores non-success camera terminals even when they contain unexpected image data', async () => {
  const bridge = bridgeFixture()
  let saves = 0
  const services = {
    saveIdentity: async ({ mark }) => { saves += 1; return { type: 'success', status: '1', idNumber: mark === 1 ? 'DNI-1' : '' } },
    getOcrChannel: async () => ({ type: 'success', channel: 'Regular' }),
  }
  const controller = createController({ bridges: bridge, services })
  controller.openDocumentArea()
  controller.confirmFirstPrompt()
  bridge.idConsumer({ status: 'cancel', imageBase64: 'unexpected-image' })
  await flush()
  assert.equal(saves, 0)
  assert.equal(controller.getState().phase, IDENTITY_PHASE.DOCUMENT_EMPTY)

  controller.openDocumentArea()
  bridge.idConsumer({ status: 'success', imageBase64: 'front-image' })
  await flush()
  await controller.submit()
  bridge.faceConsumer({ status: 'permission_denied', imageBase64: 'unexpected-face' })
  await flush()
  assert.equal(saves, 1)
  assert.equal(controller.getState().phase, IDENTITY_PHASE.DOCUMENT_READY)
  controller.dispose()
})

test('clears the page back consumer before navigation even when native disable is rejected', () => {
  const calls = []
  let nativeConsumer
  let navigated = 0
  const bridge = {
    showLoading() {}, hideLoading() {},
    setPhysicalBack(config) {
      if (config.enabled) { nativeConsumer = config.onIntercept; return 'enabled' }
      calls.push('disable-rejected')
      return null
    },
    openIdCard() { return null }, cancelIdCard() {}, openFace() { return null }, cancelFace() {},
  }
  const controller = createController({ bridges: bridge, services: {}, onNavigateBack: () => { navigated += 1 } })
  controller.initialize()
  controller.requestLeave()
  controller.confirmLeave()
  assert.equal(navigated, 1)
  assert.equal(controller.getState().phase, IDENTITY_PHASE.INACTIVE)
  nativeConsumer()
  assert.equal(controller.getState().leaveConfirmationOpen, false)
  assert.deepEqual(calls, ['disable-rejected'])
  controller.dispose()
  assert.deepEqual(calls, ['disable-rejected', 'disable-rejected'])
})

test('stops scheduling simulated progress after reaching 99 percent', async () => {
  const bridge = bridgeFixture()
  const pending = deferred()
  const callbacks = []
  const controller = createIdentityController({
    bridges: bridge,
    services: { saveIdentity: () => pending.promise },
    schedule: (callback, delay) => { callbacks.push({ callback, delay }); return callbacks.length },
    cancelSchedule: () => {},
  })
  controller.openDocumentArea()
  controller.confirmFirstPrompt()
  bridge.idConsumer({ status: 'success', imageBase64: 'front-image' })
  for (let count = 0; count < 120; count += 1) {
    const next = callbacks.shift()
    if (!next || next.delay !== 100) break
    next.callback()
  }
  assert.equal(controller.getState().progress, 99)
  assert.equal(callbacks.filter((entry) => entry.delay === 100).length, 0)
  controller.dispose()
  pending.resolve({ type: 'canceled' })
  await flush()
})

test('keeps API-003 request failures silent but reports API-001 request failures', async () => {
  const bridge = bridgeFixture()
  const notices = []
  const ocrFailureController = createController({
    bridges: bridge,
    services: { saveIdentity: async () => { throw Object.assign(new Error('OCR transport failed'), { displayMessage: 'OCR transport failed' }) } },
    onRequestFailure: (message) => notices.push(message),
  })
  ocrFailureController.openDocumentArea()
  ocrFailureController.confirmFirstPrompt()
  bridge.idConsumer({ status: 'success', imageBase64: 'front-image' })
  await flush()
  assert.deepEqual(notices, [])
  assert.equal(ocrFailureController.getState().phase, IDENTITY_PHASE.DOCUMENT_EMPTY)
  ocrFailureController.dispose()

  const channelBridge = bridgeFixture()
  const channelNotices = []
  const channelController = createController({
    bridges: channelBridge,
    services: {
      saveIdentity: async ({ mark }) => ({ type: 'success', status: '1', idNumber: mark === 1 ? 'DNI-1' : '' }),
      getOcrChannel: async () => { throw Object.assign(new Error('Network unavailable'), { displayMessage: 'Network unavailable' }) },
    },
    onRequestFailure: (message) => channelNotices.push(message),
  })
  await makeReady(channelController, channelBridge)
  await channelController.submit()
  assert.deepEqual(channelNotices, ['Network unavailable'])
  assert.equal(channelController.getState().phase, IDENTITY_PHASE.DOCUMENT_READY)
  channelController.dispose()
})
