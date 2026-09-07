import {
  BRIDGE_FAILURE_CODES,
  deliverBridgeFailure,
  normalizeFailureOptions,
} from './bridgeFailure.js'
import { logNativeBridgeCall } from './nativeCallLog.js'

const BRIDGE_OBJECT = 'plahub'
const CALLBACK_SCOPE = 'perCall'

const CAPABILITIES = Object.freeze({
  appListTrigger: Object.freeze({
    action: 'app_list_fetch_trigger',
    callbackShape: 'records',
    callbackPrefix: '__dineroProAppListTriggerReply',
    method: 'triggerAppListFetch',
    progressStatuses: new Set(),
    terminalStatuses: new Set(['SUCCESS', 'ERR_IN_PROGRESS', 'ERR_TIMEOUT', 'ERR_FETCH_FAILED', 'ERR_NO_RECORDS']),
  }),
  appListQuery: Object.freeze({
    action: 'app_list_fetch_result',
    callbackShape: 'records',
    callbackPrefix: '__dineroProAppListQueryReply',
    method: 'queryAppListFetchResult',
    progressStatuses: new Set(['IN_PROGRESS']),
    terminalStatuses: new Set(['SUCCESS', 'ERR_NOT_TRIGGERED', 'ERR_CACHE_EXPIRED', 'ERR_FETCH_FAILED', 'ERR_NO_RECORDS']),
  }),
  callLogTrigger: Object.freeze({
    action: 'call_log_fetch_trigger',
    callbackShape: 'records',
    callbackPrefix: '__dineroProCallLogTriggerReply',
    method: 'triggerCallLogFetch',
    progressStatuses: new Set(),
    terminalStatuses: new Set(['SUCCESS', 'ERR_IN_PROGRESS', 'ERR_PERMISSION_DENIED', 'ERR_TIMEOUT', 'ERR_FETCH_FAILED', 'ERR_NO_RECORDS']),
  }),
  callLogQuery: Object.freeze({
    action: 'call_log_fetch_result',
    callbackShape: 'records',
    callbackPrefix: '__dineroProCallLogQueryReply',
    method: 'queryCallLogFetchResult',
    progressStatuses: new Set(['IN_PROGRESS']),
    terminalStatuses: new Set(['SUCCESS', 'ERR_NOT_TRIGGERED', 'ERR_CACHE_EXPIRED', 'ERR_FETCH_FAILED', 'ERR_NO_RECORDS']),
  }),
  deviceBase: Object.freeze({
    action: 'pla_fetch_device_base',
    callbackShape: 'deviceBase',
    callbackPrefix: '__dineroProDeviceBaseReply',
    method: 'fetchDeviceBase',
    progressStatuses: new Set(['IN_PROGRESS']),
    terminalStatuses: new Set(['SUCCESS', 'ERR_TIMEOUT', 'ERR_FETCH_FAILED']),
  }),
  deviceInfo: Object.freeze({
    action: 'pla_fetch_device_info',
    callbackShape: 'deviceInfo',
    callbackPrefix: '__dineroProDeviceInfoReply',
    method: 'fetchDeviceInfo',
    progressStatuses: new Set(['IN_PROGRESS']),
    terminalStatuses: new Set(['SUCCESS', 'ERR_TIMEOUT', 'ERR_FETCH_FAILED']),
  }),
  smsTrigger: Object.freeze({
    action: 'sms_fetch_trigger',
    callbackShape: 'sms',
    callbackPrefix: '__dineroProSmsTriggerReply',
    method: 'triggerSmsFetch',
    progressStatuses: new Set(),
    terminalStatuses: new Set(['SUCCESS', 'ERR_IN_PROGRESS', 'ERR_PERMISSION_DENIED', 'ERR_TIMEOUT', 'ERR_FETCH_FAILED', 'ERR_NO_RECORDS']),
  }),
  smsQuery: Object.freeze({
    action: 'sms_fetch_result',
    callbackShape: 'sms',
    callbackPrefix: '__dineroProSmsQueryReply',
    method: 'querySmsFetchResult',
    progressStatuses: new Set(['IN_PROGRESS']),
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

function hasValidDocumentedDataTypes(reply, capability) {
  if (capability.callbackShape === 'deviceBase') return isObject(reply.deviceBaseData)
  if (capability.callbackShape === 'deviceInfo') {
    return isObject(reply.zzvvcr)
      && isObject(reply.zzvvcr.vb45fW4q4EMiK)
      && typeof reply.zzvvcr.vb45fW4q4EMiK.xcmgx7mBm === 'string'
  }

  const hasRecords = isObject(reply.templateResult)
    && Number.isInteger(reply.recordCount)
    && reply.recordCount >= 0
  if (!hasRecords) return false
  return capability.callbackShape !== 'sms'
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

function notifyFailure(record, code) {
  record.completed = true
  cleanup(record)
  if (record.consumerCanceled || !record.onFailure) return
  try {
    record.onFailure({ capability: record.capability.method, code })
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_FAILURE_CONSUMER_FAILED', record.capability.method)
  }
}

function notifyImmediateFailure(options, code, capability) {
  const failureOptions = normalizeFailureOptions(options)
  deliverBridgeFailure(failureOptions.onFailure, code, capability.method, (diagnosticCode) => {
    reportDiagnostic(diagnosticCode, capability.method)
  })
}

function notifyProgress(record, reply) {
  record.completed = true
  cleanup(record)
  if (record.consumerCanceled || !record.onProgress) return
  try {
    record.onProgress(reply)
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_PROGRESS_FAILED', record.capability.method)
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
    && hasValidDocumentedDataTypes(reply, record.capability)
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

function invokeCapability(capability, extraPayload, consumer = () => {}, options = {}) {
  const failureOptions = normalizeFailureOptions(options)
  const progressValid = typeof options?.onProgress === 'undefined' || typeof options.onProgress === 'function'
  if (!failureOptions.valid || !progressValid) {
    reportDiagnostic('BRIDGE_INVALID_OPTIONS', capability.method)
    notifyImmediateFailure(options, BRIDGE_FAILURE_CODES.invalidArgument, capability)
    return null
  }
  if (typeof consumer !== 'function') {
    reportDiagnostic('BRIDGE_CALLBACK_INVALID_CONSUMER', capability.method)
    notifyImmediateFailure(options, BRIDGE_FAILURE_CODES.invalidArgument, capability)
    return null
  }

  const bridge = typeof window === 'undefined' ? undefined : window[BRIDGE_OBJECT]
  if (!bridge || typeof bridge[capability.method] !== 'function') {
    reportDiagnostic('BRIDGE_METHOD_UNAVAILABLE', capability.method)
    notifyImmediateFailure(options, BRIDGE_FAILURE_CODES.unavailable, capability)
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
    onProgress: typeof options.onProgress === 'function' ? options.onProgress : null,
    onFailure: failureOptions.onFailure,
    consumerCanceled: false,
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
      if (isObject(reply) && reply.requestId === requestId) {
        notifyFailure(record, BRIDGE_FAILURE_CODES.invalidCallback)
      }
      reportDiagnostic('BRIDGE_CALLBACK_INVALID_PAYLOAD', capability.method)
      return
    }

    record.status = reply.status
    if (capability.progressStatuses.has(reply.status)) {
      notifyProgress(record, reply)
      return
    }
    if (!capability.terminalStatuses.has(reply.status)) {
      notifyFailure(record, BRIDGE_FAILURE_CODES.invalidCallback)
      reportDiagnostic('BRIDGE_CALLBACK_UNEXPECTED_STATUS', capability.method)
      return
    }

    record.completed = true
    cleanup(record)
    try {
      if (!record.consumerCanceled) record.consumer(reply)
    } catch {
      reportDiagnostic('BRIDGE_CALLBACK_CONSUMER_FAILED', capability.method)
    }
  }

  if (!registerCallback(record)) {
    notifyImmediateFailure(options, BRIDGE_FAILURE_CODES.callFailed, capability)
    return null
  }
  registry.set(registryKey, record)
  let payload
  try {
    payload = JSON.stringify({ requestId, replyHandler: `window.${callbackName}`, ...extraPayload })
  } catch {
    notifyFailure(record, BRIDGE_FAILURE_CODES.callFailed)
    reportDiagnostic('BRIDGE_CALL_FAILED', capability.method)
    return null
  }

  try {
    logNativeBridgeCall(capability.method)
    const synchronousResult = JSON.parse(bridge[capability.method](payload))
    const responseShapeValid = isObject(synchronousResult)
      && synchronousResult.action === capability.action
      && synchronousResult.requestId === requestId
      && typeof synchronousResult.status === 'string'
      && typeof synchronousResult.message === 'string'
    if (!responseShapeValid) {
      notifyFailure(record, BRIDGE_FAILURE_CODES.callFailed)
      reportDiagnostic('BRIDGE_CALL_FAILED', capability.method)
      return null
    }
    if (!isAcceptedResponse(synchronousResult, capability, requestId)) {
      notifyFailure(record, BRIDGE_FAILURE_CODES.notAccepted)
      reportDiagnostic('BRIDGE_REQUEST_NOT_ACCEPTED', capability.method)
      return null
    }
  } catch {
    notifyFailure(record, BRIDGE_FAILURE_CODES.callFailed)
    reportDiagnostic('BRIDGE_CALL_FAILED', capability.method)
    return null
  }
  return requestId
}

export function triggerNativeAppList(consumer = () => {}, options) { return invokeCapability(CAPABILITIES.appListTrigger, {}, consumer, options) }
export function queryNativeAppListFetchResult(consumer = () => {}, options) { return invokeCapability(CAPABILITIES.appListQuery, {}, consumer, options) }
export function triggerNativeCallFetch(consumer = () => {}, options) { return invokeCapability(CAPABILITIES.callLogTrigger, {}, consumer, options) }
export function queryNativeCallFetchResult(consumer = () => {}, options) { return invokeCapability(CAPABILITIES.callLogQuery, {}, consumer, options) }
export function queryNativeDevBaseFetchResult(consumer = () => {}, options) { return invokeCapability(CAPABILITIES.deviceBase, {}, consumer, options) }
export function queryNativeDeviceFetchResult(consumer = () => {}, options) { return invokeCapability(CAPABILITIES.deviceInfo, {}, consumer, options) }
export function queryNativeSmsFetchResult(consumer = () => {}, options) { return invokeCapability(CAPABILITIES.smsQuery, {}, consumer, options) }

export function triggerNativeSmsFetch(skipKeywordFilter, consumer = () => {}, options) {
  if (typeof skipKeywordFilter !== 'boolean') {
    reportDiagnostic('BRIDGE_INVALID_SMS_FILTER', CAPABILITIES.smsTrigger.method)
    notifyImmediateFailure(options, BRIDGE_FAILURE_CODES.invalidArgument, CAPABILITIES.smsTrigger)
    return null
  }
  return invokeCapability(CAPABILITIES.smsTrigger, { skipKeywordFilter }, consumer, options)
}

export function cancelNativeDataCollectionConsumer(requestId) {
  if (typeof requestId !== 'string' || requestId.length === 0) return false
  for (const record of registry.values()) {
    if (record.requestId !== requestId || record.completed) continue
    record.consumerCanceled = true
    record.consumer = () => {}
    record.onProgress = null
    record.onFailure = null
    return true
  }
  return false
}

export function getNativeDataCollectionRegistrySize() { return registry.size }

export const nativeDataCollectionBridge = Object.freeze({
  queryNativeAppListFetchResult,
  queryNativeCallFetchResult,
  queryNativeDevBaseFetchResult,
  queryNativeDeviceFetchResult,
  queryNativeSmsFetchResult,
  cancelNativeDataCollectionConsumer,
  triggerNativeAppList,
  triggerNativeCallFetch,
  triggerNativeSmsFetch,
})
