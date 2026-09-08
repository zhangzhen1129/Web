import {
  BRIDGE_FAILURE_CODES,
  deliverBridgeFailure,
  normalizeFailureOptions,
} from './bridgeFailure.js'
import { logNativeBridgeCall } from './nativeCallLog.js'

const BRIDGE_OBJECT = 'plahub'
const METHOD = 'setPhysicalBackInterceptConfig'
const CALLBACK_NAME = '__dineroProPhysicalBackInterceptReply'
const CALLBACK_SCOPE = 'shared'
const CALLBACK_ACTION = 'physicalBackIntercepted'

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
      detail: { code, bridge: BRIDGE_OBJECT, capability: 'physical-back-intercept' },
    }))
  } catch {
    // Diagnostics must never affect physical-back handling.
  }
}

function clearCallback() {
  if (typeof window === 'undefined') return
  try {
    if (window[CALLBACK_NAME] === handleIntercept) delete window[CALLBACK_NAME]
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_CLEANUP_FAILED')
  }
}

function clearActiveRecord() {
  activeRecord = null
  clearCallback()
}

function notifyFailure(onFailure, code) {
  deliverBridgeFailure(onFailure, code, METHOD, reportDiagnostic)
}

function isValidConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) || typeof config.enabled !== 'boolean') return false
  const keys = Object.keys(config)
  if (keys.some((key) => key !== 'enabled' && key !== 'onIntercept')) return false
  if (config.enabled) return typeof config.onIntercept === 'function'
  return typeof config.onIntercept === 'undefined'
}

function isAcceptedResponse(response, requestId) {
  if (
    !response
    || typeof response !== 'object'
    || Array.isArray(response)
    || response.action !== METHOD
    || response.requestId !== requestId
    || typeof response.message !== 'string'
    || typeof response.status !== 'string'
  ) return BRIDGE_FAILURE_CODES.callFailed
  return response.status === 'success' ? null : BRIDGE_FAILURE_CODES.notAccepted
}

function isValidInterceptEvent(reply, requestId) {
  return reply !== null
    && typeof reply === 'object'
    && !Array.isArray(reply)
    && reply.action === CALLBACK_ACTION
    && reply.requestId === requestId
    && reply.status === 'intercepted'
    && typeof reply.message === 'string'
}

function handleIntercept(reply) {
  const record = activeRecord
  if (!record || reply?.requestId !== record.requestId) {
    reportDiagnostic('BRIDGE_CALLBACK_UNKNOWN_REQUEST')
    return
  }
  if (!isValidInterceptEvent(reply, record.requestId)) {
    reportDiagnostic('BRIDGE_CALLBACK_INVALID_PAYLOAD')
    if (!record.callbackFailureDelivered) {
      record.callbackFailureDelivered = true
      notifyFailure(record.onFailure, BRIDGE_FAILURE_CODES.invalidCallback)
    }
    return
  }
  try {
    record.onIntercept(reply)
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_CONSUMER_FAILED')
  }
}

function ensureCallback() {
  if (typeof window === 'undefined') return false
  try {
    if (typeof window[CALLBACK_NAME] === 'function' && window[CALLBACK_NAME] !== handleIntercept) {
      reportDiagnostic('BRIDGE_CALLBACK_NAME_CONFLICT')
      return false
    }
    if (typeof window[CALLBACK_NAME] !== 'function') window[CALLBACK_NAME] = handleIntercept
    return window[CALLBACK_NAME] === handleIntercept
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_REGISTRATION_FAILED')
    return false
  }
}

/** Configure the documented Android physical-back interception capability. */
export function setPhysicalBackIntercept(config, options) {
  const failureOptions = normalizeFailureOptions(options)
  if (!failureOptions.valid || !isValidConfig(config)) {
    reportDiagnostic('BRIDGE_INVALID_OPTIONS')
    notifyFailure(failureOptions.onFailure, BRIDGE_FAILURE_CODES.invalidArgument)
    return null
  }

  if (config.enabled && activeRecord) {
    reportDiagnostic('BRIDGE_PHYSICAL_BACK_CONFIG_ACTIVE')
    notifyFailure(failureOptions.onFailure, BRIDGE_FAILURE_CODES.configActive)
    return null
  }

  const bridge = typeof window === 'undefined' ? undefined : window[BRIDGE_OBJECT]
  if (!bridge || typeof bridge[METHOD] !== 'function') {
    reportDiagnostic('BRIDGE_METHOD_UNAVAILABLE')
    notifyFailure(failureOptions.onFailure, BRIDGE_FAILURE_CODES.unavailable)
    return null
  }

  if (config.enabled && !ensureCallback()) {
    notifyFailure(failureOptions.onFailure, BRIDGE_FAILURE_CODES.callFailed)
    return null
  }

  const requestId = createId(config.enabled ? 'physical-back-enable' : 'physical-back-disable')
  let payload
  try {
    payload = JSON.stringify(config.enabled
      ? { requestId, enabled: true, callbackPath: `window.${CALLBACK_NAME}` }
      : { requestId, enabled: false })
  } catch {
    if (config.enabled) clearCallback()
    reportDiagnostic('BRIDGE_CALL_FAILED')
    notifyFailure(failureOptions.onFailure, BRIDGE_FAILURE_CODES.callFailed)
    return null
  }

  try {
    logNativeBridgeCall(METHOD)
    const response = JSON.parse(bridge[METHOD](payload))
    const failureCode = isAcceptedResponse(response, requestId)
    if (failureCode) {
      if (config.enabled) clearCallback()
      reportDiagnostic(failureCode === BRIDGE_FAILURE_CODES.notAccepted ? 'BRIDGE_REQUEST_NOT_ACCEPTED' : 'BRIDGE_CALL_FAILED')
      notifyFailure(failureOptions.onFailure, failureCode)
      return null
    }
  } catch {
    if (config.enabled) clearCallback()
    reportDiagnostic('BRIDGE_CALL_FAILED')
    notifyFailure(failureOptions.onFailure, BRIDGE_FAILURE_CODES.callFailed)
    return null
  }

  if (config.enabled) {
    activeRecord = {
      registryKey: createId('physical-back-intercept'),
      callbackName: `window.${CALLBACK_NAME}`,
      callbackScope: CALLBACK_SCOPE,
      requestId,
      onIntercept: config.onIntercept,
      onFailure: failureOptions.onFailure,
      callbackFailureDelivered: false,
    }
  } else {
    clearActiveRecord()
  }

  return requestId
}

export function getPhysicalBackInterceptRegistrySize() {
  return activeRecord ? 1 : 0
}

export const nativePhysicalBackInterceptBridge = Object.freeze({
  getPhysicalBackInterceptRegistrySize,
  setPhysicalBackIntercept,
})
