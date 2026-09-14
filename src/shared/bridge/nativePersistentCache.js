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
const CACHE_KEYS = Object.freeze({
  token: 'Token',
  userId: 'UserId',
  mobile: 'LoginPhoneNumber',
})

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

function isValidReply(reply, cacheKey) {
  return reply !== null
    && typeof reply === 'object'
    && !Array.isArray(reply)
    && reply.action === 'persistent_cache_handle'
    && typeof reply.requestId === 'string'
    && reply.operation === 'get'
    && reply.cacheKey === cacheKey
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

  if (!record) {
    reportDiagnostic('BRIDGE_CALLBACK_UNKNOWN_REQUEST')
    return
  }

  if (!isValidReply(reply, record.cacheKey)) {
    notifyFailure(record, BRIDGE_FAILURE_CODES.invalidCallback)
    reportDiagnostic('BRIDGE_CALLBACK_INVALID_PAYLOAD')
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

function getNativeCachedValue(cacheKey, consumer, options) {
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
    cacheKey,
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
      cacheKey,
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

function cancelNativeCachedConsumer(requestId, cacheKey) {
  if (typeof requestId !== 'string' || requestId.length === 0) return false
  const record = [...registry.values()].find((entry) => (
    entry.requestId === requestId && entry.cacheKey === cacheKey
  ))
  if (!record || record.completed) return false
  record.consumerCanceled = true
  record.consumer = () => {}
  record.onFailure = null
  return true
}

/** Query the Android persistent cache entry named Token. */
export function getNativeCachedToken(consumer = () => {}, options) {
  return getNativeCachedValue(CACHE_KEYS.token, consumer, options)
}

/** Query the Android persistent cache entry named UserId. */
export function getNativeCachedUserId(consumer = () => {}, options) {
  return getNativeCachedValue(CACHE_KEYS.userId, consumer, options)
}

/** Query the Android persistent cache entry named LoginPhoneNumber. */
export function getNativeCachedMobile(consumer = () => {}, options) {
  return getNativeCachedValue(CACHE_KEYS.mobile, consumer, options)
}

export function cancelNativeCachedTokenConsumer(requestId) {
  return cancelNativeCachedConsumer(requestId, CACHE_KEYS.token)
}

export function cancelNativeCachedUserIdConsumer(requestId) {
  return cancelNativeCachedConsumer(requestId, CACHE_KEYS.userId)
}

export function cancelNativeCachedMobileConsumer(requestId) {
  return cancelNativeCachedConsumer(requestId, CACHE_KEYS.mobile)
}

export function getNativePersistentCacheRegistrySize() {
  return registry.size
}

export const nativePersistentCacheBridge = Object.freeze({
  cancelNativeCachedMobileConsumer,
  cancelNativeCachedTokenConsumer,
  cancelNativeCachedUserIdConsumer,
  getNativeCachedMobile,
  getNativeCachedToken,
  getNativeCachedUserId,
})
