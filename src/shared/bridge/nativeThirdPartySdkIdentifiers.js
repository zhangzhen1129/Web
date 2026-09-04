import {
  BRIDGE_FAILURE_CODES,
  deliverBridgeFailure,
  normalizeFailureOptions,
} from './bridgeFailure.js'

const BRIDGE_OBJECT = 'plahub'
const METHOD = 'fetchThirdPartySdkIdentifiers'
const CALLBACK_NAME = '__dineroProThirdPartySdkIdentifiersReply'
const CALLBACK_SCOPE = 'shared'

let sequence = 0
const registry = new Map()

const ANDROID_IDENTIFIER_FIELD_MAP = Object.freeze({
  appsFlyerUid: 'afId',
  firebaseAppInstanceId: 'fbId',
  googleAdvertisingId: 'gaId',
})

const TERMINAL_STATUSES = new Set(['success', 'partial_success', 'error'])

function createId(prefix) {
  sequence += 1
  return `h5-${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`
}

function reportDiagnostic(code) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent('dinero-pro:bridge-diagnostic', {
      detail: { code, bridge: BRIDGE_OBJECT, capability: 'third-party-sdk-identifiers' },
    }))
  } catch {
    // Diagnostics must never affect the host callback or application flow.
  }
}

function removeSharedCallback() {
  if (typeof window === 'undefined') return
  try {
    if (window[CALLBACK_NAME] === handleReply) delete window[CALLBACK_NAME]
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_CLEANUP_FAILED')
  }
}

function cleanup(record) {
  registry.delete(record.registryKey)
  if (registry.size === 0) removeSharedCallback()
}

function notifyFailure(record, code) {
  record.completed = true
  cleanup(record)
  if (record.consumerCanceled) return
  deliverBridgeFailure(record.onFailure, code, METHOD, reportDiagnostic)
}

function notifyImmediateFailure(onFailure, code) {
  deliverBridgeFailure(onFailure, code, METHOD, reportDiagnostic)
}

function findRecord(reply) {
  if (!reply || typeof reply !== 'object' || Array.isArray(reply) || typeof reply.requestId !== 'string') return null
  return [...registry.values()].find((entry) => entry.requestId === reply.requestId) ?? null
}

function isValidReply(reply) {
  if (
    !reply
    || typeof reply !== 'object'
    || Array.isArray(reply)
    || reply.action !== 'third_party_sdk_identifier_fetch'
    || typeof reply.requestId !== 'string'
    || !TERMINAL_STATUSES.has(reply.status)
    || typeof reply.message !== 'string'
  ) return false

  return Object.keys(ANDROID_IDENTIFIER_FIELD_MAP)
    .every((field) => typeof reply[field] === 'string')
}

function toStableResult(reply) {
  const result = {
    status: reply.status,
    message: reply.message,
  }
  Object.entries(ANDROID_IDENTIFIER_FIELD_MAP).forEach(([androidField, h5Field]) => {
    if (typeof reply[androidField] === 'string' && reply[androidField].length > 0) result[h5Field] = reply[androidField]
  })
  return result
}

function handleReply(reply) {
  const record = findRecord(reply)
  if (!isValidReply(reply)) {
    if (record) notifyFailure(record, BRIDGE_FAILURE_CODES.invalidCallback)
    reportDiagnostic(record ? 'BRIDGE_CALLBACK_INVALID_PAYLOAD' : 'BRIDGE_CALLBACK_UNKNOWN_REQUEST')
    return
  }

  if (!record) {
    reportDiagnostic('BRIDGE_CALLBACK_UNKNOWN_REQUEST')
    return
  }

  cleanup(record)
  if (record.completed) {
    reportDiagnostic('BRIDGE_CALLBACK_DUPLICATE')
    return
  }
  record.completed = true
  if (record.consumerCanceled) return

  try {
    record.consumer(toStableResult(reply))
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_CONSUMER_FAILED')
  }
}

function ensureSharedCallback() {
  if (typeof window === 'undefined') return false
  try {
    if (typeof window[CALLBACK_NAME] === 'function' && window[CALLBACK_NAME] !== handleReply) {
      reportDiagnostic('BRIDGE_CALLBACK_NAME_CONFLICT')
      return false
    }
    if (typeof window[CALLBACK_NAME] !== 'function') window[CALLBACK_NAME] = handleReply
    return window[CALLBACK_NAME] === handleReply
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_REGISTRATION_FAILED')
    return false
  }
}

function isAcceptedResponse(response, requestId) {
  if (
    !response
    || typeof response !== 'object'
    || Array.isArray(response)
    || response.action !== 'third_party_sdk_identifier_fetch'
    || response.requestId !== requestId
    || typeof response.status !== 'string'
    || typeof response.message !== 'string'
  ) return BRIDGE_FAILURE_CODES.callFailed
  return response.status === 'accepted' ? null : BRIDGE_FAILURE_CODES.notAccepted
}

/** Query third-party SDK identifiers through the documented Android Bridge capability. */
export function getThirdPartySdkIdentifiers(consumer = () => {}, options) {
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

  if (!ensureSharedCallback()) {
    notifyImmediateFailure(failureOptions.onFailure, BRIDGE_FAILURE_CODES.callFailed)
    return null
  }

  const registryKey = createId('third-party-sdk-identifiers')
  const requestId = createId('third-party-sdk-identifier-fetch')
  const record = {
    registryKey,
    callbackName: `window.${CALLBACK_NAME}`,
    callbackScope: CALLBACK_SCOPE,
    requestId,
    status: 'pending',
    completed: false,
    consumerCanceled: false,
    consumer,
    onFailure: failureOptions.onFailure,
  }
  registry.set(registryKey, record)

  let payload
  try {
    payload = JSON.stringify({
      requestId,
      replyHandler: `window.${CALLBACK_NAME}`,
    })
  } catch {
    notifyFailure(record, BRIDGE_FAILURE_CODES.callFailed)
    reportDiagnostic('BRIDGE_CALL_FAILED')
    return null
  }

  try {
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

export function cancelThirdPartySdkIdentifiersConsumer(requestId) {
  if (typeof requestId !== 'string' || requestId.length === 0) return false
  const record = [...registry.values()].find((entry) => entry.requestId === requestId)
  if (!record || record.completed) return false
  record.consumerCanceled = true
  record.consumer = () => {}
  record.onFailure = null
  return true
}

export function getThirdPartySdkIdentifiersRegistrySize() {
  return registry.size
}

export const nativeThirdPartySdkIdentifiersBridge = Object.freeze({
  cancelThirdPartySdkIdentifiersConsumer,
  getThirdPartySdkIdentifiers,
})
