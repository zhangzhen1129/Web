import { logNativeBridgeCall } from './nativeCallLog.js'

const BRIDGE_OBJECT = 'plahub'
const GOOGLE_PLAY_METHOD = 'openGooglePlay'
const LOGOUT_METHOD = 'logoutToOtpLogin'
const GOOGLE_PLAY_CALLBACK_NAME = '__dineroProGooglePlayReply'

let sequence = 0

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

function ignoreGooglePlayReply() {}

function ensureGooglePlayCallback() {
  if (typeof window === 'undefined') return false
  try {
    if (typeof window[GOOGLE_PLAY_CALLBACK_NAME] === 'function' && window[GOOGLE_PLAY_CALLBACK_NAME] !== ignoreGooglePlayReply) {
      reportDiagnostic('BRIDGE_CALLBACK_NAME_CONFLICT', 'openGooglePlay')
      return false
    }
    if (typeof window[GOOGLE_PLAY_CALLBACK_NAME] !== 'function') window[GOOGLE_PLAY_CALLBACK_NAME] = ignoreGooglePlayReply
    return window[GOOGLE_PLAY_CALLBACK_NAME] === ignoreGooglePlayReply
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

  try {
    const payload = JSON.stringify({
      requestId,
      replyHandler: 'window.' + GOOGLE_PLAY_CALLBACK_NAME,
    })
    logNativeBridgeCall(GOOGLE_PLAY_METHOD)
    const result = JSON.parse(bridge[GOOGLE_PLAY_METHOD](payload))
    const accepted = result
      && result.action === 'google_play_open'
      && result.requestId === requestId
      && typeof result.message === 'string'
      && ['accepted', 'busy', 'invalid_args'].includes(result.status)
    if (!accepted || result.status !== 'accepted') {
      reportDiagnostic(result?.status === 'busy' ? 'BRIDGE_REQUEST_BUSY' : 'BRIDGE_REQUEST_NOT_ACCEPTED', 'openGooglePlay')
      return false
    }
    return true
  } catch {
    reportDiagnostic('BRIDGE_CALL_FAILED', 'openGooglePlay')
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
    logNativeBridgeCall(LOGOUT_METHOD)
    bridge[LOGOUT_METHOD]()
    return true
  } catch {
    reportDiagnostic('BRIDGE_CALL_FAILED', 'logoutToOtpLogin')
    return false
  }
}

export const nativeBusinessActionsBridge = Object.freeze({
  logoutToOtpLoginNative,
  openGooglePlayNative,
})
