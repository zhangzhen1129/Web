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

function isAcceptedResponse(response, requestId) {
  return response?.action === METHOD
    && response.requestId === requestId
    && response.status === 'accepted'
    && typeof response.message === 'string'
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
export function requestNativeOneClickPermissions(permissions, consumer = () => {}) {
  const normalizedPermissions = normalizePermissions(permissions)
  if (!normalizedPermissions) {
    reportDiagnostic('BRIDGE_INVALID_PERMISSION_SET')
    return null
  }
  if (typeof consumer !== 'function') {
    reportDiagnostic('BRIDGE_CALLBACK_INVALID_CONSUMER')
    return null
  }

  const bridge = typeof window === 'undefined' ? undefined : window[BRIDGE_OBJECT]
  if (!bridge || typeof bridge[METHOD] !== 'function') {
    reportDiagnostic('BRIDGE_METHOD_UNAVAILABLE')
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
    consumer,
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
      cleanup(record)
      reportDiagnostic('BRIDGE_CALLBACK_INVALID_PAYLOAD')
      return
    }

    record.completed = true
    cleanup(record)
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
      return null
    }
    window[callbackName] = callback
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_REGISTRATION_FAILED')
    return null
  }

  registry.set(registryKey, record)
  const payload = JSON.stringify({
    requestId,
    replyHandler: callbackPath,
    permissions: normalizedPermissions,
  })

  try {
    const synchronousResult = JSON.parse(bridge[METHOD](payload))
    if (!isAcceptedResponse(synchronousResult, requestId)) {
      cleanup(record)
      reportDiagnostic('BRIDGE_REQUEST_NOT_ACCEPTED')
      return null
    }
  } catch {
    cleanup(record)
    reportDiagnostic('BRIDGE_CALL_FAILED')
    return null
  }

  return requestId
}

export function getNativeOneClickPermissionRegistrySize() {
  return registry.size
}

export const nativeOneClickPermissionsBridge = Object.freeze({ requestNativeOneClickPermissions })
