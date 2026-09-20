import { logNativeBridgeCall } from './nativeCallLog.js'

const BRIDGE_OBJECT = 'plahub'
const METHOD = 'openPrivacyAgreementPage'
const ACTION = 'openPrivacyAgreementPage'
const EXTERNAL_BROWSER_TYPE = 1
const NATIVE_CONTAINER_TYPE = 2

let sequence = 0

function createRequestId() {
  sequence += 1
  return `h5-privacy-agreement-${Date.now().toString(36)}-${sequence.toString(36)}`
}

function reportDiagnostic(code) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent('dinero-pro:bridge-diagnostic', {
      detail: { code, bridge: BRIDGE_OBJECT, capability: 'openPrivacyAgreementPage' },
    }))
  } catch {
    // Diagnostics must not affect the host call or expose the URL.
  }
}

function isAllowedUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) return false
  if (/[\u0000-\u001F\u007F]/.test(value) || value.includes('\\')) return false
  try {
    const parsed = new URL(value)
    return ['http:', 'https:'].includes(parsed.protocol)
      && parsed.hostname.length > 0
      && parsed.username.length === 0
      && parsed.password.length === 0
      && parsed.pathname.startsWith('/')
  } catch {
    return false
  }
}

function isAcceptedResponse(response, requestId) {
  return Boolean(
    response
    && typeof response === 'object'
    && !Array.isArray(response)
    && response.action === ACTION
    && response.requestId === requestId
    && typeof response.status === 'string'
    && typeof response.message === 'string'
    && response.status === 'accepted',
  )
}

function isValidOptionalTitle(value) {
  return typeof value === 'undefined'
    || value === null
    || (typeof value === 'string' && !/[\u0000-\u001F\u007F]/.test(value))
}

function invokePrivacyAgreement({ url, type, title } = {}) {
  if (!isAllowedUrl(url)) {
    reportDiagnostic('BRIDGE_INVALID_OPTIONS')
    return false
  }
  if (![EXTERNAL_BROWSER_TYPE, NATIVE_CONTAINER_TYPE].includes(type)) {
    reportDiagnostic('BRIDGE_INVALID_OPTIONS')
    return false
  }
  if (type === NATIVE_CONTAINER_TYPE && !isValidOptionalTitle(title)) {
    reportDiagnostic('BRIDGE_INVALID_OPTIONS')
    return false
  }

  const bridge = typeof window === 'undefined' ? undefined : window[BRIDGE_OBJECT]
  if (!bridge || typeof bridge[METHOD] !== 'function') {
    reportDiagnostic('BRIDGE_METHOD_UNAVAILABLE')
    return false
  }

  const requestId = createRequestId()
  const request = {
    requestId,
    url,
    type,
  }
  if (type === NATIVE_CONTAINER_TYPE && typeof title === 'string' && title.length > 0) {
    request.title = title
  }

  let payload
  try {
    payload = JSON.stringify(request)
  } catch {
    reportDiagnostic('BRIDGE_CALL_FAILED')
    return false
  }

  try {
    logNativeBridgeCall(METHOD)
    const response = JSON.parse(bridge[METHOD](payload))
    if (!isAcceptedResponse(response, requestId)) {
      reportDiagnostic('BRIDGE_REQUEST_NOT_ACCEPTED')
      return false
    }
    return true
  } catch {
    reportDiagnostic('BRIDGE_CALL_FAILED')
    return false
  }
}

/** Open a payment or agreement URL in the native in-app WebView. */
export function openPrivacyAgreementInAppNat(url, title) {
  return invokePrivacyAgreement({
    url,
    type: NATIVE_CONTAINER_TYPE,
    title,
  })
}

/** Open a payment or agreement URL in the system external browser. */
export function openPrivacyAgreementExternalNat(url) {
  return invokePrivacyAgreement({
    url,
    type: EXTERNAL_BROWSER_TYPE,
  })
}

export const nativePrivacyAgreementBridge = Object.freeze({
  openPrivacyAgreementExternalNat,
  openPrivacyAgreementInAppNat,
})
