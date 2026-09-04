import assert from 'node:assert/strict'
import test from 'node:test'
import { createHomeHostService, HOME_HOST_PERMISSIONS } from './homeHostService.js'

function createHarness(overrides = {}) {
  const calls = []
  const pending = {}
  let sequence = 0
  const request = (name) => (consumer, options) => {
    calls.push(name)
    const requestId = `${name}-${++sequence}`
    pending[name] = { consumer, options, requestId }
    return requestId
  }
  const store = {
    apiHost: 'https://cached.example.test', token: 'cached-token', afId: 'cached-af',
    initializeApiHostFromCurrentLocation() { calls.push('apiHost'); return { status: 'retained', errorCode: null } },
    setGlobal(update) { Object.assign(this, update); calls.push(`store:${Object.keys(update).join(',')}`); return true },
  }
  const nativeDataPlanService = {
    cancelNativeDataPlan(operationId) { calls.push(`cancelPlan:${operationId}`); return true },
    disposeNativeDataPlanService() { calls.push('disposePlan') },
    executeNativeDataPlan(plan) { calls.push(`plan:${plan.operationId}:${plan.homeMode}`); return Promise.resolve({ operationId: plan.operationId, status: 'trigger_dispatched', errorCode: null }) },
  }
  const service = createHomeHostService({
    globalStore: store,
    getNativeAppInfo: request('appInfo'), getNativeCachedToken: request('token'),
    getThirdPartySdkIdentifiers: request('sdk'),
    cancelNativeAppInfoConsumer: (id) => calls.push(`cancelApp:${id}`),
    cancelNativeCachedTokenConsumer: (id) => calls.push(`cancelToken:${id}`),
    cancelThirdPartySdkIdentifiersConsumer: (id) => calls.push(`cancelSdk:${id}`),
    requestNativeOneClickPermissions(permissions, consumer, options) {
      calls.push(`permissions:${permissions.join(',')}`)
      pending.permissions = { consumer, options, requestId: `permission-${++sequence}` }
      return pending.permissions.requestId
    },
    cancelNativeOneClickPermissionConsumer: (id) => calls.push(`cancelPermission:${id}`),
    showNativeLoading: () => calls.push('showLoading'), hideNativeLoading: () => calls.push('hideLoading'),
    nativeDataPlanService,
    ...overrides,
  })
  return { calls, pending, service, store }
}

async function resolveInitialization(harness) {
  harness.pending.appInfo.consumer({
    status: 'success', appName: 'App', packageName: 'pkg', packageId: 'id',
    appVersion: '1', appVersionName: '1.0', androidId: 'android',
  })
  await Promise.resolve()
  harness.pending.token.consumer({ status: 'completed', hit: false, cacheValue: '' })
  await Promise.resolve()
  harness.pending.sdk.consumer({ status: 'partial_success', afId: '', fbId: '', gaId: '' })
}

test('initializes in fixed order, reuses one promise, and returns retained values without originals', async () => {
  const harness = createHarness()
  const first = harness.service.initializeHomeHostContext({ initCycleId: 'init-1' })
  const duplicate = harness.service.initializeHomeHostContext({ initCycleId: 'init-1' })
  assert.equal(first, duplicate)
  assert.deepEqual(harness.calls, ['apiHost', 'appInfo'])
  await resolveInitialization(harness)
  const result = await first
  assert.deepEqual(harness.calls.slice(0, 5), ['apiHost', 'appInfo', 'store:appName,packageName,packageId,appVersion,appVersionName,androidId', 'token', 'sdk'])
  assert.equal(result.status, 'completed')
  assert.deepEqual(result.steps.token, { status: 'retained', errorCode: null })
  assert.deepEqual(result.steps.sdkIdentifiers, { status: 'retained', errorCode: null })
  assert.equal(JSON.stringify(result).includes('cached-token'), false)
})

test('rejects malformed and concurrent init ids without additional Bridge calls', async () => {
  const harness = createHarness()
  harness.service.initializeHomeHostContext({ initCycleId: 'init-1' })
  const result = await harness.service.initializeHomeHostContext({ initCycleId: 'init 2' })
  const concurrent = await harness.service.initializeHomeHostContext({ initCycleId: 'init-2' })
  assert.equal(result.initCycleId, null)
  assert.equal(concurrent.status, 'failed')
  assert.deepEqual(harness.calls, ['apiHost', 'appInfo'])
})

test('uses the controlled api host initialization result without inferring store values', async () => {
  const harness = createHarness({
    globalStore: {
      initializeApiHostFromCurrentLocation() { return { status: 'failed', errorCode: 'CACHE_ACCESS_FAILED' } },
      setGlobal() { return true },
    },
  })
  const resultPromise = harness.service.initializeHomeHostContext({ initCycleId: 'api-host-failure' })
  await resolveInitialization(harness)
  const result = await resultPromise
  assert.deepEqual(result.steps.apiHost, { status: 'failed', errorCode: 'CACHE_ACCESS_FAILED' })
  assert.equal(result.status, 'partial_success')
})

test('dispose cancels current consumer, short-circuits later steps, and permits a fresh id', async () => {
  const harness = createHarness()
  const first = harness.service.initializeHomeHostContext({ initCycleId: 'init-1' })
  harness.service.disposeHomeHostInit({ initCycleId: 'init-1' })
  const canceled = await first
  assert.equal(canceled.status, 'canceled')
  assert.equal(canceled.steps.appInfo.status, 'canceled')
  assert.equal(canceled.steps.token.status, 'canceled')
  assert.equal(canceled.steps.sdkIdentifiers.status, 'canceled')
  assert.equal(harness.calls.includes('token'), false)
  harness.service.initializeHomeHostContext({ initCycleId: 'init-2' })
  assert.equal(harness.calls.filter((call) => call === 'appInfo').length, 2)
})

