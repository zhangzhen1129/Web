import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import {
  GLOBAL_API_HOST_CACHE_KEY,
  GLOBAL_API_HOST_CACHE_VERSION,
  GLOBAL_APP_INFO_CACHE_KEYS,
  GLOBAL_APP_INFO_CACHE_VERSION,
  GLOBAL_MULTI_PUSH_CACHE_KEY,
  GLOBAL_MULTI_PUSH_CACHE_VERSION,
  GLOBAL_TOKEN_CACHE_KEY,
  GLOBAL_TOKEN_CACHE_VERSION,
  GLOBAL_THIRD_PARTY_SDK_CACHE_KEYS,
  GLOBAL_THIRD_PARTY_SDK_CACHE_VERSION,
  useGlobalStore,
} from './globalStore.js'

class MemoryStorage {
  #entries = new Map()
  get length() { return this.#entries.size }
  key(index) { return [...this.#entries.keys()][index] ?? null }
  getItem(key) { return this.#entries.get(key) ?? null }
  setItem(key, value) { this.#entries.set(key, String(value)) }
  removeItem(key) { this.#entries.delete(key) }
}

test.beforeEach(() => {
  setActivePinia(createPinia())
  globalThis.window = { localStorage: new MemoryStorage(), location: { search: '', hash: '' } }
})
test.afterEach(() => { delete globalThis.window })

test('updates and hydrates authorized global fields through the cache adapter', () => {
  const store = useGlobalStore()
  assert.equal(store.setGlobal({ token: 'redacted-token' }), true)
  assert.equal(store.setGlobal({ apiHost: 'https://api.example.test/' }), true)
  const appInfo = {
    appName: 'PlataRap',
    packageName: 'PlataRap',
    packageId: 'com.platarap.app',
    appVersion: '42',
    appVersionName: '1.2.0',
    androidId: 'redacted-android-id',
  }
  assert.equal(store.setGlobal(appInfo), true)
  const sdkIdentifiers = {
    afId: 'redacted-apps-flyer-id',
    fbId: 'redacted-firebase-id',
    gaId: 'redacted-advertising-id',
  }
  assert.equal(store.setGlobal(sdkIdentifiers), true)
  assert.equal(store.token, 'redacted-token')
  assert.equal(store.apiHost, 'https://api.example.test')
  assert.equal(store.setGlobal({ isMultiPush: true }), true)
  assert.equal(store.isMultiPush, true)
  assert.deepEqual(JSON.parse(window.localStorage.getItem('DineroPro:global:is-multi-push')), { version: GLOBAL_MULTI_PUSH_CACHE_VERSION, value: true })
  assert.deepEqual(Object.fromEntries(Object.keys(appInfo).map((field) => [field, store[field]])), appInfo)
  assert.deepEqual(Object.fromEntries(Object.keys(sdkIdentifiers).map((field) => [field, store[field]])), sdkIdentifiers)
  assert.deepEqual(JSON.parse(window.localStorage.getItem('DineroPro:global:token')), { version: GLOBAL_TOKEN_CACHE_VERSION, value: 'redacted-token' })
  assert.deepEqual(JSON.parse(window.localStorage.getItem('DineroPro:global:api-host')), { version: GLOBAL_API_HOST_CACHE_VERSION, value: 'https://api.example.test' })
  for (const [field, key] of Object.entries(GLOBAL_APP_INFO_CACHE_KEYS)) {
    assert.deepEqual(JSON.parse(window.localStorage.getItem(`DineroPro:${key}`)), { version: GLOBAL_APP_INFO_CACHE_VERSION, value: appInfo[field] })
  }
  for (const [field, key] of Object.entries(GLOBAL_THIRD_PARTY_SDK_CACHE_KEYS)) {
    assert.deepEqual(JSON.parse(window.localStorage.getItem(`DineroPro:${key}`)), { version: GLOBAL_THIRD_PARTY_SDK_CACHE_VERSION, value: sdkIdentifiers[field] })
  }
  store.$reset()
  assert.equal(store.hydrateGlobal(), 'redacted-token')
  assert.deepEqual(store.initializeApiHostFromCurrentLocation(), { status: 'retained', errorCode: null })
  assert.equal(store.isMultiPush, true)
  assert.equal(store.apiHost, 'https://api.example.test')
  assert.deepEqual(Object.fromEntries(Object.keys(appInfo).map((field) => [field, store[field]])), appInfo)
  assert.deepEqual(Object.fromEntries(Object.keys(sdkIdentifiers).map((field) => [field, store[field]])), sdkIdentifiers)
  assert.equal(GLOBAL_TOKEN_CACHE_KEY, 'global:token')
  assert.equal(GLOBAL_API_HOST_CACHE_KEY, 'global:api-host')
})

test('rejects unknown, unresolved, and invalid authorized fields', () => {
  const store = useGlobalStore()
  assert.equal(store.setGlobal({ unknown: true }), false)
  assert.equal(store.setGlobal({ userId: 'unconfirmed-user' }), false)
  assert.equal(store.setGlobal({ afId: '' }), false)
  assert.equal(store.setGlobal({ fbId: 123 }), false)
  assert.equal(store.setGlobal({ appVersionName: '' }), false)
  assert.equal(store.setGlobal({ token: '' }), false)
  assert.equal(store.setGlobal({ apiHost: 'http://api.example.test' }), false)
  assert.equal(store.setGlobal({ apiHost: 'https://user:secret@api.example.test' }), false)
  assert.equal(store.setGlobal({ isMultiPush: 'true' }), false)
  assert.equal(store.token, null)
  assert.equal(store.apiHost, null)
  assert.equal(store.isMultiPush, false)
  assert.equal(store.userId, null)
  assert.equal(store.isMultiPush, false)
})

test('prefers a valid launch URL apiHost over the cached value', () => {
  const store = useGlobalStore()
  assert.equal(store.setGlobal({ apiHost: 'https://cached.example.test' }), true)
  window.location.search = '?apiHost=https%3A%2F%2Flaunch.example.test%2F'

  store.$reset()
  store.hydrateGlobal()
  store.initializeApiHostFromCurrentLocation()

  assert.equal(store.apiHost, 'https://launch.example.test')
  assert.deepEqual(JSON.parse(window.localStorage.getItem('DineroPro:global:api-host')), {
    version: GLOBAL_API_HOST_CACHE_VERSION,
    value: 'https://launch.example.test',
  })
})

test('reads hash route apiHost and preserves valid cache when the launch value is invalid', () => {
  const store = useGlobalStore()
  assert.equal(store.setGlobal({ apiHost: 'https://cached.example.test' }), true)
  window.location.hash = '#/home?apiHost=https%3A%2F%2Fhash.example.test'
  store.$reset()
  store.hydrateGlobal()
  store.initializeApiHostFromCurrentLocation()
  assert.equal(store.apiHost, 'https://hash.example.test')

  window.location.hash = '#/home?apiHost=javascript%3Aalert(1)'
  store.$reset()
  store.hydrateGlobal()
  store.initializeApiHostFromCurrentLocation()
  assert.equal(store.apiHost, 'https://hash.example.test')
})

test('initializes apiHost from current URL with controlled semantic results', () => {
  const store = useGlobalStore()
  assert.deepEqual(store.initializeApiHostFromCurrentLocation(), { status: 'not_found', errorCode: null })

  assert.equal(store.setGlobal({ apiHost: 'https://cached.example.test' }), true)
  window.location.search = '?apiHost=javascript%3Aalert(1)'
  assert.deepEqual(store.initializeApiHostFromCurrentLocation(), { status: 'retained', errorCode: null })
  assert.equal(store.apiHost, 'https://cached.example.test')

  window.location.search = '?apiHost=https%3A%2F%2Flaunch.example.test%2F'
  assert.deepEqual(store.initializeApiHostFromCurrentLocation(), { status: 'updated', errorCode: null })
  assert.equal(store.apiHost, 'https://launch.example.test')

  window.location.search = ''
  store.$reset()
  assert.deepEqual(store.initializeApiHostFromCurrentLocation(), { status: 'retained', errorCode: null })
  assert.equal(store.apiHost, 'https://launch.example.test')
})

test('reports apiHost cache access and Store update failures without losing the old value', () => {
  const store = useGlobalStore()
  assert.equal(store.setGlobal({ apiHost: 'https://cached.example.test' }), true)

  window.localStorage.getItem = () => { throw new Error('read denied') }
  assert.deepEqual(store.initializeApiHostFromCurrentLocation(), {
    status: 'failed',
    errorCode: 'CACHE_ACCESS_FAILED',
  })
  assert.equal(store.apiHost, 'https://cached.example.test')

  window.localStorage.getItem = MemoryStorage.prototype.getItem
  window.localStorage.setItem = () => { throw new Error('quota exceeded') }
  window.location.search = '?apiHost=https%3A%2F%2Flaunch.example.test'
  assert.deepEqual(store.initializeApiHostFromCurrentLocation(), {
    status: 'failed',
    errorCode: 'STORE_UPDATE_FAILED',
  })
  assert.equal(store.apiHost, 'https://cached.example.test')
})

test('rolls back memory and earlier cache writes when a multi-field update fails', () => {
  const store = useGlobalStore()
  assert.equal(store.setGlobal({ token: 'old-token', apiHost: 'https://old.example.test' }), true)
  const originalSetItem = window.localStorage.setItem.bind(window.localStorage)
  window.localStorage.setItem = (key, value) => {
    if (key === 'DineroPro:global:api-host') throw new Error('quota exceeded')
    originalSetItem(key, value)
  }

  assert.equal(store.setGlobal({ token: 'new-token', apiHost: 'https://new.example.test' }), false)
  assert.equal(store.token, 'old-token')
  assert.equal(store.apiHost, 'https://old.example.test')
  assert.deepEqual(JSON.parse(window.localStorage.getItem('DineroPro:global:token')), {
    version: GLOBAL_TOKEN_CACHE_VERSION,
    value: 'old-token',
  })
  assert.deepEqual(JSON.parse(window.localStorage.getItem('DineroPro:global:api-host')), {
    version: GLOBAL_API_HOST_CACHE_VERSION,
    value: 'https://old.example.test',
  })
})

test('reports malformed cached apiHost as a cache access failure and discards it', () => {
  const store = useGlobalStore()
  window.localStorage.setItem('DineroPro:global:api-host', JSON.stringify({
    version: GLOBAL_API_HOST_CACHE_VERSION,
    value: 'http://unsafe.example.test',
  }))
  assert.deepEqual(store.initializeApiHostFromCurrentLocation(), {
    status: 'failed',
    errorCode: 'CACHE_ACCESS_FAILED',
  })
  assert.equal(store.apiHost, null)
  assert.equal(window.localStorage.getItem('DineroPro:global:api-host'), null)
  assert.equal(window.localStorage.getItem('DineroPro:global:is-multi-push'), null)
})

test('retains apiHost hydration failure semantics until URL initialization consumes them', () => {
  const store = useGlobalStore()
  window.localStorage.setItem('DineroPro:global:api-host', '{')
  store.hydrateGlobal()
  assert.equal(window.localStorage.getItem('DineroPro:global:api-host'), null)
  assert.deepEqual(store.initializeApiHostFromCurrentLocation(), {
    status: 'failed',
    errorCode: 'CACHE_ACCESS_FAILED',
  })

  window.location.search = '?apiHost=https%3A%2F%2Frecovery.example.test'
  assert.deepEqual(store.initializeApiHostFromCurrentLocation(), {
    status: 'updated',
    errorCode: null,
  })
  assert.equal(store.apiHost, 'https://recovery.example.test')
})

test('clearGlobal removes every authorized cache entry and resets every field', () => {
  const store = useGlobalStore()
  assert.equal(store.setGlobal({
    token: 'redacted-token',
    apiHost: 'https://api.example.test',
    appName: 'PlataRap',
    packageName: 'PlataRap',
    packageId: 'com.platarap.app',
    appVersion: '42',
    appVersionName: '1.2.0',
    androidId: 'redacted-android-id',
    afId: 'redacted-apps-flyer-id',
    fbId: 'redacted-firebase-id',
    gaId: 'redacted-advertising-id',
    isMultiPush: true,
  }), true)
  assert.equal(store.clearGlobal(), true)
  assert.equal(store.token, null)
  assert.equal(store.apiHost, null)
  assert.equal(store.isMultiPush, false)
  assert.equal(window.localStorage.getItem('DineroPro:global:token'), null)
  assert.equal(window.localStorage.getItem('DineroPro:global:api-host'), null)
  assert.equal(window.localStorage.getItem('DineroPro:global:is-multi-push'), null)
  assert.deepEqual(store.initializeApiHostFromCurrentLocation(), { status: 'not_found', errorCode: null })
  for (const key of Object.values(GLOBAL_APP_INFO_CACHE_KEYS)) assert.equal(window.localStorage.getItem(`DineroPro:${key}`), null)
  for (const key of Object.values(GLOBAL_THIRD_PARTY_SDK_CACHE_KEYS)) assert.equal(window.localStorage.getItem(`DineroPro:${key}`), null)
})
