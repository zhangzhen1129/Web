import { networkClient } from '../../../shared/network/index.js'
import { isBusinessHandledError } from '../../../shared/businessError/index.js'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import {
  HomeDataMappingError,
  createErrorPayload,
  createLoadingPayload,
  mapAppModeResponse,
  mapMultiPushResponse,
} from '../services/homeDataMapper.js'

const APP_MODE_PATH = '/iu6/dwciihh/YudVYx8Vci2q'
const MULTI_PUSH_PATH = '/veL/SgR2X1W/P3U5HIUdGjFi/aLhW'
const TRIGGERS = new Set(['initial', 'return', 'refresh', 'refresh_credit'])
const CYCLE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const TEST_DIAGNOSTICS_ENABLED = typeof import.meta.env === 'object' && import.meta.env?.MODE === 'test'

function reportTestDiagnostic(event, detail) {
  if (!TEST_DIAGNOSTICS_ENABLED || typeof console?.info !== 'function') return
  console.info('home-data-diagnostic', { event, ...detail })
}

function readBusinessCode(data) {
  const code = data?.cyiUgNvO2EPltj?.atY3WWbXIN
  return Number.isInteger(code) ? code : null
}

function validInput(input) {
  if (!input || typeof input !== 'object') return false
  if (typeof input.loadCycleId !== 'string' || !CYCLE_PATTERN.test(input.loadCycleId)) return false
  if (!Number.isSafeInteger(input.viewRevision) || input.viewRevision < 0) return false
  if (!TRIGGERS.has(input.trigger)) return false
  if ((input.trigger === 'refresh' || input.trigger === 'refresh_credit') && (typeof input.sourceOperationId !== 'string' || !CYCLE_PATTERN.test(input.sourceOperationId))) return false
  return input.sourceOperationId === undefined || CYCLE_PATTERN.test(input.sourceOperationId)
}

function requestBody(store) {
  const value = (key) => typeof store?.[key] === 'string' ? store[key] : ''
  return {
    cvgH: value('afId'),
    rsbhpZ3X: { pwtL: value('gaId') },
    bgU88QMO: { eybE: value('fbId') },
    amHasFw: value('appName'),
    mmNUCmQdMioQ2O: { ux9jYLcC8H: value('appVersion') },
    qkNsXozI1oC5g3: { tf69g5Spk5: '2' },
    uxzfxbBMxhB: value('packageName'),
    ulG: '',
    vqfH0gehfvNYrW: { rpryc7q8rm: '' },
    yjDnG: value('token'),
  }
}

function result(input, status, payload, snapshot, error) {
  return Object.freeze({
    loadCycleId: input.loadCycleId,
    viewRevision: input.viewRevision,
    ...(input.sourceOperationId ? { sourceOperationId: input.sourceOperationId } : {}),
    status,
    ...(snapshot ? { snapshot } : {}),
    ...(payload ? { viewPayload: payload } : {}),
    ...(error ? { error: Object.freeze({ category: error.category ?? 'mapping', code: error.code ?? 'HOME_DATA_ERROR', ...(error.displayText ? { messageText: error.displayText } : {}) }) } : {}),
  })
}

