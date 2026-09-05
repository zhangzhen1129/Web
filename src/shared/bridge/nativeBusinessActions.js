const BRIDGE_OBJECT = 'plahub'
const GOOGLE_PLAY_METHOD = 'openGooglePlay'
const LOGOUT_METHOD = 'logoutToOtpLogin'
const GOOGLE_PLAY_CALLBACK_NAME = '__dineroProGooglePlayReply'
const GOOGLE_PLAY_CALLBACK_SCOPE = 'shared'

let sequence = 0
const googlePlayRegistry = new Map()

function createId(prefix) {
  sequence += 1
  return 'h5-' + prefix + '-' + Date.now().toString(36) + '-' + sequence.toString(36)
}

function reportDiagnostic(code, capability) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent('dinero-pro:bridge-diagnostic', {
      detail: { code, bridge: BRIDGE_OBJECT, capability },
    }))
  } catch {
    // Diagnostics must not affect the host call.
  }
}

function removeGooglePlayCallback() {
  if (typeof window === 'undefined' || googlePlayRegistry.size > 0) return
  try {
    if (window[GOOGLE_PLAY_CALLBACK_NAME] === handleGooglePlayReply) delete window[GOOGLE_PLAY_CALLBACK_NAME]
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_CLEANUP_FAILED', 'openGooglePlay')
  }
}

function handleGooglePlayReply(reply) {
  if (
    !reply
    || typeof reply !== 'object'
    || Array.isArray(reply)
    || reply.action !== 'google_play_open'
    || typeof reply.requestId !== 'string'
    || (reply.status !== 'ERR_GOOGLE_PLAY_UNAVAILABLE' && reply.status !== 'ERR_OPEN_FAILED')
    || typeof reply.message !== 'string'
  ) {
    reportDiagnostic('BRIDGE_CALLBACK_INVALID_PAYLOAD', 'openGooglePlay')
    return
  }

  const record = googlePlayRegistry.get(reply.requestId)
  if (!record) {
    reportDiagnostic('BRIDGE_CALLBACK_UNKNOWN_REQUEST', 'openGooglePlay')
    return
  }

  googlePlayRegistry.delete(reply.requestId)
  reportDiagnostic(reply.status, 'openGooglePlay')
  removeGooglePlayCallback()
}

function ensureGooglePlayCallback() {
  if (typeof window === 'undefined') return false
  try {
    if (typeof window[GOOGLE_PLAY_CALLBACK_NAME] === 'function' && window[GOOGLE_PLAY_CALLBACK_NAME] !== handleGooglePlayReply) {
      reportDiagnostic('BRIDGE_CALLBACK_NAME_CONFLICT', 'openGooglePlay')
      return false
    }
    if (typeof window[GOOGLE_PLAY_CALLBACK_NAME] !== 'function') window[GOOGLE_PLAY_CALLBACK_NAME] = handleGooglePlayReply
    return window[GOOGLE_PLAY_CALLBACK_NAME] === handleGooglePlayReply
  } catch {
    reportDiagnostic('BRIDGE_CALLBACK_REGISTRATION_FAILED', 'openGooglePlay')
    return false
  }
}

function invokeGooglePlay() {
  const bridge = typeof window === 'undefined' ? undefined : window[BRIDGE_OBJECT]
  if (!bridge || typeof bridge[GOOGLE_PLAY_METHOD] !== 'function') {
    reportDiagnostic('BRIDGE_METHOD_UNAVAILABLE', 'openGooglePlay')
    return false
  }
  if (!ensureGooglePlayCallback()) return false

  const requestId = createId('google-play')
  googlePlayRegistry.set(requestId, {
    registryKey: requestId,
    callbackName: 'window.' + GOOGLE_PLAY_CALLBACK_NAME,
    callbackScope: GOOGLE_PLAY_CALLBACK_SCOPE,
  })

  try {
    const payload = JSON.stringify({
      requestId,
      replyHandler: 'window.' + GOOGLE_PLAY_CALLBACK_NAME,
    })
    const result = JSON.parse(bridge[GOOGLE_PLAY_METHOD](payload))
    const accepted = result
      && result.action === 'google_play_open'
      && result.requestId === requestId
      && typeof result.message === 'string'
      && ['accepted', 'busy', 'invalid_args'].includes(result.status)
    if (!accepted || result.status !== 'accepted') {
      googlePlayRegistry.delete(requestId)
      reportDiagnostic(result?.status === 'busy' ? 'BRIDGE_REQUEST_BUSY' : 'BRIDGE_REQUEST_NOT_ACCEPTED', 'openGooglePlay')
      removeGooglePlayCallback()
      return false
    }
    // The synchronous accepted result is the terminal H5 result for this
    // fire-and-forget capability. Android failure callbacks are diagnostic only.
    googlePlayRegistry.delete(requestId)
    removeGooglePlayCallback()
    return true
  } catch {
    googlePlayRegistry.delete(requestId)
    reportDiagnostic('BRIDGE_CALL_FAILED', 'openGooglePlay')
    removeGooglePlayCallback()
    return false
  }
}

export function openGooglePlayNative() {
  return invokeGooglePlay()
}

export function logoutToOtpLoginNative() {
  const bridge = typeof window === 'undefined' ? undefined : window[BRIDGE_OBJECT]
  if (!bridge || typeof bridge[LOGOUT_METHOD] !== 'function') {
    reportDiagnostic('BRIDGE_METHOD_UNAVAILABLE', 'logoutToOtpLogin')
    return false
  }
  try {
    bridge[LOGOUT_METHOD]()
    return true
  } catch {
    reportDiagnostic('BRIDGE_CALL_FAILED', 'logoutToOtpLogin')
    return false
  }
}

export function getNativeBusinessActionRegistrySize() {
  return googlePlayRegistry.size
}

export const nativeBusinessActionsBridge = Object.freeze({
  getNativeBusinessActionRegistrySize,
  logoutToOtpLoginNative,
  openGooglePlayNative,
})
