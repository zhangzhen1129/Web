import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cancelNativeDataPlan,
  createNativeDataPlanService,
  executeNativeDataPlan,
  nativeDataPlanConfig,
} from './nativeDataPlan.js'

function createClock() {
  const timers = []
  return {
    clearTimeout(timer) {
      timer.canceled = true
    },
    runDelay(delay) {
      const index = timers.findIndex((timer) => timer.delay === delay && !timer.canceled)
      if (index < 0) return
      const [timer] = timers.splice(index, 1)
      timer.callback()
    },
    runNext() {
      const timer = timers.shift()
      if (timer && !timer.canceled) timer.callback()
    },
    runUntilEmpty() {
      while (timers.length > 0) this.runNext()
    },
    setTimeout(callback, delay) {
      const timer = { callback, canceled: false, delay }
      timers.push(timer)
      return timer
    },
    timers,
  }
}

function createBridge() {
  const calls = []
  const consumers = new Map()
  const canceledRequestIds = []
  let sequence = 0
  function invoke(name) {
    return (consumer, options = {}) => {
      const requestId = `${name}-${++sequence}`
      calls.push({ name, options, requestId })
      consumers.set(requestId, { consumer, options })
      return requestId
    }
  }
  return {
    calls,
    canceledRequestIds,
    cancelNativeDataCollectionConsumer(requestId) {
      canceledRequestIds.push(requestId)
      consumers.delete(requestId)
      return true
    },
    fail(requestId) {
      consumers.get(requestId)?.options.onFailure?.({ capability: 'test', code: 'INVALID_CALLBACK' })
    },
    progress(requestId) {
      consumers.get(requestId)?.options.onProgress?.({ status: 'IN_PROGRESS' })
    },
    resolve(requestId, status = 'SUCCESS') {
      consumers.get(requestId)?.consumer({ status })
    },
    queryNativeAppListFetchResult: invoke('queryAppListFetchResult'),
    queryNativeCallFetchResult: invoke('queryCallLogFetchResult'),
    queryNativeDevBaseFetchResult: invoke('fetchDeviceBase'),
    queryNativeDeviceFetchResult: invoke('fetchDeviceInfo'),
    queryNativeSmsFetchResult: invoke('querySmsFetchResult'),
    triggerNativeAppList: invoke('triggerAppListFetch'),
    triggerNativeCallFetch: invoke('triggerCallLogFetch'),
    triggerNativeSmsFetch(skipKeywordFilter, consumer, options) {
      const requestId = `triggerSmsFetch-${++sequence}`
      calls.push({ name: 'triggerSmsFetch', options, requestId, skipKeywordFilter })
      consumers.set(requestId, { consumer, options })
      return requestId
    },
  }
}

function findCall(bridge, name) {
  return bridge.calls.find((call) => call.name === name)
}

test('cash loan dispatches the five triggers once with full SMS collection and no queries', async () => {
  const bridge = createBridge()
  const result = await executeNativeDataPlan(
    { homeMode: 'cash_loan', operationId: 'cash-operation' },
    { bridge, clock: createClock() },
  )
  assert.deepEqual(result, { operationId: 'cash-operation', status: 'trigger_dispatched', errorCode: null })
  assert.deepEqual(bridge.calls.map((call) => call.name), [
    'triggerAppListFetch',
    'triggerSmsFetch',
    'triggerCallLogFetch',
    'fetchDeviceInfo',
    'fetchDeviceBase',
  ])
  assert.equal(findCall(bridge, 'triggerSmsFetch').skipKeywordFilter, true)
  assert.equal(nativeDataPlanConfig.smsFullCollection, true)
})

