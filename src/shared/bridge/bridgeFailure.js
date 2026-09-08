export const BRIDGE_FAILURE_CODES = Object.freeze({
  invalidArgument: 'INVALID_ARGUMENT',
  unavailable: 'BRIDGE_UNAVAILABLE',
  notAccepted: 'BRIDGE_NOT_ACCEPTED',
  callFailed: 'BRIDGE_CALL_FAILED',
  invalidCallback: 'INVALID_CALLBACK',
  configActive: 'CONFIG_ACTIVE',
})

export function normalizeFailureOptions(options) {
  if (typeof options === 'undefined') return { valid: true, onFailure: null }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    return { valid: false, onFailure: null }
  }
  if (typeof options.onFailure !== 'undefined' && typeof options.onFailure !== 'function') {
    return { valid: false, onFailure: null }
  }
  return { valid: true, onFailure: options.onFailure ?? null }
}

export function deliverBridgeFailure(onFailure, code, capability, reportDiagnostic) {
  if (typeof onFailure !== 'function') return
  try {
    onFailure({ code, capability })
  } catch {
    reportDiagnostic('BRIDGE_FAILURE_CONSUMER_FAILED')
  }
}