export function createHomeDataProvider(options = {}) {
  const client = options.client ?? networkClient
  const store = options.store ?? (typeof options.getStore === 'function' ? options.getStore() : null) ?? (() => { try { return useGlobalStore() } catch { return null } })()
  const now = options.now ?? (() => Date.now())
  const random = options.random ?? Math.random
  let active = null
  let lastRevision = -1
  const usedCycleIds = new Set()

  async function loadHomeData(input) {
    if (!validInput(input) || input.viewRevision <= lastRevision || usedCycleIds.has(input.loadCycleId)) {
      return result(input ?? { loadCycleId: 'invalid', viewRevision: 0 }, 'error', null, null, { category: 'configuration', code: 'HOME_INPUT_INVALID' })
    }
    lastRevision = input.viewRevision
    usedCycleIds.add(input.loadCycleId)
    active?.controller.abort()
    const controller = new AbortController()
    const cycle = { id: input.loadCycleId, controller, mode: null, done: false }
    active = cycle
    const body = requestBody(store)
    const optionsForMap = { requestId: input.loadCycleId, revision: input.viewRevision, loadCycleId: input.loadCycleId, trigger: input.trigger, sourceOperationId: input.sourceOperationId, random }
    try {
      let modeData
      if (store?.isMultiPush === true) {
        cycle.mode = 'multi_push'
      } else {
        const response = await client.request({ method: 'POST', path: APP_MODE_PATH, data: body, signal: controller.signal, protocolId: 'home-app-mode' })
        if (active !== cycle || controller.signal.aborted) return result(input, 'canceled')
        reportTestDiagnostic('app_mode_response', { businessCode: readBusinessCode(response?.data) })
        try {
          const mapped = mapAppModeResponse(response?.data, optionsForMap)
          if (mapped.kind === 'cash_loan') {
            reportTestDiagnostic('app_mode_mapped', { mode: 'cash_loan' })
            return result(input, 'content', mapped.payload, mapped.snapshot)
          }
          reportTestDiagnostic('app_mode_mapped', { mode: 'multi_push' })
          cycle.mode = 'multi_push'; modeData = mapped.data
        } catch (error) {
          reportTestDiagnostic('app_mode_mapping_failed', { code: error?.code ?? 'UNKNOWN' })
          if (error instanceof HomeDataMappingError && error.code === 'APP_MODE_BUSINESS_FAILURE') return result(input, 'business_failure', createLoadingPayload({ ...optionsForMap, mode: null, messageText: error.displayText }), null, error)
          throw error
        }
      }
      if (!cycle.mode || active !== cycle || controller.signal.aborted) return result(input, 'canceled')
      if (modeData?.maskModel === 1 && store?.isMultiPush !== true && typeof store?.setGlobal === 'function' && store.setGlobal({ isMultiPush: true }) !== true) {
        throw new HomeDataMappingError('MULTI_MODE_CACHE_UPDATE_FAILED')
      }
      const response = await client.request({ method: 'POST', path: MULTI_PUSH_PATH, data: body, signal: controller.signal, protocolId: 'home-multi-push' })
      if (active !== cycle || controller.signal.aborted) return result(input, 'canceled')
      reportTestDiagnostic('multi_push_response', { businessCode: readBusinessCode(response?.data) })
      try {
        const mapped = mapMultiPushResponse(response?.data, { ...optionsForMap, now: now() })
        reportTestDiagnostic('multi_push_mapped', { productCount: mapped.snapshot.products.length })
        return result(input, 'content', mapped.payload, mapped.snapshot)
      } catch (error) {
        reportTestDiagnostic('multi_push_mapping_failed', { code: error?.code ?? 'UNKNOWN' })
        if (error instanceof HomeDataMappingError && error.code === 'MULTI_BUSINESS_FAILURE') return result(input, 'business_failure', createLoadingPayload({ ...optionsForMap, mode: 'multi_push', messageText: error.displayText }), null, error)
        throw error
      }
    } catch (error) {
      if (error?.category === 'canceled' || controller.signal.aborted || active !== cycle) return result(input, 'canceled')
      if (isBusinessHandledError(error)) {
        return result(input, 'handled', createErrorPayload({ ...optionsForMap, mode: cycle.mode, messageText: '' }), null, error)
      }
      reportTestDiagnostic('home_data_failed', { category: error?.category ?? 'network', code: error?.code ?? 'HOME_DATA_ERROR' })
      return result(input, 'error', createErrorPayload({ ...optionsForMap, mode: cycle.mode }), null, { category: error?.category ?? 'network', code: error?.code ?? 'HOME_DATA_ERROR' })
    } finally {
      cycle.done = true
      if (active === cycle) active = null
    }
  }

  function cancelHomeDataLoad(input) {
    const id = typeof input === 'string' ? input : input?.loadCycleId
    if (!active || active.id !== id) return
    active.controller.abort()
    active = null
  }

  return Object.freeze({ loadHomeData, cancelHomeDataLoad })
}

export { requestBody as createHomeRequestBody }
