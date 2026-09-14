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
    apiHost: 'https://cached.example.test', userId: 'cached-user', mobile: 'cached-mobile', token: 'cached-token', afId: 'cached-af',
    initializeApiHostFromCurrentLocation() { calls.push('apiHost'); return { status: 'retained', errorCode: null } },
    setGlobal(update) { Object.assign(this, update); calls.push(`store:${Object.keys(update).join(',')}`); return true },
  }
  const service = createHomeHostService({
    globalStore: store,
    getNativeAppInfo: request('appInfo'),
    getNativeCachedUserId: request('userId'), getNativeCachedMobile: request('mobile'),
    getNativeCachedToken: request('token'),
    getThirdPartySdkIdentifiers: request('sdk'),
    cancelNativeAppInfoConsumer: (id) => calls.push(`cancelApp:${id}`),
    cancelNativeCachedUserIdConsumer: (id) => calls.push(`cancelUserId:${id}`),
    cancelNativeCachedMobileConsumer: (id) => calls.push(`cancelMobile:${id}`),
    cancelNativeCachedTokenConsumer: (id) => calls.push(`cancelToken:${id}`),
    cancelThirdPartySdkIdentifiersConsumer: (id) => calls.push(`cancelSdk:${id}`),
    requestNativeOneClickPermissions(permissions, consumer, options) {
      calls.push(`permissions:${permissions.join(',')}`)
      pending.permissions = { consumer, options, requestId: `permission-${++sequence}` }
      return pending.permissions.requestId
    },
    cancelNativeOneClickPermissionConsumer: (id) => calls.push(`cancelPermission:${id}`),
    showNativeLoading: () => calls.push('showLoading'), hideNativeLoading: () => calls.push('hideLoading'),
    ...overrides,
  })
  return { calls, pending, service, store }
}

async function waitForPending(harness, name) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (harness.pending[name]) return harness.pending[name]
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`Missing pending request: ${name}`)
}

async function resolveInitialization(harness) {
  const appInfo = await waitForPending(harness, 'appInfo')
  appInfo.consumer({
    status: 'success', appName: 'App', packageName: 'pkg', packageId: 'id',
    appVersion: '1', appVersionName: '1.0', androidId: 'android',
  })
  const userId = await waitForPending(harness, 'userId')
  userId.consumer({ status: 'completed', hit: true, cacheValue: 'native-user' })
  const mobile = await waitForPending(harness, 'mobile')
  mobile.consumer({ status: 'completed', hit: true, cacheValue: 'native-mobile' })
  const token = await waitForPending(harness, 'token')
  token.consumer({ status: 'completed', hit: true, cacheValue: 'native-token' })
  const sdk = await waitForPending(harness, 'sdk')
  sdk.consumer({ status: 'partial_success', afId: '', fbId: '', gaId: '' })
}

test('initializes in fixed order and stores native cached user fields and Token', async () => {
  const harness = createHarness()
  const first = harness.service.initializeHomeHostContext({ initCycleId: 'init-1' })
  const duplicate = harness.service.initializeHomeHostContext({ initCycleId: 'init-1' })
  assert.equal(first, duplicate)
  assert.deepEqual(harness.calls, ['apiHost', 'appInfo'])
  await resolveInitialization(harness)
  const result = await first
  assert.deepEqual(harness.calls.slice(0, 10), [
    'apiHost',
    'appInfo',
    'store:appName,packageName,packageId,appVersion,appVersionName,androidId',
    'userId',
    'store:userId',
    'mobile',
    'store:mobile',
    'token',
    'store:token',
    'sdk',
  ])
  assert.equal(result.status, 'completed')
  assert.deepEqual(result.steps.token, { status: 'updated', errorCode: null })
  assert.deepEqual(result.steps.userId, { status: 'updated', errorCode: null })
  assert.deepEqual(result.steps.mobile, { status: 'updated', errorCode: null })
  assert.deepEqual(result.steps.sdkIdentifiers, { status: 'retained', errorCode: null })
  assert.equal(harness.store.token, 'native-token')
  assert.equal(harness.store.userId, 'native-user')
  assert.equal(harness.store.mobile, 'native-mobile')
  const serializedResult = JSON.stringify(result)
  assert.equal(serializedResult.includes(harness.store.token), false)
  assert.equal(serializedResult.includes(harness.store.userId), false)
  assert.equal(serializedResult.includes(harness.store.mobile), false)
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
  assert.equal(canceled.steps.userId.status, 'canceled')
  assert.equal(canceled.steps.mobile.status, 'canceled')
  assert.equal(canceled.steps.token.status, 'canceled')
  assert.equal(canceled.steps.sdkIdentifiers.status, 'canceled')
  assert.equal(harness.calls.includes('token'), false)
  harness.service.initializeHomeHostContext({ initCycleId: 'init-2' })
  assert.equal(harness.calls.filter((call) => call === 'appInfo').length, 2)
})

