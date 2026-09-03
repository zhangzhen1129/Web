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

let activePlan = null

function createResult(operationId, status) {
  return Object.freeze({ operationId, status })
}

function isValidPlan(plan) {
  return plan
    && typeof plan.operationId === 'string'
    && plan.operationId.length > 0
    && (plan.homeMode === HOME_MODE.CASH_LOAN || plan.homeMode === HOME_MODE.MULTI_PUSH)
}

function createRunner(plan, options) {
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
    timerId = clock.setTimeout(() => {
      timers.delete(timerId)
      callback()
    }, delay)
    timers.add(timerId)
    return timerId
  }

  function clearTimers() {
    timers.forEach((timerId) => clock.clearTimeout(timerId))
    timers.clear()
    queryState.forEach((item) => { item.timerId = null })
  }

  function detachConsumers() {
    requestIds.forEach((requestId) => bridge.cancelNativeDataCollectionConsumer(requestId))
    requestIds.clear()
  }

  function finish(status) {
    if (settled) return
    settled = true
    clearTimers()
    detachConsumers()
    if (activePlan?.operationId === operationId) activePlan = null
    resolveResult(createResult(operationId, status))
  }

  function fail() {
    finish('failed')
  }

  function completeItem(item) {
    if (settled || states.get(item) === 'success') return
    states.set(item, 'success')
    if ([...states.values()].every((status) => status === 'success')) finish('collected')
  }

  function registerRequest(requestId) {
    if (typeof requestId !== 'string' || requestId.length === 0) {
      fail()
      return false
    }
    requestIds.add(requestId)
    return true
  }

  function dispatchTrigger(invoke, consumeResult) {
    const requestId = invoke(
      (reply) => consumeResult?.(reply),
      { onFailure: fail },
    )
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
    requestId = invoke(
      (reply) => {
        itemState.inFlight = false
        requestIds.delete(requestId)
        if (reply.status === 'SUCCESS') completeItem(item)
        else fail()
      },
      {
        onFailure: () => {
          itemState.inFlight = false
          requestIds.delete(requestId)
          fail()
        },
        onProgress: () => {
          itemState.inFlight = false
          if (!settled && states.get(item) !== 'success') {
            itemState.timerId = trackTimer(() => queryItem(item, invoke), POLL_DELAY_MS)
          }
        },
      },
    )
    if (!registerRequest(requestId)) return
  }

  function startQueries() {
    if (settled) return
    trackTimer(() => finish('timed_out'), POLL_WINDOW_MS)
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
        if (reply.status === 'SUCCESS') completeItem('deviceInfo')
        else fail()
      }),
      () => dispatchTrigger(bridge.queryNativeDevBaseFetchResult, (reply) => {
        if (reply.status === 'SUCCESS') completeItem('deviceBase')
        else fail()
      }),
    ]
    for (const dispatch of triggers) {
      if (!dispatch() || settled) return
    }
    trackTimer(startQueries, POLL_DELAY_MS)
  }

  function start() {
    promise = new Promise((resolve) => { resolveResult = resolve })
    if (plan.homeMode === HOME_MODE.CASH_LOAN) dispatchCashLoan()
    else dispatchMultiPush()
    return promise
  }

  return Object.freeze({
    cancel() {
      finish('canceled')
    },
    operationId,
    isSettled() {
      return settled
    },
    start,
  })
}

export function executeNativeDataPlan(plan, options = {}) {
  if (!isValidPlan(plan)) return Promise.resolve(createResult(plan?.operationId ?? null, 'failed'))
  if (activePlan?.operationId === plan.operationId) return activePlan.promise
  activePlan?.cancel()
  const runner = createRunner(plan, options)
  const promise = runner.start()
  if (!runner.isSettled()) activePlan = { cancel: runner.cancel, operationId: plan.operationId, promise }
  return promise
}

export function cancelNativeDataPlan(operationId) {
  if (!activePlan || activePlan.operationId !== operationId) return false
  activePlan.cancel()
  return true
}

export const nativeDataPlanConfig = Object.freeze({
  pollDelayMs: POLL_DELAY_MS,
  pollWindowMs: POLL_WINDOW_MS,
  smsFullCollection: SMS_FULL_COLLECTION,
})
