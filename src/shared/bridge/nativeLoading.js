const BRIDGE_OBJECT = 'plahub'
const SHOW_METHOD = 'showLoading'
const HIDE_METHOD = 'hideLoading'

let requestSequence = 0

function createRequestId(operation) {
  requestSequence += 1
  return `h5-${operation}-${Date.now().toString(36)}-${requestSequence.toString(36)}`
}

function reportDiagnostic(code) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent('dinero-pro:bridge-diagnostic', {
      detail: { code, bridge: BRIDGE_OBJECT, capability: 'loading' },
    }))
  } catch {
    // Diagnostics must never affect the host call or application startup.
  }
}

function invokeLoading(method) {
  const bridge = typeof window === 'undefined' ? undefined : window[BRIDGE_OBJECT]
  if (!bridge || typeof bridge[method] !== 'function') {
    reportDiagnostic('BRIDGE_METHOD_UNAVAILABLE')
    return
  }

  // requestId is required by the Android contract. It is generated for every
  // invocation and never exposed as a caller-controlled protocol field.
  const payload = JSON.stringify({ requestId: createRequestId(method === SHOW_METHOD ? 'show' : 'hide') })
  try {
    // Loading methods return a synchronous JSON string, which is deliberately
    // ignored. The H5 API has no business result and never retries or throws.
    bridge[method](payload)
  } catch {
    reportDiagnostic('BRIDGE_CALL_FAILED')
  }
}

export function showNativeLoading() {
  invokeLoading(SHOW_METHOD)
}

export function hideNativeLoading() {
  invokeLoading(HIDE_METHOD)
}

export const nativeLoadingBridge = Object.freeze({
  showNativeLoading,
  hideNativeLoading,
})

