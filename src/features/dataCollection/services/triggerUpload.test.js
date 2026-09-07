import assert from 'node:assert/strict'
import test from 'node:test'
import { ungzip } from 'pako'
import { createTriggerUploadService } from './triggerUpload.js'

const protocol = Object.freeze({
  path: '/protocol-upload',
  protocolId: 'data-collection-upload',
  fullUploadPath: Object.freeze(['metadata', 'full']),
  mobilePath: Object.freeze(['identity', 'mobile']),
  responseCodePath: Object.freeze(['result', 'code']),
})

const bridgeMethod = Object.freeze({
  app: 'queryNativeAppListFetchResult',
  callLog: 'queryNativeCallFetchResult',
  deviceBase: 'queryNativeDevBaseFetchResult',
  deviceInfo: 'queryNativeDeviceFetchResult',
  sms: 'queryNativeSmsFetchResult',
})

function replyFor(name, status = 'SUCCESS') {
  if (name === 'deviceInfo') return { status, zzvvcr: { device: { id: 'device' } } }
  if (name === 'deviceBase') return { status, deviceBaseData: { base: { id: 'base' } } }
  return { status, templateResult: { [name]: [{ id: name }] } }
}

function createBridge(outcomes = {}) {
  const calls = []
  const bridge = { calls, cancelNativeDataCollectionConsumer() {} }
  for (const [name, method] of Object.entries(bridgeMethod)) {
    const queue = [...(outcomes[name] ?? ['SUCCESS'])]
    bridge[method] = (consumer, options) => {
      calls.push(name)
      const status = queue.shift() ?? 'SUCCESS'
      queueMicrotask(() => {
        const reply = replyFor(name, status)
        if (status === 'IN_PROGRESS') options.onProgress(reply)
        else consumer(reply)
      })
      return `${name}-${calls.length}`
    }
  }
  return bridge
}

function createService({ outcomes, response = { result: { code: 200 } } } = {}) {
  const bridge = createBridge(outcomes)
  const requests = []
  const statuses = []
  let triggerCount = 0
  const service = createTriggerUploadService({
    bridge,
    client: {
      async request(request) {
        requests.push(request)
        return { data: response }
      },
    },
    getStore: () => ({ mobile: '51999999999' }),
    protocol,
    triggerOnly: () => { triggerCount += 1 },
    wait: (callback) => { queueMicrotask(callback); return 1 },
    clear() {},
  })
  return { bridge, requests, service, statuses, get triggerCount() { return triggerCount } }
}

test('uploads the five successful collection payloads through the configured protocol', async () => {
  const harness = createService()
  const result = await harness.service.triggerUpload({ operationId: 'apply-1', onStatus: (status) => harness.statuses.push(status) })

  assert.equal(harness.triggerCount, 1)
  assert.deepEqual(harness.statuses, ['collecting', 'uploading'])
  assert.deepEqual(result, { operationId: 'apply-1', status: 'success' })
  assert.equal(harness.requests.length, 1)
  const request = harness.requests[0]
  assert.equal(request.path, protocol.path)
  assert.equal(request.protocolId, protocol.protocolId)
  assert.deepEqual(request.headers, { 'Content-Encoding': 'gzip', 'Content-Type': 'application/json' })
  assert.deepEqual(JSON.parse(ungzip(request.data, { to: 'string' })), {
    app: [{ id: 'app' }],
    sms: [{ id: 'sms' }],
    callLog: [{ id: 'callLog' }],
    device: { id: 'device' },
    base: { id: 'base' },
    metadata: { full: true },
    identity: { mobile: '51999999999' },
  })
})

test('polls only an in-progress collection again before uploading', async () => {
  const harness = createService({ outcomes: { app: ['IN_PROGRESS', 'SUCCESS'] } })
  const result = await harness.service.triggerUpload({ operationId: 'apply-2' })

  assert.equal(result.status, 'success')
  assert.equal(harness.bridge.calls.filter((name) => name === 'app').length, 2)
  assert.equal(harness.bridge.calls.length, 6)
  assert.equal(harness.requests.length, 1)
})

test('does not upload when a collection returns a non-success terminal status', async () => {
  const harness = createService({ outcomes: { sms: ['ERR_FETCH_FAILED'] } })
  const result = await harness.service.triggerUpload({ operationId: 'apply-3' })

  assert.equal(result.status, 'collect_failed')
  assert.equal(harness.requests.length, 0)
})

test('maps a non-200 configured response code to upload failure', async () => {
  const harness = createService({ response: { result: { code: 500 } } })
  const result = await harness.service.triggerUpload({ operationId: 'apply-4' })

  assert.equal(result.status, 'upload_failed')
  assert.equal(harness.requests.length, 1)
})

test('returns unavailable without an authorized global mobile value', async () => {
  const service = createTriggerUploadService({
    bridge: createBridge(),
    client: { request: async () => assert.fail('request must not run') },
    getStore: () => ({ mobile: null }),
    protocol,
  })

  const result = await service.triggerUpload({ operationId: 'apply-5' })
  assert.deepEqual(result, { operationId: 'apply-5', status: 'unavailable', errorCode: 'MOBILE_UNAVAILABLE' })
})
