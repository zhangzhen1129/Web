import {
  BRIDGE_FAILURE_CODES,
  deliverBridgeFailure,
  normalizeFailureOptions,
} from './bridgeFailure.js'
import { logNativeBridgeCall } from './nativeCallLog.js'

const BRIDGE_OBJECT = 'plahub'
const METHOD = 'handlePersistentCache'
const CALLBACK_NAME = '__dineroProPersistentCacheReply'
const CALLBACK_SCOPE = 'shared'
const CACHE_KEY = 'Token'

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
      detail: { code, bridge: BRIDGE_OBJECT, capability: 'persistent-cache' },
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

function isValidReply(reply) {
  return reply !== null
    && typeof reply === 'object'
    && !Array.isArray(reply)
    && reply.action === 'persistent_cache_handle'
    && typeof reply.requestId === 'string'
    && reply.operation === 'get'
    && reply.cacheKey === CACHE_KEY
    && (reply.status === 'completed' || reply.status === 'error')
    && typeof reply.message === 'string'
    && typeof reply.cacheValue === 'string'
    && typeof reply.hit === 'boolean'
    && typeof reply.storagePolicy === 'string'
    && Number.isInteger(reply.expiresAtMillis)
}

function handleReply(reply) {
  const requestId = reply !== null
    && typeof reply === 'object'
    && !Array.isArray(reply)
    && typeof reply.requestId === 'string'
    ? reply.requestId
    : null
  const record = requestId
    ? [...registry.values()].find((entry) => entry.requestId === requestId)
    : null

  if (!isValidReply(reply)) {
    if (record) notifyFailure(record, BRIDGE_FAILURE_CODES.invalidCallback)
    reportDiagnostic('BRIDGE_CALLBACK_INVALID_PAYLOAD')
    return
  }

  if (!record) {
    reportDiagnostic('BRIDGE_CALLBACK_UNKNOWN_REQUEST')
    return
  }

  record.status = reply.status
  cleanup(record)
  if (record.completed) {
    reportDiagnostic('BRIDGE_CALLBACK_DUPLICATE')
    return
  }
  record.completed = true
  if (record.consumerCanceled) return

  try {
    record.consumer(reply)
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

/** Query the Android persistent cache entry named Token.
 * The callback remains application-scoped so a route change cannot cancel it.
 */
export function getNativeCachedToken(consumer = () => {}, options) {
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

  const registryKey = createId('persistent-cache')
  const requestId = createId('cache-get')
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
      operation: 'get',
      cacheKey: CACHE_KEY,
    })
  } catch {
    notifyFailure(record, BRIDGE_FAILURE_CODES.callFailed)
    reportDiagnostic('BRIDGE_CALL_FAILED')
    return null
  }

  try {
    logNativeBridgeCall(METHOD)
    const synchronousResult = JSON.parse(bridge[METHOD](payload))
    const accepted = synchronousResult?.action === 'persistent_cache_handle'
      && synchronousResult.requestId === requestId
      && typeof synchronousResult.status === 'string'
      && typeof synchronousResult.message === 'string'
    if (!accepted) {
      notifyFailure(record, BRIDGE_FAILURE_CODES.callFailed)
      reportDiagnostic('BRIDGE_CALL_FAILED')
      return null
    }
    if (synchronousResult.status !== 'accepted') {
      notifyFailure(record, BRIDGE_FAILURE_CODES.notAccepted)
      reportDiagnostic('BRIDGE_REQUEST_NOT_ACCEPTED')
      return null
    }
  } catch {
    notifyFailure(record, BRIDGE_FAILURE_CODES.callFailed)
    reportDiagnostic('BRIDGE_CALL_FAILED')
    return null
  }

  return requestId
}

export function cancelNativeCachedTokenConsumer(requestId) {
  if (typeof requestId !== 'string' || requestId.length === 0) return false
  const record = [...registry.values()].find((entry) => entry.requestId === requestId)
  if (!record || record.completed) return false
  record.consumerCanceled = true
  record.consumer = () => {}
  record.onFailure = null
  return true
}

export function getNativePersistentCacheRegistrySize() {
  return registry.size
}

export const nativePersistentCacheBridge = Object.freeze({
  cancelNativeCachedTokenConsumer,
  getNativeCachedToken,
})
