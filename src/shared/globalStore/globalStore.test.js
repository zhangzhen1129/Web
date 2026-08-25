import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import {
  GLOBAL_API_HOST_CACHE_KEY,
  GLOBAL_API_HOST_CACHE_VERSION,
  GLOBAL_APP_INFO_CACHE_KEYS,
  GLOBAL_APP_INFO_CACHE_VERSION,
  GLOBAL_TOKEN_CACHE_KEY,
  GLOBAL_TOKEN_CACHE_VERSION,
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
  assert.equal(store.token, 'redacted-token')
  assert.equal(store.apiHost, 'https://api.example.test')
  assert.deepEqual(Object.fromEntries(Object.keys(appInfo).map((field) => [field, store[field]])), appInfo)
  assert.deepEqual(JSON.parse(window.localStorage.getItem('DineroPro:global:token')), { version: GLOBAL_TOKEN_CACHE_VERSION, value: 'redacted-token' })
  assert.deepEqual(JSON.parse(window.localStorage.getItem('DineroPro:global:api-host')), { version: GLOBAL_API_HOST_CACHE_VERSION, value: 'https://api.example.test' })
  for (const [field, key] of Object.entries(GLOBAL_APP_INFO_CACHE_KEYS)) {
    assert.deepEqual(JSON.parse(window.localStorage.getItem(`DineroPro:${key}`)), { version: GLOBAL_APP_INFO_CACHE_VERSION, value: appInfo[field] })
  }
  store.$reset()
  assert.equal(store.hydrateGlobal(), 'redacted-token')
  assert.equal(store.apiHost, 'https://api.example.test')
  assert.deepEqual(Object.fromEntries(Object.keys(appInfo).map((field) => [field, store[field]])), appInfo)
  assert.equal(GLOBAL_TOKEN_CACHE_KEY, 'global:token')
  assert.equal(GLOBAL_API_HOST_CACHE_KEY, 'global:api-host')
})

test('rejects unknown, unresolved, and invalid authorized fields', () => {
  const store = useGlobalStore()
  assert.equal(store.setGlobal({ unknown: true }), false)
  assert.equal(store.setGlobal({ userId: 'unconfirmed-user' }), false)
  assert.equal(store.setGlobal({ appVersionName: '' }), false)
  assert.equal(store.setGlobal({ token: '' }), false)
  assert.equal(store.setGlobal({ apiHost: 'http://api.example.test' }), false)
  assert.equal(store.setGlobal({ apiHost: 'https://user:secret@api.example.test' }), false)
  assert.equal(store.token, null)
  assert.equal(store.apiHost, null)
  assert.equal(store.userId, null)
})

test('prefers a valid launch URL apiHost over the cached value', () => {
  const store = useGlobalStore()
  assert.equal(store.setGlobal({ apiHost: 'https://cached.example.test' }), true)
  window.location.search = '?apiHost=https%3A%2F%2Flaunch.example.test%2F'

  store.$reset()
  store.hydrateGlobal()

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
  assert.equal(store.apiHost, 'https://hash.example.test')

  window.location.hash = '#/home?apiHost=javascript%3Aalert(1)'
  store.$reset()
  store.hydrateGlobal()
  assert.equal(store.apiHost, 'https://hash.example.test')
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
  }), true)
  assert.equal(store.clearGlobal(), true)
  assert.equal(store.token, null)
  assert.equal(store.apiHost, null)
  assert.equal(window.localStorage.getItem('DineroPro:global:token'), null)
  assert.equal(window.localStorage.getItem('DineroPro:global:api-host'), null)
  for (const key of Object.values(GLOBAL_APP_INFO_CACHE_KEYS)) assert.equal(window.localStorage.getItem(`DineroPro:${key}`), null)
})