test('multi push waits two seconds, polls only three query capabilities, and aggregates five successes', async () => {
  const bridge = createBridge()
  const clock = createClock()
  const resultPromise = executeNativeDataPlan(
    { homeMode: 'multi_push', operationId: 'multi-operation' },
    { bridge, clock },
  )
  assert.equal(bridge.calls.length, 5)
  const deviceInfo = findCall(bridge, 'fetchDeviceInfo')
  const deviceBase = findCall(bridge, 'fetchDeviceBase')
  bridge.resolve(deviceInfo.requestId)
  bridge.resolve(deviceBase.requestId)
  clock.runDelay(nativeDataPlanConfig.pollDelayMs)
  const queries = bridge.calls.slice(5)
  assert.deepEqual(queries.map((call) => call.name), [
    'queryAppListFetchResult', 'querySmsFetchResult', 'queryCallLogFetchResult'])
  assert.equal(clock.timers[0].delay, nativeDataPlanConfig.pollWindowMs)
  const initialQueries = queries.slice(0, 3)
  initialQueries.forEach((call) => bridge.progress(call.requestId))
  clock.runDelay(nativeDataPlanConfig.pollDelayMs)
  clock.runDelay(nativeDataPlanConfig.pollDelayMs)
  clock.runDelay(nativeDataPlanConfig.pollDelayMs)
  const secondQueries = bridge.calls.slice(-3)
  secondQueries.forEach((call) => bridge.resolve(call.requestId))
  assert.deepEqual(await resultPromise, { operationId: 'multi-operation', status: 'collected', errorCode: null })
  assert.ok(initialQueries.every((call) => !bridge.canceledRequestIds.includes(call.requestId)))
})

test('matching Bridge failure, cancellation, replacement, and timeout settle semantic results without payloads', async () => {
  const bridge = createBridge()
  const clock = createClock()
  const failed = executeNativeDataPlan({ homeMode: 'multi_push', operationId: 'failed-operation' }, { bridge, clock })
  bridge.fail(findCall(bridge, 'fetchDeviceInfo').requestId)
  assert.deepEqual(await failed, { operationId: 'failed-operation', status: 'failed', errorCode: 'INVALID_CALLBACK' })

  const terminalBridge = createBridge()
  const terminalFailure = executeNativeDataPlan(
    { homeMode: 'multi_push', operationId: 'terminal-failure-operation' },
    { bridge: terminalBridge, clock: createClock() },
  )
  terminalBridge.resolve(findCall(terminalBridge, 'fetchDeviceBase').requestId, 'ERR_FETCH_FAILED')
  assert.deepEqual(await terminalFailure, { operationId: 'terminal-failure-operation', status: 'failed', errorCode: 'NATIVE_FAILED' })

  const canceled = executeNativeDataPlan({ homeMode: 'multi_push', operationId: 'cancel-operation' }, { bridge: createBridge(), clock: createClock() })
  assert.equal(cancelNativeDataPlan('cancel-operation'), true)
  assert.deepEqual(await canceled, { operationId: 'cancel-operation', status: 'canceled', errorCode: 'CANCELED' })

  const timeoutBridge = createBridge()
  const timeoutClock = createClock()
  const timedOut = executeNativeDataPlan({ homeMode: 'multi_push', operationId: 'timeout-operation' }, { bridge: timeoutBridge, clock: timeoutClock })
  timeoutClock.runDelay(nativeDataPlanConfig.pollDelayMs)
  timeoutClock.runDelay(nativeDataPlanConfig.pollWindowMs)
  assert.deepEqual(await timedOut, { operationId: 'timeout-operation', status: 'timed_out', errorCode: 'TIMEOUT' })

  const replaced = executeNativeDataPlan(
    { homeMode: 'multi_push', operationId: 'replaced-operation' },
    { bridge: createBridge(), clock: createClock() },
  )
  const replacement = executeNativeDataPlan(
    { homeMode: 'cash_loan', operationId: 'replacement-operation' },
    { bridge: createBridge(), clock: createClock() },
  )
  assert.deepEqual(await replaced, { operationId: 'replaced-operation', status: 'canceled', errorCode: 'REPLACED' })
  assert.deepEqual(await replacement, { operationId: 'replacement-operation', status: 'trigger_dispatched', errorCode: null })
})

test('invalid plans fail without invoking the Bridge', async () => {
  assert.deepEqual(await executeNativeDataPlan({ homeMode: 'unsupported', operationId: 'invalid-operation' }), {
    operationId: null,
    status: 'failed',
    errorCode: 'INVALID_ARGUMENT',
  })
})

