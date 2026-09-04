import {
  BRIDGE_FAILURE_CODES,
  deliverBridgeFailure,
  normalizeFailureOptions,
} from './bridgeFailure.js'

const BRIDGE_OBJECT = 'plahub'
const METHOD = 'requestOneClickPermissions'
const CALLBACK_SCOPE = 'perCall'
const ALLOWED_PERMISSION_KEYS = new Set(['sms', 'camera', 'callLog', 'phoneState', 'location'])

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
      detail: { code, bridge: BRIDGE_OBJECT, capability: 'one-click-permissions' },
    }))
  } catch {
    // Diagnostics must not affect Android permission handling.
  }
}

function normalizePermissions(permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) return null
  const uniquePermissions = []
  for (const permission of permissions) {
    if (typeof permission !== 'string' || !ALLOWED_PERMISSION_KEYS.has(permission)) return null
    if (!uniquePermissions.includes(permission)) uniquePermissions.push(permission)
  }
  return uniquePermissions.length > 0 ? uniquePermissions : null
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
    || response.action !== METHOD
    || response.requestId !== requestId
    || typeof response.status !== 'string'
    || typeof response.message !== 'string'
  ) return BRIDGE_FAILURE_CODES.callFailed
  return response.status === 'accepted' ? null : BRIDGE_FAILURE_CODES.notAccepted
}

function isValidReply(reply, requestId) {
  return reply !== null
    && typeof reply === 'object'
    && !Array.isArray(reply)
    && reply.requestId === requestId
    && reply.status === 'all_granted'
    && typeof reply.message === 'string'
}

/** Request documented Android permissions and deliver the all-granted callback. */
export function requestNativeOneClickPermissions(permissions, consumer = () => {}, options) {
  const failureOptions = normalizeFailureOptions(options)
  if (!failureOptions.valid) {
    reportDiagnostic('BRIDGE_INVALID_OPTIONS')
    return null
  }
  const normalizedPermissions = normalizePermissions(permissions)
  if (!normalizedPermissions) {
    reportDiagnostic('BRIDGE_INVALID_PERMISSION_SET')
    notifyImmediateFailure(failureOptions.onFailure, BRIDGE_FAILURE_CODES.invalidArgument)
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

  const registryKey = createId('one-click-permissions')
  const requestId = createId('one-click-permission-request')
  const callbackName = `__dineroProOneClickPermissionReply_${sequence.toString(36)}`
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
    if (reply?.requestId !== requestId) {
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
    payload = JSON.stringify({
      requestId,
      replyHandler: callbackPath,
      permissions: normalizedPermissions,
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

export function cancelNativeOneClickPermissionConsumer(requestId) {
  if (typeof requestId !== 'string' || requestId.length === 0) return false
  const record = [...registry.values()].find((entry) => entry.requestId === requestId)
  if (!record || record.completed) return false
  record.consumerCanceled = true
  record.consumer = () => {}
  record.onFailure = null
  return true
}

export function getNativeOneClickPermissionRegistrySize() {
  return registry.size
}

export const nativeOneClickPermissionsBridge = Object.freeze({
  cancelNativeOneClickPermissionConsumer,
  requestNativeOneClickPermissions,
})
