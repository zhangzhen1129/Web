const BRIDGE_OBJECT = 'plahub'
const CALLBACK_SCOPE = 'perCall'

const CAPABILITIES = Object.freeze({
  appListTrigger: Object.freeze({
    action: 'app_list_fetch_trigger',
    callbackPrefix: '__dineroProAppListTriggerReply',
    method: 'triggerAppListFetch',
    terminalStatuses: new Set(['SUCCESS', 'ERR_IN_PROGRESS', 'ERR_TIMEOUT', 'ERR_FETCH_FAILED', 'ERR_NO_RECORDS']),
  }),
  appListQuery: Object.freeze({
    action: 'app_list_fetch_result',
    callbackPrefix: '__dineroProAppListQueryReply',
    method: 'queryAppListFetchResult',
    terminalStatuses: new Set(['SUCCESS', 'ERR_NOT_TRIGGERED', 'ERR_CACHE_EXPIRED', 'ERR_FETCH_FAILED', 'ERR_NO_RECORDS']),
  }),
  callLogTrigger: Object.freeze({
    action: 'call_log_fetch_trigger',
    callbackPrefix: '__dineroProCallLogTriggerReply',
    method: 'triggerCallLogFetch',
    terminalStatuses: new Set(['SUCCESS', 'ERR_IN_PROGRESS', 'ERR_PERMISSION_DENIED', 'ERR_TIMEOUT', 'ERR_FETCH_FAILED', 'ERR_NO_RECORDS']),
  }),
  callLogQuery: Object.freeze({
    action: 'call_log_fetch_result',
    callbackPrefix: '__dineroProCallLogQueryReply',
    method: 'queryCallLogFetchResult',
    terminalStatuses: new Set(['SUCCESS', 'ERR_NOT_TRIGGERED', 'ERR_CACHE_EXPIRED', 'ERR_FETCH_FAILED', 'ERR_NO_RECORDS']),
  }),
  deviceBase: Object.freeze({
    action: 'pla_fetch_device_base',
    callbackPrefix: '__dineroProDeviceBaseReply',
    method: 'fetchDeviceBase',
    terminalStatuses: new Set(['SUCCESS', 'ERR_IN_PROGRESS', 'ERR_TIMEOUT', 'ERR_FETCH_FAILED']),
  }),
  deviceInfo: Object.freeze({
    action: 'pla_fetch_device_info',
    callbackPrefix: '__dineroProDeviceInfoReply',
    method: 'fetchDeviceInfo',
    terminalStatuses: new Set(['SUCCESS', 'ERR_IN_PROGRESS', 'ERR_TIMEOUT', 'ERR_FETCH_FAILED']),
  }),
  smsTrigger: Object.freeze({
    action: 'sms_fetch_trigger',
    callbackPrefix: '__dineroProSmsTriggerReply',
    method: 'triggerSmsFetch',
    terminalStatuses: new Set(['SUCCESS', 'ERR_IN_PROGRESS', 'ERR_PERMISSION_DENIED', 'ERR_TIMEOUT', 'ERR_FETCH_FAILED', 'ERR_NO_RECORDS']),
  }),
  smsQuery: Object.freeze({
    action: 'sms_fetch_result',
    callbackPrefix: '__dineroProSmsQueryReply',
    method: 'querySmsFetchResult',
    terminalStatuses: new Set(['SUCCESS', 'ERR_NOT_TRIGGERED', 'ERR_CACHE_EXPIRED', 'ERR_FETCH_FAILED', 'ERR_NO_RECORDS']),
  }),
})

let sequence = 0
const registry = new Map()

function createId(prefix) {
  sequence += 1
  return `h5-${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`
}

