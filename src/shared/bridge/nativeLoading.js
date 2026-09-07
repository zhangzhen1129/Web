import { logNativeBridgeCall } from './nativeCallLog.js'

const BRIDGE_OBJECT = 'plahub'
const SHOW_METHOD = 'showLoading'
const HIDE_METHOD = 'hideLoading'

let requestSequence = 0
const ENABLE_BROWSER_LOADING_MOCK = typeof import.meta.env === 'object'
  && (import.meta.env?.MODE === 'development' || import.meta.env?.MODE === 'test')

function updateBrowserLoading(visible) {
  if (!ENABLE_BROWSER_LOADING_MOCK || typeof document === 'undefined') return
  const existing = document.querySelector('[data-dinero-browser-loading]')
  if (!visible) {
    existing?.remove()
    return
  }
  if (existing) return
  const overlay = document.createElement('div')
  overlay.className = 'browser-native-loading'
  overlay.dataset.dineroBrowserLoading = ''
  overlay.setAttribute('role', 'status')
  overlay.setAttribute('aria-live', 'polite')
  const spinner = document.createElement('span')
  spinner.className = 'browser-native-loading__spinner'
  spinner.setAttribute('aria-hidden', 'true')
  overlay.append(spinner)
  document.body.append(overlay)
}

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
    updateBrowserLoading(method === SHOW_METHOD)
    reportDiagnostic('BRIDGE_METHOD_UNAVAILABLE')
    return
  }

  // requestId is required by the Android contract. It is generated for every
  // invocation and never exposed as a caller-controlled protocol field.
  const payload = JSON.stringify({ requestId: createRequestId(method === SHOW_METHOD ? 'show' : 'hide') })
  try {
    // Loading methods return a synchronous JSON string, which is deliberately
    // ignored. The H5 API has no business result and never retries or throws.
    logNativeBridgeCall(method)
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
