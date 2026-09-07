import {
  triggerNativeAppList,
  triggerNativeCallFetch,
  triggerNativeSmsFetch,
} from '../../../shared/bridge/nativeDataCollection.js'
import { createTriggerUploadService } from './triggerUpload.js'

const FAILURE_CODES = new Set([
  'INVALID_ARGUMENT',
  'BRIDGE_UNAVAILABLE',
  'BRIDGE_NOT_ACCEPTED',
  'BRIDGE_CALL_FAILED',
  'INVALID_CALLBACK',
])

const defaultBridge = Object.freeze({
  triggerNativeAppList,
  triggerNativeCallFetch,
  triggerNativeSmsFetch,
})

function reportDiagnostic(event) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent('dinero-pro:data-collection-diagnostic', { detail: event }))
  } catch {
    // Diagnostics must not interrupt collection triggering.
  }
}

function safeFailureCode(code) {
  return FAILURE_CODES.has(code) ? code : 'BRIDGE_CALL_FAILED'
}

function emitDiagnostic(diagnostic, event) {
  try {
    diagnostic(Object.freeze(event))
  } catch {
    // Diagnostics must not interrupt collection triggering.
  }
}

function invokeTrigger(bridge, source, invoke, diagnostic) {
  let failureReported = false
  const reportFailure = (failure) => {
    failureReported = true
    emitDiagnostic(diagnostic, {
      capability: 'trigger_only',
      code: safeFailureCode(failure?.code),
      phase: 'bridge_failure',
      source,
    })
  }

  if (typeof invoke !== 'function') {
    reportFailure()
    return
  }

  try {
    const requestId = invoke(
      bridge,
      () => {},
      { onFailure: reportFailure },
    )
    if (typeof requestId === 'string' && requestId.length > 0) {
      emitDiagnostic(diagnostic, { capability: 'trigger_only', phase: 'accepted', source })
    } else if (!failureReported) {
      reportFailure()
    }
  } catch {
    if (!failureReported) reportFailure()
  }
}

function isOptionsObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function createDataCollectionService(options = {}) {
  const resolvedOptions = isOptionsObject(options) ? options : {}
  const bridge = isOptionsObject(resolvedOptions.bridge) ? resolvedOptions.bridge : defaultBridge
  const diagnostic = typeof resolvedOptions.diagnostic === 'function'
    ? resolvedOptions.diagnostic
    : reportDiagnostic

  function triggerOnly() {
    emitDiagnostic(diagnostic, { capability: 'trigger_only', phase: 'started' })
    invokeTrigger(bridge, 'app_list', (target, consumer, callbacks) => (
      target.triggerNativeAppList(consumer, callbacks)
    ), diagnostic)
    invokeTrigger(bridge, 'sms', (target, consumer, callbacks) => (
      target.triggerNativeSmsFetch(true, consumer, callbacks)
    ), diagnostic)
    invokeTrigger(bridge, 'call_log', (target, consumer, callbacks) => (
      target.triggerNativeCallFetch(consumer, callbacks)
    ), diagnostic)
  }

  const uploadOptions = {
    client: resolvedOptions.client,
    diagnostic,
    getStore: resolvedOptions.getStore,
    protocol: resolvedOptions.protocol,
    triggerOnly,
    wait: resolvedOptions.wait,
    clear: resolvedOptions.clear,
  }
  if (isOptionsObject(resolvedOptions.bridge)) uploadOptions.bridge = bridge
  const uploadService = createTriggerUploadService(uploadOptions)
  return Object.freeze({ triggerOnly, triggerUpload: uploadService.triggerUpload })
}

const defaultDataCollectionService = createDataCollectionService()

export const triggerOnly = defaultDataCollectionService.triggerOnly