test('dispose releases operation and loading histories for the next scope', async () => {
  const harness = createHarness()
  harness.service.initializeHomeHostContext({ initCycleId: 'scope-1' })
  harness.service.showHomeHostLoading({ loadingCycleId: 'load-1' })
  const firstPermission = harness.service.requestHomePermissions({ operationId: 'op-1' })
  harness.service.disposeHomeHostInit({ initCycleId: 'scope-1' })
  assert.deepEqual(await firstPermission, { operationId: 'op-1', status: 'canceled', errorCode: 'CANCELED' })

  harness.service.initializeHomeHostContext({ initCycleId: 'scope-2' })
  harness.service.showHomeHostLoading({ loadingCycleId: 'load-1' })
  const secondPermission = harness.service.requestHomePermissions({ operationId: 'op-1' })
  assert.notEqual(secondPermission, firstPermission)
  assert.equal(harness.calls.filter((call) => call === 'showLoading').length, 2)
  assert.equal(harness.calls.filter((call) => call.startsWith('permissions:')).length, 2)
})

test('loading cycles show once, replace in hide-show order, and ignore late hides', () => {
  const harness = createHarness()
  harness.service.showHomeHostLoading({ loadingCycleId: 'load-1' })
  harness.service.showHomeHostLoading({ loadingCycleId: 'load-1' })
  harness.service.showHomeHostLoading({ loadingCycleId: 'load-2' })
  harness.service.hideHomeHostLoading({ loadingCycleId: 'load-1' })
  harness.service.hideHomeHostLoading({ loadingCycleId: 'load-2' })
  harness.service.showHomeHostLoading({ loadingCycleId: 'load-1' })
  assert.deepEqual(harness.calls, ['showLoading', 'hideLoading', 'showLoading', 'hideLoading'])
})

test('permissions use the fixed set, deduplicate, gate plans, and replace old operations', async () => {
  const harness = createHarness()
  const permission = harness.service.requestHomePermissions({ operationId: 'op-1' })
  assert.equal(permission, harness.service.requestHomePermissions({ operationId: 'op-1' }))
  assert.equal(harness.calls[0], `permissions:${HOME_HOST_PERMISSIONS.join(',')}`)
  assert.deepEqual(await harness.service.executeNativeDataPlan({ operationId: 'op-1', homeMode: 'cash_loan' }), {
    operationId: 'op-1', status: 'failed', errorCode: 'INVALID_ARGUMENT',
  })
  harness.pending.permissions.consumer({ status: 'all_granted' })
  assert.deepEqual(await permission, { operationId: 'op-1', status: 'granted', errorCode: null })
  const plan = harness.service.executeNativeDataPlan({ operationId: 'op-1', homeMode: 'cash_loan' })
  assert.equal(plan, harness.service.executeNativeDataPlan({ operationId: 'op-1', homeMode: 'cash_loan' }))
  assert.equal((await plan).status, 'trigger_dispatched')
  const changed = await harness.service.executeNativeDataPlan({ operationId: 'op-1', homeMode: 'multi_push' })
  assert.equal(changed.errorCode, 'INVALID_ARGUMENT')

  const old = harness.service.requestHomePermissions({ operationId: 'op-2' })
  harness.service.requestHomePermissions({ operationId: 'op-3' })
  assert.deepEqual(await old, { operationId: 'op-2', status: 'canceled', errorCode: 'REPLACED' })
})

test('permission failures map exactly and cancellation detaches the consumer', async () => {
  const harness = createHarness()
  const failed = harness.service.requestHomePermissions({ operationId: 'failure-1' })
  harness.pending.permissions.options.onFailure({ code: 'BRIDGE_UNAVAILABLE' })
  assert.deepEqual(await failed, { operationId: 'failure-1', status: 'failed', errorCode: 'BRIDGE_UNAVAILABLE' })
  const canceled = harness.service.requestHomePermissions({ operationId: 'cancel-1' })
  harness.service.cancelHomeHostOperation({ operationId: 'cancel-1' })
  assert.deepEqual(await canceled, { operationId: 'cancel-1', status: 'canceled', errorCode: 'CANCELED' })
  assert.equal(harness.calls.some((call) => call.startsWith('cancelPermission:')), true)
})

test('replacing a pending data plan settles the old semantic result as replaced', async () => {
  let resolvePlan
  const nativeDataPlanService = {
    cancelNativeDataPlan() { return true },
    disposeNativeDataPlanService() {},
    executeNativeDataPlan() { return new Promise((resolve) => { resolvePlan = resolve }) },
  }
  const harness = createHarness({ nativeDataPlanService })
  const oldPlan = harness.service.executeNativeDataPlan({ operationId: 'plan-1', homeMode: 'multi_push' })
  harness.service.requestHomePermissions({ operationId: 'plan-2' })
  assert.deepEqual(await oldPlan, { operationId: 'plan-1', status: 'canceled', errorCode: 'REPLACED' })
  resolvePlan({ operationId: 'plan-1', status: 'collected', errorCode: null })
  await Promise.resolve()
})
