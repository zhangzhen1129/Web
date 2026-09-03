import { networkClient } from '../../../shared/network/index.js'
import { createLocalErrorPayload } from './localHomeViewData.js'
import { mapAppModeResponse, mapMultiPushResponse } from '../services/homeDataMapper.js'
import { getProjectMessage } from '../../../shared/config/projectLanguage.js'

const APP_MODE_PATH = '/iu6/dwciihh/YudVYx8Vci2q'
const MULTI_PUSH_PATH = '/veL/SgR2X1W/P3U5HIUdGjFi/aLhW'
const TEST_TOKEN_FALLBACK = '6a97ba16e4b0d92c4ed9ad76'

function logRequestContext(store) {
  if (!import.meta.env?.DEV) return
  console.info('[home-data] request context', {
    appName: typeof store?.appName === 'string' ? store.appName : null,
    appVersion: typeof store?.appVersion === 'string' ? store.appVersion : null,
    packageName: typeof store?.packageName === 'string' ? store.packageName : null,
    apiHost: typeof store?.apiHost === 'string' ? store.apiHost : null,
    usingFallbackToken: typeof store?.token !== 'string' || store.token.length === 0,
    trackingIdentifierPresence: {
      afId: typeof store?.afId === 'string' && store.afId.length > 0,
      gaId: typeof store?.gaId === 'string' && store.gaId.length > 0,
      fbId: typeof store?.fbId === 'string' && store.fbId.length > 0,
    },
  })
}

function logLoadFailure(error) {
  if (!import.meta.env?.DEV) return
  console.warn('[home-data] load failure', {
    category: typeof error?.category === 'string' ? error.category : null,
    code: typeof error?.code === 'string' ? error.code : null,
    displayText: typeof error?.displayText === 'string' ? error.displayText : null,
  })
}

function createRequestBody(store) {
  logRequestContext(store)
  const required = ['appName', 'appVersion', 'packageName']
  if (required.some((key) => typeof store?.[key] !== 'string' || store[key].length === 0)) {
    throw new Error('HOME_REQUEST_CONTEXT_INVALID')
  }
  const optional = (key) => typeof store[key] === 'string' ? store[key] : ''
  const body = {
    cvgH: optional('afId'),
    rsbhpZ3X: { pwtL: optional('gaId') },
    bgU88QMO: { eybE: optional('fbId') },
    amHasFw: store.appName,
    mmNUCmQdMioQ2O: { ux9jYLcC8H: store.appVersion },
    qkNsXozI1oC5g3: { tf69g5Spk5: '2' },
    uxzfxbBMxhB: store.packageName,
    ulG: optional('gps'),
    vqfH0gehfvNYrW: { rpryc7q8rm: optional('gpsAddress') },
    yjDnG: typeof store.token === 'string' && store.token.length > 0 ? store.token : TEST_TOKEN_FALLBACK,
  }
  return body
}

function toResponseData(response) {
  return response?.data
}

export function createHomeDataProvider(controller, store, options = {}) {
  if (!controller || typeof controller.updateHomeView !== 'function') throw new TypeError('controller must provide updateHomeView()')
  const client = options.client ?? networkClient
  const now = options.now ?? (() => Date.now())
  let sequence = 0
  let active = null
  let destroyed = false
  let latestMultiResult = null

  function requestId(prefix) {
    sequence += 1
    return `home-data-${prefix}-${sequence}`
  }

  function isCurrent(cycle) {
    return !destroyed && active === cycle && !cycle.signal.aborted
  }

  function publishError(cycle) {
    if (!isCurrent(cycle)) return
    controller.updateHomeView({
      ...createLocalErrorPayload(requestId('error')),
      ...(cycle.sourceOperationId ? { sourceOperationId: cycle.sourceOperationId } : {}),
    })
  }

  async function load(sourceOperationId) {
    active?.abort.abort()
    const abort = new AbortController()
    const cycle = { abort, signal: abort.signal, sourceOperationId }
    active = cycle
    controller.updateHomeView({ requestId: requestId('loading'), ...(sourceOperationId ? { sourceOperationId } : {}), pageStatus: 'loading' })
    try {
      const body = createRequestBody(store)
      const appModeResponse = await client.request({ method: 'POST', path: APP_MODE_PATH, data: body, signal: cycle.signal, protocolId: 'home-app-mode' })
      if (!isCurrent(cycle)) return
      const appModeResult = mapAppModeResponse(toResponseData(appModeResponse), { requestId: requestId('app-mode'), sourceOperationId })
      if (appModeResult.kind !== 'multi_push') {
        controller.updateHomeView(appModeResult.payload)
        latestMultiResult = null
        return
      }
      const multiResponse = await client.request({ method: 'POST', path: MULTI_PUSH_PATH, data: body, signal: cycle.signal, protocolId: 'home-multi-push' })
      if (!isCurrent(cycle)) return
      const multiResult = mapMultiPushResponse(toResponseData(multiResponse), { requestId: requestId('multi-push'), sourceOperationId, now: now() })
      latestMultiResult = multiResult
      controller.updateHomeView(multiResult.payload)
    } catch (error) {
      if (!isCurrent(cycle) || error?.category === 'canceled') return
      logLoadFailure(error)
      if (error?.code === 'MULTI_BUSINESS_FAILURE' && latestMultiResult && error.displayText) {
        controller.updateHomeView({
          ...latestMultiResult.payload,
          requestId: requestId('multi-business-toast'),
          ...(cycle.sourceOperationId ? { sourceOperationId: cycle.sourceOperationId } : {}),
          toastNotice: {
            noticeId: `${cycle.sourceOperationId ?? 'initial'}-multi-business-failure`,
            text: error.displayText,
          },
        })
        return
      }
      publishError(cycle)
    }
  }

  function start() { void load() }
  function reload() { void load() }
  function handleOperation(operation) {
    if (operation?.type === 'refresh' || operation?.type === 'refresh_credit') void load(operation.requestId)
    if (operation?.type === 'primary_action' && latestMultiResult?.snapshot.primaryActionEffect === 'show_empty_products_toast') {
      controller.updateHomeView({
        ...latestMultiResult.payload,
        requestId: requestId('empty-products'),
        sourceOperationId: operation.requestId,
        toastNotice: {
          noticeId: `${operation.requestId}-empty-products`,
          messageId: '10',
          text: getProjectMessage('10'),
        },
      })
    }
  }
  function destroy() {
    destroyed = true
    active?.abort.abort()
    active = null
    latestMultiResult = null
  }

  return Object.freeze({ start, reload, handleOperation, destroy })
}
