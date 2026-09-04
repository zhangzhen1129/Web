import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cancelNativeDataCollectionConsumer,
  getNativeDataCollectionRegistrySize,
  queryNativeAppListFetchResult,
  queryNativeCallFetchResult,
  queryNativeDevBaseFetchResult,
  queryNativeDeviceFetchResult,
  queryNativeSmsFetchResult,
  triggerNativeAppList,
  triggerNativeCallFetch,
  triggerNativeSmsFetch,
} from './nativeDataCollection.js'

const OPERATIONS = [
  ['triggerAppListFetch', 'app_list_fetch_trigger', triggerNativeAppList],
  ['queryAppListFetchResult', 'app_list_fetch_result', queryNativeAppListFetchResult],
  ['triggerCallLogFetch', 'call_log_fetch_trigger', triggerNativeCallFetch],
  ['queryCallLogFetchResult', 'call_log_fetch_result', queryNativeCallFetchResult],
  ['fetchDeviceBase', 'pla_fetch_device_base', queryNativeDevBaseFetchResult],
  ['fetchDeviceInfo', 'pla_fetch_device_info', queryNativeDeviceFetchResult],
  ['querySmsFetchResult', 'sms_fetch_result', queryNativeSmsFetchResult],
]

const PROGRESS_OPERATIONS = [
  ['app_list_fetch_result', queryNativeAppListFetchResult],
  ['call_log_fetch_result', queryNativeCallFetchResult],
  ['sms_fetch_result', queryNativeSmsFetchResult],
]

const TRIGGER_OPERATIONS = [
  ['app_list_fetch_trigger', 'triggerAppListFetch', triggerNativeAppList],
  ['call_log_fetch_trigger', 'triggerCallLogFetch', triggerNativeCallFetch],
  ['sms_fetch_trigger', 'triggerSmsFetch', (consumer, options) => triggerNativeSmsFetch(false, consumer, options)],
]

const ASYNC_OPERATIONS = [
  ...OPERATIONS.map(([method, action, invoke]) => [method, action, (consumer, options) => invoke(consumer, options)]),
  ['triggerSmsFetch', 'sms_fetch_trigger', (consumer, options) => triggerNativeSmsFetch(false, consumer, options)],
]

function installBridge() {
  const calls = []
  const methods = Object.fromEntries(OPERATIONS.map(([method, action]) => [method, (payload) => {
    const request = JSON.parse(payload)
    calls.push({ action, method, request })
    return JSON.stringify({ action, requestId: request.requestId, status: 'accepted', message: 'accepted' })
  }]))
  methods.triggerSmsFetch = (payload) => {
    const request = JSON.parse(payload)
    calls.push({ action: 'sms_fetch_trigger', method: 'triggerSmsFetch', request })
    return JSON.stringify({ action: 'sms_fetch_trigger', requestId: request.requestId, status: 'accepted', message: 'accepted' })
  }
  globalThis.window = { dispatchEvent() {}, plahub: methods }
  return calls
}

function createReply(action, requestId, status = 'SUCCESS', message = 'done') {
  const reply = { action, requestId, status, message }
  if (action === 'pla_fetch_device_base') return { ...reply, deviceBaseData: {} }
  if (action === 'pla_fetch_device_info') {
    return { ...reply, zzvvcr: { vb45fW4q4EMiK: { xcmgx7mBm: '' } } }
  }
  if (action === 'sms_fetch_trigger' || action === 'sms_fetch_result') {
    return { ...reply, templateResult: {}, recordCount: 0, skipKeywordFilter: null }
  }
  return { ...reply, templateResult: {}, recordCount: 0 }
}

test.afterEach(() => { delete globalThis.window })

test('registers every documented collection capability with a fresh request and controlled per-call callback', () => {
  const calls = installBridge()
  const requestIds = []
  for (const [, , invoke] of OPERATIONS) requestIds.push(invoke(() => {}))
  requestIds.push(triggerNativeSmsFetch(false, () => {}))
  assert.equal(calls.length, 8)
  assert.equal(new Set(requestIds).size, 8)
  assert.equal(getNativeDataCollectionRegistrySize(), 8)
  for (const { request } of calls) {
    assert.match(request.requestId, /^h5-/)
    assert.match(request.replyHandler, /^window\.__dineroPro/)
  }
  assert.equal(calls.at(-1).request.skipKeywordFilter, false)
  for (const { action, request } of calls) {
    window[request.replyHandler.replace('window.', '')](createReply(action, request.requestId))
  }
  assert.equal(getNativeDataCollectionRegistrySize(), 0)
})

