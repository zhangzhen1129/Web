import assert from 'node:assert/strict'
import test from 'node:test'
import { createDataCollectionService } from './triggerOnly.js'

function createBridge() {
  const calls = []
  let requestSequence = 0
  return {
    calls,
    queryNativeAppListFetchResult() { calls.push({ name: 'queryAppListFetchResult' }) },
    queryNativeCallFetchResult() { calls.push({ name: 'queryCallLogFetchResult' }) },
    queryNativeDevBaseFetchResult() { calls.push({ name: 'fetchDeviceBase' }) },
    queryNativeDeviceFetchResult() { calls.push({ name: 'fetchDeviceInfo' }) },
    queryNativeSmsFetchResult() { calls.push({ name: 'querySmsFetchResult' }) },
    triggerNativeAppList(consumer, options) {
      calls.push({ consumer, name: 'triggerAppListFetch', options })
      return `app-${++requestSequence}`
    },
    triggerNativeCallFetch(consumer, options) {
      calls.push({ consumer, name: 'triggerCallLogFetch', options })
      return `call-${++requestSequence}`
    },
    triggerNativeSmsFetch(skipKeywordFilter, consumer, options) {
      calls.push({ consumer, name: 'triggerSmsFetch', options, skipKeywordFilter })
      return `sms-${++requestSequence}`
    },
  }
}

test('triggerOnly repeats the documented three triggers in order without querying or uploading', () => {
  const bridge = createBridge()
  const diagnostics = []
  const service = createDataCollectionService({ bridge, diagnostic: (event) => diagnostics.push(event) })

  assert.equal(service.triggerOnly(), undefined)
  assert.equal(service.triggerOnly(), undefined)

  assert.deepEqual(bridge.calls.map((call) => call.name), [
    'triggerAppListFetch',
    'triggerSmsFetch',
    'triggerCallLogFetch',
    'triggerAppListFetch',
    'triggerSmsFetch',
    'triggerCallLogFetch',
  ])
  assert.ok(bridge.calls.every((call) => !call.name.includes('query')))
  assert.ok(bridge.calls.every((call) => typeof call.consumer === 'function'))
  assert.ok(bridge.calls.every((call) => typeof call.options.onFailure === 'function'))
  assert.equal(bridge.calls[1].skipKeywordFilter, true)
  assert.equal(diagnostics.filter((event) => event.phase === 'started').length, 2)
  assert.equal(diagnostics.filter((event) => event.phase === 'accepted').length, 6)
})

test('triggerOnly records only safe failures for unavailable and missing Bridge methods while continuing the sequence', () => {
  const bridge = createBridge()
  const diagnostics = []
  bridge.triggerNativeAppList = (consumer, options) => {
    options.onFailure({ code: 'BRIDGE_UNAVAILABLE', rawPayload: 'sms-body' })
    return null
  }
  delete bridge.triggerNativeSmsFetch
  const service = createDataCollectionService({ bridge, diagnostic: (event) => diagnostics.push(event) })

  service.triggerOnly()

  assert.deepEqual(bridge.calls.map((call) => call.name), ['triggerCallLogFetch'])
  assert.deepEqual(diagnostics.filter((event) => event.phase === 'bridge_failure'), [
    { capability: 'trigger_only', code: 'BRIDGE_UNAVAILABLE', phase: 'bridge_failure', source: 'app_list' },
    { capability: 'trigger_only', code: 'BRIDGE_CALL_FAILED', phase: 'bridge_failure', source: 'sms' },
  ])
  assert.doesNotMatch(JSON.stringify(diagnostics), /sms-body/)
})

test('triggerOnly contains throwing Bridge methods and never forwards raw callback data', () => {
  const bridge = createBridge()
  const diagnostics = []
  bridge.triggerNativeSmsFetch = () => { throw new Error('sensitive callback content') }
  const service = createDataCollectionService({ bridge, diagnostic: (event) => diagnostics.push(event) })

  service.triggerOnly()

  assert.deepEqual(bridge.calls.map((call) => call.name), [
    'triggerAppListFetch',
    'triggerCallLogFetch',
  ])
  assert.deepEqual(diagnostics.filter((event) => event.phase === 'bridge_failure'), [
    { capability: 'trigger_only', code: 'BRIDGE_CALL_FAILED', phase: 'bridge_failure', source: 'sms' },
  ])
  assert.doesNotMatch(JSON.stringify(diagnostics), /sensitive callback content/)
})

test('triggerOnly uses a detached native callback without exposing its result', () => {
  const bridge = createBridge()
  const service = createDataCollectionService({ bridge, diagnostic: () => {} })

  service.triggerOnly()
  bridge.calls.forEach((call) => call.consumer({ records: ['private-value'], status: 'SUCCESS' }))

  assert.equal(bridge.calls.length, 3)
})

test('triggerOnly remains nonblocking when its diagnostic consumer fails', () => {
  const bridge = createBridge()
  const service = createDataCollectionService({
    bridge,
    diagnostic() { throw new Error('diagnostic unavailable') },
  })

  assert.doesNotThrow(() => service.triggerOnly())
  assert.deepEqual(bridge.calls.map((call) => call.name), [
    'triggerAppListFetch',
    'triggerSmsFetch',
    'triggerCallLogFetch',
  ])
})

test('public service exposes the upload boundary', () => {
  const service = createDataCollectionService({ bridge: createBridge(), diagnostic: () => {} })

  assert.equal(typeof service.triggerUpload, 'function')
})
