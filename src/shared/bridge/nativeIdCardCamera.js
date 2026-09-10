import {
  BRIDGE_FAILURE_CODES,
  deliverBridgeFailure,
  normalizeFailureOptions,
} from './bridgeFailure.js'
import { logNativeBridgeCall } from './nativeCallLog.js'

const BRIDGE_OBJECT = 'plahub'
const METHOD = 'openIdCardCamera'
const ACTION = 'openIdCardCamera'
const CALLBACK_SCOPE = 'perCall'
const CALLBACK_PREFIX = '__dineroProIdCardCameraReply_'
const TERMINAL_STATUSES = new Set([
  'success',
  'cancel',
  'permission_denied',
  'error',
])

let sequence = 0
const registry = new Map()

function createId(prefix) {
  sequence += 1
  return `h5-${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`
}

function reportDiagnostic(code) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent('dinero-pro:bridge-diagnostic', {
      detail: { code, bridge: BRIDGE_OBJECT, capability: 'id-card-camera' },
    }))
  } catch {
    // Diagnostics must not affect camera handling or expose image data.
  }
}

function cleanup(record) {
  registry.delete(record.registryKey)
  if (typeof window === 'undefined') return
  try {
    if (window[record.callbackName] === record.callback) delete window[record.callbackName]
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_CLEANUP_FAILED')
  }
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

function isInteger(value) {
  return Number.isInteger(value)
}

function isValidReply(reply, requestId) {
  return reply !== null
    && typeof reply === 'object'
    && !Array.isArray(reply)
    && reply.action === ACTION
    && reply.requestId === requestId
    && TERMINAL_STATUSES.has(reply.status)
    && typeof reply.message === 'string'
    && typeof reply.imageBase64 === 'string'
    && typeof reply.mimeType === 'string'
    && isInteger(reply.originalBytes)
    && isInteger(reply.compressedBytes)
    && isInteger(reply.sourceWidth)
    && isInteger(reply.sourceHeight)
    && isInteger(reply.exifRotation)
    && isInteger(reply.outputWidth)
    && isInteger(reply.outputHeight)
}

/** Open the documented Android ID card camera and deliver its terminal result. */
export function openIdCardCameraNative(consumer = () => {}, options) {
  const failureOptions = normalizeFailureOptions(options)
  if (!failureOptions.valid) {
    reportDiagnostic('BRIDGE_INVALID_OPTIONS')
    return null
  }
  if (typeof consumer !== 'function') {
    reportDiagnostic('BRIDGE_CALLBACK_INVALID_CONSUMER')
    notifyImmediateFailure(failureOptions.onFailure, BRIDGE_FAILURE_CODES.invalidArgument)
    return null
  }

  const bridge = typeof window === 'undefined' ? undefined : window[BRIDGE_OBJECT]
  if (!bridge || typeof bridge[METHOD] !== 'function') {
    reportDiagnostic('BRIDGE_METHOD_UNAVAILABLE')
    notifyImmediateFailure(failureOptions.onFailure, BRIDGE_FAILURE_CODES.unavailable)
    return null
  }

  const registryKey = createId('id-card-camera')
  const requestId = createId('id-card-camera-request')
  const callbackName = `${CALLBACK_PREFIX}${sequence.toString(36)}`
  const callbackPath = `window.${callbackName}`
  const record = {
    registryKey,
    requestId,
    callbackName,
    callbackScope: CALLBACK_SCOPE,
    completed: false,
    consumerCanceled: false,
    consumer,
    onFailure: failureOptions.onFailure,
    callback: null,
  }

  const callback = (reply) => {
    if (!registry.has(registryKey) || record.completed) {
      reportDiagnostic('BRIDGE_CALLBACK_DUPLICATE')
      return
    }
    if (
      !reply
      || typeof reply !== 'object'
      || Array.isArray(reply)
      || reply.requestId !== requestId
    ) {
      reportDiagnostic('BRIDGE_CALLBACK_UNKNOWN_REQUEST')
      return
    }
    if (!isValidReply(reply, requestId)) {
      notifyFailure(record, BRIDGE_FAILURE_CODES.invalidCallback)
      reportDiagnostic('BRIDGE_CALLBACK_INVALID_PAYLOAD')
      return
    }

    record.completed = true
    cleanup(record)
    if (record.consumerCanceled) return
    try {
      record.consumer(reply)
    } catch {
      reportDiagnostic('BRIDGE_CALLBACK_CONSUMER_FAILED')
    }
  }
  record.callback = callback

  try {
    if (typeof window[callbackName] !== 'undefined') {
      reportDiagnostic('BRIDGE_CALLBACK_NAME_CONFLICT')
      notifyImmediateFailure(failureOptions.onFailure, BRIDGE_FAILURE_CODES.callFailed)
      return null
    }
    window[callbackName] = callback
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_REGISTRATION_FAILED')
    notifyImmediateFailure(failureOptions.onFailure, BRIDGE_FAILURE_CODES.callFailed)
    return null
  }

  registry.set(registryKey, record)
  let payload
  try {
    payload = JSON.stringify({ requestId, replyHandler: callbackPath })
  } catch {
    notifyFailure(record, BRIDGE_FAILURE_CODES.callFailed)
    reportDiagnostic('BRIDGE_CALL_FAILED')
    return null
  }

  try {
    logNativeBridgeCall(METHOD)
    const synchronousResult = JSON.parse(bridge[METHOD](payload))
    const failureCode = isAcceptedResponse(synchronousResult, requestId)
    if (failureCode) {
      notifyFailure(record, failureCode)
      reportDiagnostic(failureCode === BRIDGE_FAILURE_CODES.notAccepted ? 'BRIDGE_REQUEST_NOT_ACCEPTED' : 'BRIDGE_CALL_FAILED')
      return null
    }
  } catch {
    notifyFailure(record, BRIDGE_FAILURE_CODES.callFailed)
    reportDiagnostic('BRIDGE_CALL_FAILED')
    return null
  }

  return requestId
}

export function cancelNativeIdCardCameraConsumer(requestId) {
  if (typeof requestId !== 'string' || requestId.length === 0) return false
  const record = [...registry.values()].find((entry) => entry.requestId === requestId)
  if (!record || record.completed || record.consumerCanceled) return false
  record.consumerCanceled = true
  record.consumer = () => {}
  record.onFailure = null
  return true
}

export function getNativeIdCardCameraRegistrySize() {
  return registry.size
}

export const nativeIdCardCameraBridge = Object.freeze({
  cancelNativeIdCardCameraConsumer,
  openIdCardCameraNative,
})