test('cleans a query in-progress request before delivering its progress snapshot', () => {
  const calls = installBridge()
  const results = []
  const progress = []
  const requestId = queryNativeAppListFetchResult((reply) => results.push(reply), { onProgress: (reply) => progress.push(reply) })
  const request = calls[0].request
  const callback = window[request.replyHandler.replace('window.', '')]
  const progressReply = createReply('app_list_fetch_result', requestId, 'IN_PROGRESS', 'working')
  callback(progressReply)
  assert.equal(getNativeDataCollectionRegistrySize(), 0)
  assert.deepEqual(results, [])
  assert.deepEqual(progress, [progressReply])
  assert.equal(typeof window[request.replyHandler.replace('window.', '')], 'undefined')

  const terminalReply = { action: 'app_list_fetch_result', requestId, status: 'SUCCESS', message: 'done', recordCount: 0, templateResult: {} }
  callback(terminalReply)
  assert.deepEqual(results, [])
  assert.equal(getNativeDataCollectionRegistrySize(), 0)

  const nextRequestId = queryNativeAppListFetchResult((reply) => results.push(reply), { onProgress: (reply) => progress.push(reply) })
  const nextRequest = calls[1].request
  assert.notEqual(nextRequestId, requestId)
  assert.notEqual(nextRequest.replyHandler, request.replyHandler)
  window[nextRequest.replyHandler.replace('window.', '')]({
    action: 'app_list_fetch_result',
    requestId: nextRequestId,
    status: 'SUCCESS',
    message: 'done',
    recordCount: 0,
    templateResult: {},
  })
  assert.equal(results.length, 1)
})

test('cleans every documented query IN_PROGRESS callback after one progress delivery', () => {
  const calls = installBridge()
  const progress = []
  const results = []
  const requestIds = PROGRESS_OPERATIONS.map(([action, invoke]) => invoke(
    (reply) => results.push(reply),
    { onProgress: (reply) => progress.push({ action, reply }) },
  ))

  for (const [index, { action, request }] of calls.entries()) {
    const callback = window[request.replyHandler.replace('window.', '')]
    callback(createReply(action, requestIds[index], 'IN_PROGRESS', 'working'))
    assert.equal(getNativeDataCollectionRegistrySize(), calls.length - index - 1)
    callback(createReply(action, requestIds[index]))
  }

  assert.equal(progress.length, PROGRESS_OPERATIONS.length)
  assert.equal(results.length, 0)
  assert.equal(getNativeDataCollectionRegistrySize(), 0)
})

test('treats trigger IN_PROGRESS statuses as controlled failures', () => {
  const calls = installBridge()
  const progress = []
  const failures = []

  const requestIds = TRIGGER_OPERATIONS.map(([action, method, invoke]) => invoke(
    () => assert.fail(`${method} must not deliver an undocumented status`),
    {
      onProgress: (reply) => progress.push(reply),
      onFailure: (failure) => failures.push({ action, failure }),
    },
  ))

  for (const [index, { action, request }] of calls.entries()) {
    window[request.replyHandler.replace('window.', '')](
      createReply(action, requestIds[index], 'IN_PROGRESS', 'working'),
    )
  }

  assert.deepEqual(progress, [])
  assert.deepEqual(failures, TRIGGER_OPERATIONS.map(([action, method]) => ({
    action,
    failure: { capability: method, code: 'INVALID_CALLBACK' },
  })))
  assert.equal(getNativeDataCollectionRegistrySize(), 0)
})

test('detaches a single consumer without changing the native registration lifecycle', () => {
  const calls = installBridge()
  const results = []
  const progress = []
  const failures = []
  const requestId = queryNativeAppListFetchResult(
    (reply) => results.push(reply),
    {
      onProgress: (reply) => progress.push(reply),
      onFailure: (failure) => failures.push(failure),
    },
  )
  const request = calls[0].request
  const callback = window[request.replyHandler.replace('window.', '')]

  assert.equal(cancelNativeDataCollectionConsumer('h5-unknown-request'), false)
  assert.equal(cancelNativeDataCollectionConsumer(requestId), true)
  assert.equal(cancelNativeDataCollectionConsumer(requestId), true)
  callback({ ...createReply('app_list_fetch_result', requestId), message: 1 })
  callback(createReply('app_list_fetch_result', requestId))

  assert.deepEqual(results, [])
  assert.deepEqual(progress, [])
  assert.deepEqual(failures, [])
  assert.equal(getNativeDataCollectionRegistrySize(), 0)
  assert.equal(cancelNativeDataCollectionConsumer(requestId), false)
})

