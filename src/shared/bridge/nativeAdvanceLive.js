import {
  BRIDGE_FAILURE_CODES,
  deliverBridgeFailure,
  normalizeFailureOptions,
} from './bridgeFailure.js'
import { logNativeBridgeCall } from './nativeCallLog.js'

const BRIDGE_OBJECT = 'plahub'
const METHOD = 'openAdvanceLivePage'
const ACTION = 'openAdvanceLivePage'
const CALLBACK_NAME = 'advanceCallBack'
const CALLBACK_SCOPE = 'shared'
const RESULT_TYPES = new Set([1, 2])

let sequence = 0
let activeRecord = null

function createId(prefix) {
  sequence += 1
  return `h5-${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`
}

function reportDiagnostic(code) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent('dinero-pro:bridge-diagnostic', {
      detail: { code, bridge: BRIDGE_OBJECT, capability: 'advance-live' },
    }))
  } catch {
    // Diagnostics must not affect the live-check flow or expose its URL.
  }
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false
  const values = parts.map(Number)
  if (values.some((value) => value < 0 || value > 255)) return true
  return values[0] === 10
    || values[0] === 127
    || (values[0] === 169 && values[1] === 254)
    || (values[0] === 172 && values[1] >= 16 && values[1] <= 31)
    || (values[0] === 192 && values[1] === 168)
    || values[0] === 0
}

function isTrustedAdvanceUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) return false
  if (/[\u0000-\u001F\u007F]/.test(value) || value.includes('\\')) return false
  try {
    const parsed = new URL(value)
    const hostname = parsed.hostname.toLowerCase()
    if (
      parsed.protocol !== 'https:'
      || parsed.username.length > 0
      || parsed.password.length > 0
      || hostname.length === 0
      || hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname === '[::1]'
      || hostname.startsWith('[fc')
      || hostname.startsWith('[fd')
      || hostname.startsWith('[fe80:')
      || isPrivateIpv4(hostname)
    ) return false
    return parsed.pathname.startsWith('/')
  } catch {
    return false
  }
}

function clearCallback() {
  if (typeof window === 'undefined') return
  try {
    if (window[CALLBACK_NAME] === handleAdvanceResult) delete window[CALLBACK_NAME]
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_CLEANUP_FAILED')
  }
}

function cleanup(record) {
  if (activeRecord?.registryKey === record.registryKey) activeRecord = null
  clearCallback()
}

function notifyFailure(record, code) {
  if (record.completed) return
  record.completed = true
  cleanup(record)
  if (record.consumerCanceled) return
  deliverBridgeFailure(record.onFailure, code, METHOD, reportDiagnostic)
}

function notifyImmediateFailure(onFailure, code) {
  deliverBridgeFailure(onFailure, code, METHOD, reportDiagnostic)
}

function isAcceptedResponse(response, requestId) {
  if (
    !response
    || typeof response !== 'object'
    || Array.isArray(response)
    || response.action !== ACTION
    || response.requestId !== requestId
    || typeof response.status !== 'string'
    || typeof response.message !== 'string'
  ) return BRIDGE_FAILURE_CODES.callFailed
  return response.status === 'accepted' ? null : BRIDGE_FAILURE_CODES.notAccepted
}

function parseResult(rawResult) {
  if (typeof rawResult !== 'string') return null
  try {
    const result = JSON.parse(rawResult)
    if (
      !result
      || typeof result !== 'object'
      || Array.isArray(result)
      || Object.keys(result).length !== 1
      || !Number.isInteger(result.type)
      || !RESULT_TYPES.has(result.type)
    ) return null
    return { type: result.type }
  } catch {
    return null
  }
}

function handleAdvanceResult(rawResult) {
  const record = activeRecord
  if (!record || record.completed) {
    reportDiagnostic('BRIDGE_CALLBACK_UNKNOWN_REQUEST')
    return
  }
  const result = parseResult(rawResult)
  if (!result) {
    notifyFailure(record, BRIDGE_FAILURE_CODES.invalidCallback)
    reportDiagnostic('BRIDGE_CALLBACK_INVALID_PAYLOAD')
    return
  }

  record.completed = true
  cleanup(record)
  if (record.consumerCanceled) return
  try {
    record.consumer(result)
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_CONSUMER_FAILED')
  }
}

