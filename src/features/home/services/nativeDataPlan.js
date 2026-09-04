import {
  cancelNativeDataCollectionConsumer,
  queryNativeAppListFetchResult,
  queryNativeCallFetchResult,
  queryNativeDevBaseFetchResult,
  queryNativeDeviceFetchResult,
  queryNativeSmsFetchResult,
  triggerNativeAppList,
  triggerNativeCallFetch,
  triggerNativeSmsFetch,
} from '../../../shared/bridge/nativeDataCollection.js'

const HOME_MODE = Object.freeze({
  CASH_LOAN: 'cash_loan',
  MULTI_PUSH: 'multi_push',
})

const POLL_DELAY_MS = 2000
const POLL_WINDOW_MS = 120000
const SMS_FULL_COLLECTION = true

const defaultBridge = Object.freeze({
  cancelNativeDataCollectionConsumer,
  queryNativeAppListFetchResult,
  queryNativeCallFetchResult,
  queryNativeDevBaseFetchResult,
  queryNativeDeviceFetchResult,
  queryNativeSmsFetchResult,
  triggerNativeAppList,
  triggerNativeCallFetch,
  triggerNativeSmsFetch,
})

const defaultClock = Object.freeze({
  clearTimeout(timerId) {
    clearTimeout(timerId)
  },
  setTimeout(callback, delay) {
    return setTimeout(callback, delay)
  },
})

function createResult(operationId, status, errorCode = null) {
  return Object.freeze({ operationId, status, errorCode })
}

function isValidPlan(plan) {
  return plan
    && typeof plan.operationId === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(plan.operationId)
    && (plan.homeMode === HOME_MODE.CASH_LOAN || plan.homeMode === HOME_MODE.MULTI_PUSH)
}

function mapBridgeFailure(code) {
  if (code === 'BRIDGE_UNAVAILABLE') return 'BRIDGE_UNAVAILABLE'
  if (code === 'BRIDGE_NOT_ACCEPTED') return 'BRIDGE_NOT_ACCEPTED'
  if (code === 'BRIDGE_CALL_FAILED') return 'BRIDGE_CALL_FAILED'
  if (code === 'INVALID_CALLBACK') return 'INVALID_CALLBACK'
  if (code === 'INVALID_ARGUMENT') return 'INTERNAL_FAILED'
  return 'INTERNAL_FAILED'
}