test('continues after a userId failure and reports independent user field states', async () => {
  const harness = createHarness()
  const initialization = harness.service.initializeHomeHostContext({ initCycleId: 'user-failure' })
  const appInfo = await waitForPending(harness, 'appInfo')
  appInfo.consumer({
    status: 'success', appName: 'App', packageName: 'pkg', packageId: 'id',
    appVersion: '1', appVersionName: '1.0', androidId: 'android',
  })
  const userId = await waitForPending(harness, 'userId')
  userId.options.onFailure({ code: 'BRIDGE_UNAVAILABLE' })
  const mobile = await waitForPending(harness, 'mobile')
  mobile.consumer({ status: 'completed', hit: false, cacheValue: '' })
  const token = await waitForPending(harness, 'token')
  token.consumer({ status: 'completed', hit: false, cacheValue: '' })
  const sdk = await waitForPending(harness, 'sdk')
  sdk.consumer({ status: 'partial_success', afId: '', fbId: '', gaId: '' })

  const result = await initialization
  assert.deepEqual(result.steps.userId, { status: 'failed', errorCode: 'BRIDGE_UNAVAILABLE' })
  assert.deepEqual(result.steps.mobile, { status: 'retained', errorCode: null })
  assert.equal(result.status, 'partial_success')
  assert.equal(harness.calls.includes('mobile'), true)
  assert.equal(harness.calls.includes('token'), true)
})

test('reports userId persistence failure and continues with mobile', async () => {
  const harness = createHarness({
    globalStore: {
      apiHost: 'https://cached.example.test',
      userId: 'cached-user',
      mobile: 'cached-mobile',
      token: 'cached-token',
      afId: 'cached-af',
      initializeApiHostFromCurrentLocation() { return { status: 'retained', errorCode: null } },
      setGlobal(update) {
        Object.assign(this, update)
        return !Object.hasOwn(update, 'userId')
      },
    },
  })
  const initialization = harness.service.initializeHomeHostContext({ initCycleId: 'persist-failure' })
  const appInfo = await waitForPending(harness, 'appInfo')
  appInfo.consumer({
    status: 'success', appName: 'App', packageName: 'pkg', packageId: 'id',
    appVersion: '1', appVersionName: '1.0', androidId: 'android',
  })
  const userId = await waitForPending(harness, 'userId')
  userId.consumer({ status: 'completed', hit: true, cacheValue: 'native-user' })
  const mobile = await waitForPending(harness, 'mobile')
  mobile.consumer({ status: 'completed', hit: true, cacheValue: 'native-mobile' })
  const token = await waitForPending(harness, 'token')
  token.consumer({ status: 'completed', hit: false, cacheValue: '' })
  const sdk = await waitForPending(harness, 'sdk')
  sdk.consumer({ status: 'partial_success', afId: '', fbId: '', gaId: '' })

  const result = await initialization
  assert.deepEqual(result.steps.userId, { status: 'failed', errorCode: 'STORE_UPDATE_FAILED' })
  assert.deepEqual(result.steps.mobile, { status: 'updated', errorCode: null })
  assert.equal(result.status, 'partial_success')
})

test('dispose detaches the active userId consumer and ignores its late callback', async () => {
  const harness = createHarness()
  const initialization = harness.service.initializeHomeHostContext({ initCycleId: 'dispose-user' })
  const appInfo = await waitForPending(harness, 'appInfo')
  appInfo.consumer({
    status: 'success', appName: 'App', packageName: 'pkg', packageId: 'id',
    appVersion: '1', appVersionName: '1.0', androidId: 'android',
  })
  const userId = await waitForPending(harness, 'userId')
  harness.service.disposeHomeHostInit({ initCycleId: 'dispose-user' })
  userId.consumer({ status: 'completed', hit: true, cacheValue: 'late-user' })

  const result = await initialization
  assert.equal(result.status, 'canceled')
  assert.equal(result.steps.userId.status, 'canceled')
  assert.equal(harness.store.userId, 'cached-user')
  assert.equal(harness.calls.filter((call) => call === `cancelUserId:${userId.requestId}`).length, 1)
  assert.equal(harness.calls.includes('mobile'), false)
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

test('permissions use the fixed set, deduplicate, and replace old operations', async () => {
  const harness = createHarness()
  const permission = harness.service.requestHomePermissions({ operationId: 'op-1' })
  assert.equal(permission, harness.service.requestHomePermissions({ operationId: 'op-1' }))
  assert.equal(harness.calls[0], `permissions:${HOME_HOST_PERMISSIONS.join(',')}`)
  harness.pending.permissions.consumer({ status: 'all_granted' })
  assert.deepEqual(await permission, { operationId: 'op-1', status: 'granted', errorCode: null })
  assert.equal('executeNativeDataPlan' in harness.service, false)

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