function registerCallback() {
  if (typeof window === 'undefined') return false
  try {
    if (typeof window[CALLBACK_NAME] !== 'undefined') {
      reportDiagnostic('BRIDGE_CALLBACK_NAME_CONFLICT')
      return false
    }
    window[CALLBACK_NAME] = handleAdvanceResult
    return window[CALLBACK_NAME] === handleAdvanceResult
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_REGISTRATION_FAILED')
    return false
  }
}

/** Open the documented Advance live page and deliver its terminal result. */
export function openAdvanceLivePageNat(url, consumer = () => {}, options) {
  const failureOptions = normalizeFailureOptions(options)
  if (!failureOptions.valid || !isTrustedAdvanceUrl(url) || typeof consumer !== 'function') {
    reportDiagnostic('BRIDGE_INVALID_OPTIONS')
    notifyImmediateFailure(failureOptions.onFailure, BRIDGE_FAILURE_CODES.invalidArgument)
    return null
  }

  if (activeRecord) {
    reportDiagnostic('BRIDGE_ADVANCE_REQUEST_ACTIVE')
    notifyImmediateFailure(failureOptions.onFailure, BRIDGE_FAILURE_CODES.requestActive)
    return null
  }

  const bridge = typeof window === 'undefined' ? undefined : window[BRIDGE_OBJECT]
  if (!bridge || typeof bridge[METHOD] !== 'function') {
    reportDiagnostic('BRIDGE_METHOD_UNAVAILABLE')
    notifyImmediateFailure(failureOptions.onFailure, BRIDGE_FAILURE_CODES.unavailable)
    return null
  }

  if (!registerCallback()) {
    notifyImmediateFailure(failureOptions.onFailure, BRIDGE_FAILURE_CODES.callFailed)
    return null
  }

  const requestId = createId('advance-live-request')
  const record = {
    registryKey: createId('advance-live'),
    callbackName: `window.${CALLBACK_NAME}`,
    callbackScope: CALLBACK_SCOPE,
    requestId,
    completed: false,
    consumerCanceled: false,
    consumer,
    onFailure: failureOptions.onFailure,
  }
  activeRecord = record

  let payload
  try {
    payload = JSON.stringify({ requestId, url })
  } catch {
    notifyFailure(record, BRIDGE_FAILURE_CODES.callFailed)
    reportDiagnostic('BRIDGE_CALL_FAILED')
    return null
  }

  try {
    logNativeBridgeCall(METHOD)
    const response = JSON.parse(bridge[METHOD](payload))
    const failureCode = isAcceptedResponse(response, requestId)
    if (failureCode) {
      notifyFailure(record, failureCode)
      reportDiagnostic(failureCode === BRIDGE_FAILURE_CODES.notAccepted
        ? 'BRIDGE_REQUEST_NOT_ACCEPTED'
        : 'BRIDGE_CALL_FAILED')
      return null
    }
  } catch {
    notifyFailure(record, BRIDGE_FAILURE_CODES.callFailed)
    reportDiagnostic('BRIDGE_CALL_FAILED')
    return null
  }

  return requestId
}

export function cancelNativeAdvanceLiveConsumer(requestId) {
  const record = activeRecord
  if (
    typeof requestId !== 'string'
    || requestId.length === 0
    || !record
    || record.requestId !== requestId
    || record.completed
    || record.consumerCanceled
  ) return false
  record.consumerCanceled = true
  record.consumer = () => {}
  record.onFailure = null
  return true
}

export function getNativeAdvanceLiveRegistrySize() {
  return activeRecord ? 1 : 0
}

export const nativeAdvanceLiveBridge = Object.freeze({
  cancelNativeAdvanceLiveConsumer,
  getNativeAdvanceLiveRegistrySize,
  openAdvanceLivePageNat,
})
