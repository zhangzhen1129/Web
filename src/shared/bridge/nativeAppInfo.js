const BRIDGE_OBJECT = 'plahub'
const METHOD = 'fetchAppInfo'
const CALLBACK_NAME = '__dineroProAppInfoReply'
const CALLBACK_SCOPE = 'shared'

let sequence = 0
const registry = new Map()

const APP_INFO_FIELDS = Object.freeze([
  'packageId',
  'packageName',
  'appVersion',
  'appVersionName',
  'appName',
  'androidId',
])

function createId(prefix) {
  sequence += 1
  return `h5-${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`
}

function reportDiagnostic(code) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent('dinero-pro:bridge-diagnostic', {
      detail: { code, bridge: BRIDGE_OBJECT, capability: 'app-info' },
    }))
  } catch {
    // Diagnostics must never affect the host callback or application flow.
  }
}

function removeSharedCallback() {
  if (typeof window === 'undefined') return
  try {
    if (window[CALLBACK_NAME]) delete window[CALLBACK_NAME]
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_CLEANUP_FAILED')
  }
}

function cleanup(record) {
  registry.delete(record.registryKey)
  if (registry.size === 0) removeSharedCallback()
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
    || reply.action !== 'app_info_fetch'
    || typeof reply.requestId !== 'string'
    || (reply.status !== 'success' && reply.status !== 'error')
    || typeof reply.message !== 'string'
  ) return false

  return APP_INFO_FIELDS.every((field) => reply[field] === undefined || typeof reply[field] === 'string')
}

function handleReply(reply) {
  const record = findRecord(reply)
  if (!isValidReply(reply)) {
    if (record) cleanup(record)
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

function isAcceptedResponse(response, requestId) {
  return response?.action === 'app_info_fetch'
    && response.requestId === requestId
    && response.status === 'accepted'
}

/** Query app information through the documented Android Bridge capability. */
export function getNativeAppInfo(consumer = () => {}) {
  if (typeof consumer !== 'function') {
    reportDiagnostic('BRIDGE_CALLBACK_INVALID_CONSUMER')
    return null
  }

  const bridge = typeof window === 'undefined' ? undefined : window[BRIDGE_OBJECT]
  if (!bridge || typeof bridge[METHOD] !== 'function') {
    reportDiagnostic('BRIDGE_METHOD_UNAVAILABLE')
    return null
  }

  if (!ensureSharedCallback()) return null

  const registryKey = createId('app-info')
  const requestId = createId('app-info-fetch')
  const record = {
    registryKey,
    callbackName: `window.${CALLBACK_NAME}`,
    callbackScope: CALLBACK_SCOPE,
    requestId,
    status: 'pending',
    completed: false,
    consumer,
  }
  registry.set(registryKey, record)

  const payload = JSON.stringify({
    requestId,
    replyHandler: `window.${CALLBACK_NAME}`,
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

export function getNativeAppInfoRegistrySize() {
  return registry.size
}

export const nativeAppInfoBridge = Object.freeze({ getNativeAppInfo })