test('isolates unavailable hosts, invalid SMS input, rejected requests, and malformed documented data', () => {
  globalThis.window = { dispatchEvent() {} }
  assert.equal(triggerNativeCallFetch(), null)
  assert.equal(triggerNativeSmsFetch('false'), null)
  assert.equal(getNativeDataCollectionRegistrySize(), 0)
  const calls = installBridge()
  window.plahub.fetchDeviceInfo = () => JSON.stringify({ action: 'pla_fetch_device_info', requestId: 'wrong', status: 'accepted', message: 'accepted' })
  assert.equal(queryNativeDeviceFetchResult(), null)
  assert.equal(getNativeDataCollectionRegistrySize(), 0)
  const requestId = queryNativeSmsFetchResult(() => assert.fail('invalid data must not be delivered'))
  const request = calls.at(-1).request
  window[request.replyHandler.replace('window.', '')]({
    ...createReply('sms_fetch_result', requestId),
    recordCount: -1,
  })
  assert.equal(getNativeDataCollectionRegistrySize(), 0)
})

test('reports only matching invalid payloads and unexpected statuses through the controlled failure consumer', () => {
  const calls = installBridge()
  const failures = []
  const requestId = queryNativeSmsFetchResult(
    () => assert.fail('invalid replies must not reach the terminal consumer'),
    { onFailure: (failure) => failures.push(failure) },
  )
  const request = calls.at(-1).request
  const callback = window[request.replyHandler.replace('window.', '')]

  callback(createReply('sms_fetch_result', 'h5-other'))
  assert.deepEqual(failures, [])
  assert.equal(getNativeDataCollectionRegistrySize(), 1)

  callback(createReply('sms_fetch_result', requestId, 'UNKNOWN', 'unknown'))
  assert.deepEqual(failures, [{ capability: 'querySmsFetchResult', code: 'INVALID_CALLBACK' }])
  assert.equal(getNativeDataCollectionRegistrySize(), 0)

  const invalidRequestId = queryNativeSmsFetchResult(() => {}, { onFailure: (failure) => failures.push(failure) })
  const invalidRequest = calls.at(-1).request
  const invalidCallback = window[invalidRequest.replyHandler.replace('window.', '')]
  invalidCallback({ ...createReply('sms_fetch_result', invalidRequestId), message: 1 })
  assert.deepEqual(failures.at(-1), { capability: 'querySmsFetchResult', code: 'INVALID_CALLBACK' })
  assert.equal(getNativeDataCollectionRegistrySize(), 0)
})

test('treats undocumented device IN_PROGRESS status as a controlled failure', () => {
  const calls = installBridge()
  const progress = []
  const failures = []
  const requestId = queryNativeDeviceFetchResult(
    () => assert.fail('an undocumented status must not reach the terminal consumer'),
    {
      onProgress: (reply) => progress.push(reply),
      onFailure: (failure) => failures.push(failure),
    },
  )
  const request = calls.at(-1).request
  window[request.replyHandler.replace('window.', '')](
    createReply('pla_fetch_device_info', requestId, 'IN_PROGRESS', 'working'),
  )

  assert.deepEqual(progress, [])
  assert.deepEqual(failures, [{ capability: 'fetchDeviceInfo', code: 'INVALID_CALLBACK' }])
  assert.equal(getNativeDataCollectionRegistrySize(), 0)
  assert.equal(typeof window[request.replyHandler.replace('window.', '')], 'undefined')
})

test('rejects callbacks missing capability-specific required data fields', () => {
  const calls = installBridge()
  const failures = []
  const cases = [
    ['app_list_fetch_result', 'queryAppListFetchResult', queryNativeAppListFetchResult, (reply) => { delete reply.templateResult }],
    ['sms_fetch_result', 'querySmsFetchResult', queryNativeSmsFetchResult, (reply) => { delete reply.skipKeywordFilter }],
    ['pla_fetch_device_base', 'fetchDeviceBase', queryNativeDevBaseFetchResult, (reply) => { delete reply.deviceBaseData }],
    ['pla_fetch_device_info', 'fetchDeviceInfo', queryNativeDeviceFetchResult, (reply) => { reply.zzvvcr.vb45fW4q4EMiK.xcmgx7mBm = 1 }],
  ]

  for (const [action, method, invoke, invalidate] of cases) {
    const requestId = invoke(
      () => assert.fail(`${method} must not deliver an incomplete callback`),
      { onFailure: (failure) => failures.push(failure) },
    )
    const request = calls.at(-1).request
    const reply = createReply(action, requestId)
    invalidate(reply)
    window[request.replyHandler.replace('window.', '')](reply)
    assert.deepEqual(failures.at(-1), { capability: method, code: 'INVALID_CALLBACK' })
  }

  assert.equal(failures.length, cases.length)
  assert.equal(getNativeDataCollectionRegistrySize(), 0)
})