function createRunner(plan, options, onFinish) {
  const bridge = options.bridge ?? defaultBridge
  const clock = options.clock ?? defaultClock
  const operationId = plan.operationId
  const requestIds = new Set()
  const timers = new Set()
  const states = new Map([
    ['appList', 'pending'],
    ['sms', 'pending'],
    ['callLog', 'pending'],
    ['deviceInfo', 'pending'],
    ['deviceBase', 'pending'],
  ])
  const queryState = new Map([
    ['appList', { inFlight: false, timerId: null }],
    ['sms', { inFlight: false, timerId: null }],
    ['callLog', { inFlight: false, timerId: null }],
  ])
  let resolveResult
  let settled = false
  let promise

  function trackTimer(callback, delay) {
    let timerId = null
    try {
      timerId = clock.setTimeout(() => {
        timers.delete(timerId)
        try {
          callback()
        } catch {
          fail('INTERNAL_FAILED')
        }
      }, delay)
    } catch {
      fail('INTERNAL_FAILED')
      return null
    }
    timers.add(timerId)
    return timerId
  }

  function clearTimers() {
    timers.forEach((timerId) => {
      try {
        clock.clearTimeout(timerId)
      } catch {}
    })
    timers.clear()
    queryState.forEach((item) => { item.timerId = null })
  }

  function detachConsumers() {
    requestIds.forEach((requestId) => {
      try {
        bridge.cancelNativeDataCollectionConsumer(requestId)
      } catch {}
    })
    requestIds.clear()
  }

  function finish(status, errorCode = null) {
    if (settled) return
    settled = true
    clearTimers()
    detachConsumers()
    onFinish(operationId)
    resolveResult(createResult(operationId, status, errorCode))
  }

  function fail(errorCode = 'NATIVE_FAILED') {
    finish('failed', errorCode)
  }

  function completeItem(item) {
    if (settled || states.get(item) === 'success') return
    states.set(item, 'success')
    if ([...states.values()].every((status) => status === 'success')) finish('collected')
  }

  function registerRequest(requestId) {
    if (settled) return false
    if (typeof requestId !== 'string' || requestId.length === 0) {
      fail('BRIDGE_CALL_FAILED')
      return false
    }
    requestIds.add(requestId)
    return true
  }

  function dispatchTrigger(invoke, consumeResult) {
    let requestId
    try {
      requestId = invoke(
        (reply) => consumeResult?.(reply),
        { onFailure: (failure) => fail(mapBridgeFailure(failure?.code)) },
      )
    } catch {
      fail('BRIDGE_CALL_FAILED')
      return false
    }
    if (!registerRequest(requestId)) return false
    if (!consumeResult) {
      bridge.cancelNativeDataCollectionConsumer(requestId)
      requestIds.delete(requestId)
    }
    return true
  }

  function dispatchCashLoan() {
    const triggers = [
      () => dispatchTrigger(bridge.triggerNativeAppList),
      () => dispatchTrigger((consumer, callbacks) => bridge.triggerNativeSmsFetch(SMS_FULL_COLLECTION, consumer, callbacks)),
      () => dispatchTrigger(bridge.triggerNativeCallFetch),
      () => dispatchTrigger(bridge.queryNativeDeviceFetchResult),
      () => dispatchTrigger(bridge.queryNativeDevBaseFetchResult),
    ]
    for (const dispatch of triggers) {
      if (!dispatch() || settled) return
    }
    finish('trigger_dispatched')
  }

  function queryItem(item, invoke) {
    if (settled || states.get(item) === 'success') return
    const itemState = queryState.get(item)
    if (itemState.inFlight) return
    itemState.inFlight = true
    let requestId = null
    try {
      requestId = invoke(
        (reply) => {
          itemState.inFlight = false
          requestIds.delete(requestId)
          if (reply?.status === 'SUCCESS') completeItem(item)
          else fail('NATIVE_FAILED')
        },
        {
          onFailure: (failure) => {
            itemState.inFlight = false
            requestIds.delete(requestId)
            fail(mapBridgeFailure(failure?.code))
          },
          onProgress: () => {
            itemState.inFlight = false
            requestIds.delete(requestId)
            if (!settled && states.get(item) !== 'success') {
              itemState.timerId = trackTimer(() => queryItem(item, invoke), POLL_DELAY_MS)
            }
          },
        },
      )
    } catch {
      itemState.inFlight = false
      fail('BRIDGE_CALL_FAILED')
      return
    }
    if (!registerRequest(requestId)) return
  }

  function startQueries() {
    if (settled) return
    trackTimer(() => finish('timed_out', 'TIMEOUT'), POLL_WINDOW_MS)
    queryItem('appList', bridge.queryNativeAppListFetchResult)
    queryItem('sms', bridge.queryNativeSmsFetchResult)
    queryItem('callLog', bridge.queryNativeCallFetchResult)
  }

  function dispatchMultiPush() {
    const triggers = [
      () => dispatchTrigger(bridge.triggerNativeAppList),
      () => dispatchTrigger((consumer, callbacks) => bridge.triggerNativeSmsFetch(SMS_FULL_COLLECTION, consumer, callbacks)),
      () => dispatchTrigger(bridge.triggerNativeCallFetch),
      () => dispatchTrigger(bridge.queryNativeDeviceFetchResult, (reply) => {
        if (reply?.status === 'SUCCESS') completeItem('deviceInfo')
        else fail('NATIVE_FAILED')
      }),
      () => dispatchTrigger(bridge.queryNativeDevBaseFetchResult, (reply) => {
        if (reply?.status === 'SUCCESS') completeItem('deviceBase')
        else fail('NATIVE_FAILED')
      }),
    ]
    for (const dispatch of triggers) {
      if (!dispatch() || settled) return
    }
    trackTimer(startQueries, POLL_DELAY_MS)
  }

  function start() {
    promise = new Promise((resolve) => { resolveResult = resolve })
    try {
      if (plan.homeMode === HOME_MODE.CASH_LOAN) dispatchCashLoan()
      else dispatchMultiPush()
    } catch {
      fail('INTERNAL_FAILED')
    }
    return promise
  }

  return Object.freeze({
    cancel() {
      finish('canceled', 'CANCELED')
    },
    replace() {
      finish('canceled', 'REPLACED')
    },
    operationId,
    isSettled() {
      return settled
    },
    start,
  })
}

export function createNativeDataPlanService() {
  let activePlan = null
  const planHistory = new Map()

  function executeNativeDataPlan(plan, options = {}) {
    if (!isValidPlan(plan)) return Promise.resolve(createResult(null, 'failed', 'INVALID_ARGUMENT'))
    const historical = planHistory.get(plan.operationId)
    if (historical) {
      if (historical.homeMode === plan.homeMode) return historical.promise
      return Promise.resolve(createResult(plan.operationId, 'failed', 'INVALID_ARGUMENT'))
    }
    activePlan?.replace()
    const runner = createRunner(plan, options, (operationId) => {
      if (activePlan?.operationId === operationId) activePlan = null
    })
    const promise = runner.start()
    planHistory.set(plan.operationId, { homeMode: plan.homeMode, promise })
    if (!runner.isSettled()) activePlan = {
      cancel: runner.cancel,
      replace: runner.replace,
      operationId: plan.operationId,
      promise,
    }
    return promise
  }

  function cancelNativeDataPlan(operationId) {
    if (!activePlan || activePlan.operationId !== operationId) return false
    activePlan.cancel()
    return true
  }

  function disposeNativeDataPlanService() {
    activePlan?.cancel()
    activePlan = null
    planHistory.clear()
  }

  return Object.freeze({
    cancelNativeDataPlan,
    disposeNativeDataPlanService,
    executeNativeDataPlan,
  })
}

const defaultNativeDataPlanService = createNativeDataPlanService()

export const executeNativeDataPlan = defaultNativeDataPlanService.executeNativeDataPlan
export const cancelNativeDataPlan = defaultNativeDataPlanService.cancelNativeDataPlan
export const disposeNativeDataPlanService = defaultNativeDataPlanService.disposeNativeDataPlanService

export const nativeDataPlanConfig = Object.freeze({
  pollDelayMs: POLL_DELAY_MS,
  pollWindowMs: POLL_WINDOW_MS,
  smsFullCollection: SMS_FULL_COLLECTION,
})
