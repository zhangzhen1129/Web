import { gzip } from 'pako'
import { networkClient } from '../../../shared/network/index.js'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import {
  cancelNativeDataCollectionConsumer,
  queryNativeAppListFetchResult,
  queryNativeCallFetchResult,
  queryNativeDevBaseFetchResult,
  queryNativeDeviceFetchResult,
  queryNativeSmsFetchResult,
} from '../../../shared/bridge/nativeDataCollection.js'
import { dataUploadProtocol } from './generated/dataUploadProtocol.js'

const POLL_INTERVAL_MS = 2000
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const RESULT_STATUS = Object.freeze({
  cancelled: 'cancelled',
  collectFailed: 'collect_failed',
  success: 'success',
  unavailable: 'unavailable',
  uploadFailed: 'upload_failed',
})

const defaultBridge = Object.freeze({
  cancelNativeDataCollectionConsumer,
  queryNativeAppListFetchResult,
  queryNativeCallFetchResult,
  queryNativeDevBaseFetchResult,
  queryNativeDeviceFetchResult,
  queryNativeSmsFetchResult,
})

const collectionDefinitions = Object.freeze([
  Object.freeze({
    name: 'app',
    invoke: (bridge, consumer, options) => bridge.queryNativeAppListFetchResult(consumer, options),
    payload: (reply) => reply?.templateResult,
  }),
  Object.freeze({
    name: 'sms',
    invoke: (bridge, consumer, options) => bridge.queryNativeSmsFetchResult(consumer, options),
    payload: (reply) => reply?.templateResult,
  }),
  Object.freeze({
    name: 'callLog',
    invoke: (bridge, consumer, options) => bridge.queryNativeCallFetchResult(consumer, options),
    payload: (reply) => reply?.templateResult,
  }),
  Object.freeze({
    name: 'deviceInfo',
    invoke: (bridge, consumer, options) => bridge.queryNativeDeviceFetchResult(consumer, options),
    payload: (reply) => reply?.zzvvcr,
  }),
  Object.freeze({
    name: 'deviceBase',
    invoke: (bridge, consumer, options) => bridge.queryNativeDevBaseFetchResult(consumer, options),
    payload: (reply) => reply?.deviceBaseData,
  }),
])

function validId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value)
}

function asObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function result(operationId, status, errorCode = null) {
  return Object.freeze({
    operationId: validId(operationId) ? operationId : null,
    status,
    ...(errorCode ? { errorCode } : {}),
  })
}

function readPath(value, path) {
  return path.reduce((current, key) => asObject(current)?.[key], value)
}

function writePath(target, path, value) {
  let current = target
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index]
    const next = asObject(current[key])
    current[key] = next ?? {}
    current = current[key]
  }
  current[path.at(-1)] = value
}

function report(diagnostic, event) {
  try { diagnostic(Object.freeze(event)) } catch {}
}

function emitStatus(onStatus, status) {
  try { onStatus(status) } catch {}
}

function waitForPoll(signal, wait = setTimeout, clear = clearTimeout) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false)
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      signal?.removeEventListener?.('abort', onAbort)
      resolve(value)
    }
    const timer = wait(() => finish(true), POLL_INTERVAL_MS)
    const onAbort = () => {
      clear(timer)
      finish(false)
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}

function queryOnce(definition, bridge, signal) {
  return new Promise((resolve) => {
    let requestId = null
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      signal?.removeEventListener?.('abort', onAbort)
      resolve(value)
    }
    const onAbort = () => {
      if (requestId) bridge.cancelNativeDataCollectionConsumer?.(requestId)
      finish({ kind: 'cancelled' })
    }
    if (signal?.aborted) return onAbort()
    signal?.addEventListener?.('abort', onAbort, { once: true })
    try {
      requestId = definition.invoke(
        bridge,
        (reply) => finish(reply?.status === 'SUCCESS'
          ? { kind: 'success', reply }
          : { kind: 'failed', code: 'COLLECTION_STATUS_INVALID' }),
        {
          onFailure: (failure) => finish({ kind: 'unavailable', code: failure?.code ?? 'BRIDGE_UNAVAILABLE' }),
          onProgress: (reply) => finish(reply?.status === 'IN_PROGRESS'
            ? { kind: 'pending' }
            : { kind: 'failed', code: 'COLLECTION_STATUS_INVALID' }),
        },
      )
      if (typeof requestId !== 'string' || requestId.length === 0) finish({ kind: 'unavailable', code: 'BRIDGE_UNAVAILABLE' })
    } catch {
      finish({ kind: 'unavailable', code: 'BRIDGE_CALL_FAILED' })
    }
  })
}

function createRequestBody(replies, protocol, mobile) {
  const payload = {}
  for (const definition of collectionDefinitions) {
    const fragment = asObject(definition.payload(replies.get(definition.name)))
    if (fragment) Object.assign(payload, fragment)
  }
  writePath(payload, protocol.fullUploadPath, true)
  writePath(payload, protocol.mobilePath, mobile)
  return payload
}