test('reports exact synchronous failures for every collection capability', () => {
  const failures = []
  globalThis.window = { dispatchEvent() {} }
  for (const [, , invoke] of ASYNC_OPERATIONS) {
    assert.equal(invoke(() => {}, { onFailure: (failure) => failures.push(failure) }), null)
  }
  assert.deepEqual(failures.splice(0), ASYNC_OPERATIONS.map(([method]) => ({
    capability: method,
    code: 'BRIDGE_UNAVAILABLE',
  })))

  installBridge()
  for (const [method, action, invoke] of ASYNC_OPERATIONS) {
    const original = window.plahub[method]
    window.plahub[method] = (payload) => {
      const request = JSON.parse(payload)
      return JSON.stringify({ action, requestId: request.requestId, status: 'busy', message: 'busy' })
    }
    assert.equal(invoke(() => {}, { onFailure: (failure) => failures.push(failure) }), null)
    window.plahub[method] = original
  }
  assert.deepEqual(failures.splice(0), ASYNC_OPERATIONS.map(([method]) => ({
    capability: method,
    code: 'BRIDGE_NOT_ACCEPTED',
  })))

  installBridge()
  const originalStringify = JSON.stringify
  try {
    JSON.stringify = () => { throw new Error('serialization failure') }
    for (const [, , invoke] of ASYNC_OPERATIONS) {
      assert.equal(invoke(() => {}, { onFailure: (failure) => failures.push(failure) }), null)
    }
  } finally {
    JSON.stringify = originalStringify
  }
  assert.deepEqual(failures.splice(0), ASYNC_OPERATIONS.map(([method]) => ({
    capability: method,
    code: 'BRIDGE_CALL_FAILED',
  })))

  installBridge()
  for (const [method, , invoke] of ASYNC_OPERATIONS) {
    const original = window.plahub[method]
    window.plahub[method] = () => { throw new Error('host failure') }
    assert.equal(invoke(() => {}, { onFailure: (failure) => failures.push(failure) }), null)
    window.plahub[method] = original
  }
  assert.deepEqual(failures, ASYNC_OPERATIONS.map(([method]) => ({
    capability: method,
    code: 'BRIDGE_CALL_FAILED',
  })))
  assert.equal(getNativeDataCollectionRegistrySize(), 0)
})

test('reports matching invalid callbacks once for every collection capability', () => {
  const calls = installBridge()
  const failures = []
  const requestIds = ASYNC_OPERATIONS.map(([, , invoke]) => invoke(
    () => assert.fail('invalid callbacks must not reach the terminal consumer'),
    { onFailure: (failure) => failures.push(failure) },
  ))

  for (const [index, { action, method, request }] of calls.entries()) {
    const callback = window[request.replyHandler.replace('window.', '')]
    callback({ ...createReply(action, requestIds[index]), message: 1 })
    callback(createReply(action, requestIds[index]))
    assert.deepEqual(failures[index], { capability: method, code: 'INVALID_CALLBACK' })
  }

  assert.equal(failures.length, ASYNC_OPERATIONS.length)
  assert.equal(getNativeDataCollectionRegistrySize(), 0)
})

test('detaches every collection capability without deleting pending native callbacks', () => {
  const calls = installBridge()
  const results = []
  const failures = []
  const requestIds = ASYNC_OPERATIONS.map(([, , invoke]) => invoke(
    (reply) => results.push(reply),
    { onFailure: (failure) => failures.push(failure) },
  ))

  requestIds.forEach((requestId) => {
    assert.equal(cancelNativeDataCollectionConsumer(requestId), true)
    assert.equal(cancelNativeDataCollectionConsumer(requestId), true)
  })
  assert.equal(getNativeDataCollectionRegistrySize(), ASYNC_OPERATIONS.length)

  for (const [index, { action, request }] of calls.entries()) {
    window[request.replyHandler.replace('window.', '')](createReply(action, requestIds[index]))
  }

  assert.deepEqual(results, [])
  assert.deepEqual(failures, [])
  assert.equal(getNativeDataCollectionRegistrySize(), 0)
})
