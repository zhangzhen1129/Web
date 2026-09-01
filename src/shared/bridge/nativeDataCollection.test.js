import assert from 'node:assert/strict'
import test from 'node:test'
import {
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
    window[request.replyHandler.replace('window.', '')]({ action, requestId: request.requestId, status: 'SUCCESS', message: 'done' })
  }
  assert.equal(getNativeDataCollectionRegistrySize(), 0)
})

test('retains documented in-progress notifications and cleans the matching terminal callback once', () => {
  const calls = installBridge()
  const results = []
  const requestId = triggerNativeAppList((reply) => results.push(reply))
  const request = calls[0].request
  const callback = window[request.replyHandler.replace('window.', '')]
  callback({ action: 'app_list_fetch_trigger', requestId, status: 'IN_PROGRESS', message: 'working' })
  assert.equal(getNativeDataCollectionRegistrySize(), 1)
  assert.deepEqual(results, [])
  const terminalReply = { action: 'app_list_fetch_trigger', requestId, status: 'SUCCESS', message: 'done', recordCount: 0, templateResult: {} }
  callback(terminalReply)
  callback(terminalReply)
  assert.deepEqual(results, [terminalReply])
  assert.equal(getNativeDataCollectionRegistrySize(), 0)
  assert.equal(typeof window[request.replyHandler.replace('window.', '')], 'undefined')
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
  window[request.replyHandler.replace('window.', '')]({ action: 'sms_fetch_result', requestId, status: 'SUCCESS', message: 'done', recordCount: -1 })
  assert.equal(getNativeDataCollectionRegistrySize(), 0)
})