export function createTriggerUploadService(options = {}) {
  const bridge = options.bridge ?? defaultBridge
  const client = options.client ?? networkClient
  const protocol = options.protocol ?? dataUploadProtocol
  const getStore = options.getStore ?? (() => useGlobalStore())
  const invokeTriggerOnly = options.triggerOnly ?? (() => undefined)
  const diagnostic = typeof options.diagnostic === 'function' ? options.diagnostic : () => {}
  const wait = options.wait ?? setTimeout
  const clear = options.clear ?? clearTimeout
  let active = null

  async function run(input) {
    const operationId = input?.operationId
    const signal = input?.signal
    const onStatus = typeof input?.onStatus === 'function' ? input.onStatus : () => {}
    if (!validId(operationId)) return result(operationId, RESULT_STATUS.unavailable, 'INVALID_ARGUMENT')
    if (signal?.aborted) return result(operationId, RESULT_STATUS.cancelled)
    let store
    try { store = getStore() } catch { return result(operationId, RESULT_STATUS.unavailable, 'STORE_UNAVAILABLE') }
    const mobile = typeof store?.mobile === 'string' && store.mobile.length > 0 ? store.mobile : null
    if (!mobile) return result(operationId, RESULT_STATUS.unavailable, 'MOBILE_UNAVAILABLE')
    if (!asObject(protocol) || !Array.isArray(protocol.fullUploadPath) || !Array.isArray(protocol.mobilePath) || !Array.isArray(protocol.responseCodePath) || typeof protocol.path !== 'string' || !protocol.path.startsWith('/') || typeof protocol.protocolId !== 'string') {
      return result(operationId, RESULT_STATUS.unavailable, 'PROTOCOL_UNAVAILABLE')
    }

    try { invokeTriggerOnly() } catch {}
    report(diagnostic, { capability: 'trigger_upload', operationId, phase: 'started' })
    emitStatus(onStatus, 'collecting')
    report(diagnostic, { capability: 'trigger_upload', operationId, phase: 'collecting' })
    const replies = new Map()
    const pending = new Map(collectionDefinitions.map((definition) => [definition.name, definition]))

    while (pending.size > 0) {
      const attempts = await Promise.all([...pending.values()].map(async (definition) => [definition, await queryOnce(definition, bridge, signal)]))
      if (signal?.aborted || attempts.some(([, outcome]) => outcome.kind === 'cancelled')) return result(operationId, RESULT_STATUS.cancelled)
      for (const [definition, outcome] of attempts) {
        if (outcome.kind === 'success') {
          pending.delete(definition.name)
          replies.set(definition.name, outcome.reply)
          continue
        }
        if (outcome.kind === 'pending') continue
        report(diagnostic, { capability: 'trigger_upload', operationId, phase: outcome.kind, source: definition.name })
        return result(operationId, outcome.kind === 'unavailable' ? RESULT_STATUS.unavailable : RESULT_STATUS.collectFailed, outcome.code)
      }
      if (pending.size > 0 && !await waitForPoll(signal, wait, clear)) return result(operationId, RESULT_STATUS.cancelled)
    }

    const body = createRequestBody(replies, protocol, mobile)
    emitStatus(onStatus, 'uploading')
    report(diagnostic, { capability: 'trigger_upload', operationId, phase: 'uploading' })
    try {
      const response = await client.request({
        method: 'POST',
        path: protocol.path,
        protocolId: protocol.protocolId,
        data: gzip(JSON.stringify(body)),
        headers: { 'Content-Encoding': 'gzip', 'Content-Type': 'application/json' },
        signal,
      })
      if (signal?.aborted) return result(operationId, RESULT_STATUS.cancelled)
      if (readPath(response?.data, protocol.responseCodePath) !== 200) {
        report(diagnostic, { capability: 'trigger_upload', operationId, phase: 'upload_failed' })
        return result(operationId, RESULT_STATUS.uploadFailed, 'UPLOAD_BUSINESS_FAILED')
      }
    } catch (error) {
      if (signal?.aborted || error?.category === 'canceled') return result(operationId, RESULT_STATUS.cancelled)
      report(diagnostic, { capability: 'trigger_upload', operationId, phase: 'upload_failed' })
      return result(operationId, RESULT_STATUS.uploadFailed, 'UPLOAD_REQUEST_FAILED')
    }
    report(diagnostic, { capability: 'trigger_upload', operationId, phase: 'success' })
    return result(operationId, RESULT_STATUS.success)
  }

  function triggerUpload(input = {}) {
    if (active) return active
    active = run(input).finally(() => { active = null })
    return active
  }

  return Object.freeze({ triggerUpload })
}

const defaultTriggerUploadService = createTriggerUploadService()

export const triggerUpload = defaultTriggerUploadService.triggerUpload