function reportDiagnostic(code, capability) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent('dinero-pro:bridge-diagnostic', {
      detail: { code, bridge: BRIDGE_OBJECT, capability },
    }))
  } catch {
    // Diagnostics must not expose collection data or interrupt Bridge handling.
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasValidDocumentedDataTypes(reply) {
  if (reply.recordCount !== undefined && (!Number.isInteger(reply.recordCount) || reply.recordCount < 0)) return false
  if (reply.templateResult !== undefined && !isObject(reply.templateResult)) return false
  if (reply.deviceBaseData !== undefined && !isObject(reply.deviceBaseData)) return false
  return reply.skipKeywordFilter === undefined
    || reply.skipKeywordFilter === null
    || typeof reply.skipKeywordFilter === 'boolean'
}

function cleanup(record) {
  registry.delete(record.registryKey)
  if (typeof window === 'undefined') return
  try {
    if (window[record.callbackName] === record.callback) delete window[record.callbackName]
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_CLEANUP_FAILED', record.capability.method)
  }
}

function isAcceptedResponse(response, capability, requestId) {
  return isObject(response)
    && response.action === capability.action
    && response.requestId === requestId
    && response.status === 'accepted'
    && typeof response.message === 'string'
}

function isValidReply(reply, record) {
  return isObject(reply)
    && reply.action === record.capability.action
    && reply.requestId === record.requestId
    && typeof reply.status === 'string'
    && typeof reply.message === 'string'
    && hasValidDocumentedDataTypes(reply)
}

function registerCallback(record) {
  if (typeof window === 'undefined') return false
  try {
    if (typeof window[record.callbackName] !== 'undefined') {
      reportDiagnostic('BRIDGE_CALLBACK_NAME_CONFLICT', record.capability.method)
      return false
    }
    window[record.callbackName] = record.callback
    return true
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_REGISTRATION_FAILED', record.capability.method)
    return false
  }
}

function invokeCapability(capability, extraPayload, consumer = () => {}) {
  if (typeof consumer !== 'function') {
    reportDiagnostic('BRIDGE_CALLBACK_INVALID_CONSUMER', capability.method)
    return null
  }

  const bridge = typeof window === 'undefined' ? undefined : window[BRIDGE_OBJECT]
  if (!bridge || typeof bridge[capability.method] !== 'function') {
    reportDiagnostic('BRIDGE_METHOD_UNAVAILABLE', capability.method)
    return null
  }

  const registryKey = createId(capability.method)
  const requestId = createId(`${capability.method}-request`)
  const callbackName = `${capability.callbackPrefix}_${sequence.toString(36)}`
  const record = {
    callback: null,
    callbackName,
    callbackScope: CALLBACK_SCOPE,
    capability,
    completed: false,
    consumer,
    registryKey,
    requestId,
    status: 'pending',
  }

  record.callback = (reply) => {
    if (!registry.has(registryKey) || record.completed) {
      reportDiagnostic('BRIDGE_CALLBACK_DUPLICATE', capability.method)
      return
    }
    if (!isValidReply(reply, record)) {
      if (isObject(reply) && reply.requestId === requestId) cleanup(record)
      reportDiagnostic('BRIDGE_CALLBACK_INVALID_PAYLOAD', capability.method)
      return
    }

    record.status = reply.status
    if (!capability.terminalStatuses.has(reply.status)) return

    record.completed = true
    cleanup(record)
    try {
      consumer(reply)
    } catch {
      reportDiagnostic('BRIDGE_CALLBACK_CONSUMER_FAILED', capability.method)
    }
  }

  if (!registerCallback(record)) return null
  registry.set(registryKey, record)
  const payload = JSON.stringify({ requestId, replyHandler: `window.${callbackName}`, ...extraPayload })

  try {
    const synchronousResult = JSON.parse(bridge[capability.method](payload))
    if (!isAcceptedResponse(synchronousResult, capability, requestId)) {
      cleanup(record)
      reportDiagnostic('BRIDGE_REQUEST_NOT_ACCEPTED', capability.method)
      return null
    }
  } catch {
    cleanup(record)
    reportDiagnostic('BRIDGE_CALL_FAILED', capability.method)
    return null
  }
  return requestId
}

export function triggerNativeAppList(consumer = () => {}) { return invokeCapability(CAPABILITIES.appListTrigger, {}, consumer) }
export function queryNativeAppListFetchResult(consumer = () => {}) { return invokeCapability(CAPABILITIES.appListQuery, {}, consumer) }
export function triggerNativeCallFetch(consumer = () => {}) { return invokeCapability(CAPABILITIES.callLogTrigger, {}, consumer) }
export function queryNativeCallFetchResult(consumer = () => {}) { return invokeCapability(CAPABILITIES.callLogQuery, {}, consumer) }
export function queryNativeDevBaseFetchResult(consumer = () => {}) { return invokeCapability(CAPABILITIES.deviceBase, {}, consumer) }
export function queryNativeDeviceFetchResult(consumer = () => {}) { return invokeCapability(CAPABILITIES.deviceInfo, {}, consumer) }
export function queryNativeSmsFetchResult(consumer = () => {}) { return invokeCapability(CAPABILITIES.smsQuery, {}, consumer) }

export function triggerNativeSmsFetch(skipKeywordFilter, consumer = () => {}) {
  if (typeof skipKeywordFilter !== 'boolean') {
    reportDiagnostic('BRIDGE_INVALID_SMS_FILTER', CAPABILITIES.smsTrigger.method)
    return null
  }
  return invokeCapability(CAPABILITIES.smsTrigger, { skipKeywordFilter }, consumer)
}

export function getNativeDataCollectionRegistrySize() { return registry.size }

export const nativeDataCollectionBridge = Object.freeze({
  queryNativeAppListFetchResult,
  queryNativeCallFetchResult,
  queryNativeDevBaseFetchResult,
  queryNativeDeviceFetchResult,
  queryNativeSmsFetchResult,
  triggerNativeAppList,
  triggerNativeCallFetch,
  triggerNativeSmsFetch,
})