test('rejects malformed identifiers and prevents changing an operation mode', async () => {
  assert.deepEqual(await executeNativeDataPlan({ homeMode: 'cash_loan', operationId: 'bad id' }), {
    operationId: null,
    status: 'failed',
    errorCode: 'INVALID_ARGUMENT',
  })
  const bridge = createBridge()
  const clock = createClock()
  const first = executeNativeDataPlan({ homeMode: 'cash_loan', operationId: 'stable-op' }, { bridge, clock })
  const mismatch = await executeNativeDataPlan({ homeMode: 'multi_push', operationId: 'stable-op' }, { bridge, clock })
  assert.deepEqual(mismatch, { operationId: 'stable-op', status: 'failed', errorCode: 'INVALID_ARGUMENT' })
  assert.deepEqual(await first, { operationId: 'stable-op', status: 'trigger_dispatched', errorCode: null })
})

test('reuses the exact promise and stops dispatch after a synchronous Bridge failure', async () => {
  const bridge = createBridge()
  bridge.triggerNativeCallFetch = (consumer, options) => {
    bridge.calls.push({ name: 'triggerCallLogFetch' })
    options.onFailure({ code: 'BRIDGE_NOT_ACCEPTED', capability: 'triggerCallLogFetch' })
    return null
  }
  const first = executeNativeDataPlan({ homeMode: 'cash_loan', operationId: 'failure-stop' }, { bridge, clock: createClock() })
  const repeated = executeNativeDataPlan({ homeMode: 'cash_loan', operationId: 'failure-stop' }, { bridge, clock: createClock() })
  assert.equal(first, repeated)
  assert.deepEqual(await first, {
    operationId: 'failure-stop',
    status: 'failed',
    errorCode: 'BRIDGE_NOT_ACCEPTED',
  })
  assert.deepEqual(bridge.calls.map((call) => call.name), [
    'triggerAppListFetch',
    'triggerSmsFetch',
    'triggerCallLogFetch',
  ])
  assert.equal(bridge.canceledRequestIds.length, 2)
})

test('cancellation clears timers and detaches every pending consumer once', async () => {
  const bridge = createBridge()
  const clock = createClock()
  const result = executeNativeDataPlan(
    { homeMode: 'multi_push', operationId: 'cancel-cleanup' },
    { bridge, clock },
  )
  assert.equal(cancelNativeDataPlan('cancel-cleanup'), true)
  assert.equal(cancelNativeDataPlan('cancel-cleanup'), false)
  assert.deepEqual(await result, {
    operationId: 'cancel-cleanup',
    status: 'canceled',
    errorCode: 'CANCELED',
  })
  assert.equal(bridge.canceledRequestIds.length, 5)
  assert.ok(clock.timers.every((timer) => timer.canceled))
})

test('unexpected local failures settle without rejecting', async () => {
  const bridge = createBridge()
  const result = await executeNativeDataPlan(
    { homeMode: 'multi_push', operationId: 'internal-failure' },
    {
      bridge,
      clock: {
        clearTimeout() {},
        setTimeout() {
          throw new Error('clock unavailable')
        },
      },
    },
  )
  assert.deepEqual(result, {
    operationId: 'internal-failure',
    status: 'failed',
    errorCode: 'INTERNAL_FAILED',
  })
})

test('service disposal cancels pending work and releases operation identifiers', async () => {
  const service = createNativeDataPlanService()
  const first = service.executeNativeDataPlan(
    { homeMode: 'multi_push', operationId: 'scope-operation' },
    { bridge: createBridge(), clock: createClock() },
  )
  service.disposeNativeDataPlanService()
  assert.deepEqual(await first, {
    operationId: 'scope-operation',
    status: 'canceled',
    errorCode: 'CANCELED',
  })
  const second = await service.executeNativeDataPlan(
    { homeMode: 'cash_loan', operationId: 'scope-operation' },
    { bridge: createBridge(), clock: createClock() },
  )
  assert.deepEqual(second, {
    operationId: 'scope-operation',
    status: 'trigger_dispatched',
    errorCode: null,
  })
})
