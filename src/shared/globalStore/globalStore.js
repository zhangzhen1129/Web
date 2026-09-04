import { defineStore } from 'pinia'
import {
  get as getPersistentValue,
  getResult as getPersistentResult,
  remove as removePersistentValue,
  set as setPersistentValue,
} from '../cache/index.js'

export const GLOBAL_TOKEN_CACHE_KEY = 'global:token'
export const GLOBAL_TOKEN_CACHE_VERSION = 1
export const GLOBAL_API_HOST_CACHE_KEY = 'global:api-host'
export const GLOBAL_API_HOST_CACHE_VERSION = 1
export const GLOBAL_APP_INFO_CACHE_KEYS = Object.freeze({
  appName: 'global:app-name',
  packageName: 'global:package-name',
  packageId: 'global:package-id',
  appVersion: 'global:app-version',
  appVersionName: 'global:app-version-name',
  androidId: 'global:android-id',
})
export const GLOBAL_APP_INFO_CACHE_VERSION = 1
export const GLOBAL_APP_INFO_FIELDS = Object.freeze(Object.keys(GLOBAL_APP_INFO_CACHE_KEYS))
export const GLOBAL_THIRD_PARTY_SDK_CACHE_KEYS = Object.freeze({
  afId: 'global:af-id',
  fbId: 'global:fb-id',
  gaId: 'global:ga-id',
})
export const GLOBAL_THIRD_PARTY_SDK_CACHE_VERSION = 1
export const GLOBAL_THIRD_PARTY_SDK_FIELDS = Object.freeze(Object.keys(GLOBAL_THIRD_PARTY_SDK_CACHE_KEYS))
export const GLOBAL_MULTI_PUSH_CACHE_KEY = 'global:is-multi-push'
export const GLOBAL_MULTI_PUSH_CACHE_VERSION = 1

export const GLOBAL_FIELDS = Object.freeze([
  'apiHost', 'appName', 'packageName', 'packageId', 'appVersion', 'appVersionName', 'androidId',
  'token', 'userId', 'mobile', 'afId', 'gaId', 'fbId', 'gpsAddress', 'gps', 'isMultiPush',
])

const initialState = () => ({
  ...Object.fromEntries(GLOBAL_FIELDS.map((field) => [field, null])),
  isMultiPush: false,
})
const AUTHORIZED_FIELDS = new Set(['token', 'apiHost', ...GLOBAL_APP_INFO_FIELDS, ...GLOBAL_THIRD_PARTY_SDK_FIELDS, 'isMultiPush'])
const UNRESOLVED_FIELDS = new Set(GLOBAL_FIELDS.filter((field) => !AUTHORIZED_FIELDS.has(field)))
const apiHostHydrationResults = new WeakMap()

export function normalizeApiHost(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return null

  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function readApiHostFromLocation(location = typeof window === 'undefined' ? null : window.location) {
  if (!location) return null

  const searchValue = new URLSearchParams(location.search || '').get('apiHost')
  if (searchValue !== null) return searchValue

  const hash = location.hash || ''
  const queryIndex = hash.indexOf('?')
  return queryIndex >= 0 ? new URLSearchParams(hash.slice(queryIndex + 1)).get('apiHost') : null
}

function readCachedToken() {
  const token = getPersistentValue(GLOBAL_TOKEN_CACHE_KEY, null, { version: GLOBAL_TOKEN_CACHE_VERSION })
  if (typeof token === 'string' && token.length > 0) return token
  if (token !== null) removePersistentValue(GLOBAL_TOKEN_CACHE_KEY)
  return null
}

function hydrateCachedApiHost(store) {
  const cachedResult = getPersistentResult(GLOBAL_API_HOST_CACHE_KEY, { version: GLOBAL_API_HOST_CACHE_VERSION })
  if (cachedResult.status === 'found') {
    const cachedApiHost = normalizeApiHost(cachedResult.value)
    if (!cachedApiHost) {
      removePersistentValue(GLOBAL_API_HOST_CACHE_KEY)
      const result = Object.freeze({ status: 'failed' })
      apiHostHydrationResults.set(store, result)
      return result
    }
    store.apiHost = cachedApiHost
    const result = Object.freeze({ status: 'found', value: cachedApiHost })
    apiHostHydrationResults.set(store, result)
    return result
  }
  apiHostHydrationResults.set(store, cachedResult)
  return cachedResult
}

function readCachedAppInfo() {
  return Object.fromEntries(GLOBAL_APP_INFO_FIELDS.map((field) => {
    const cachedValue = getPersistentValue(GLOBAL_APP_INFO_CACHE_KEYS[field], null, { version: GLOBAL_APP_INFO_CACHE_VERSION })
    if (typeof cachedValue === 'string' && cachedValue.length > 0) return [field, cachedValue]
    if (cachedValue !== null) removePersistentValue(GLOBAL_APP_INFO_CACHE_KEYS[field])
    return [field, null]
  }))
}

function readCachedThirdPartySdkIdentifiers() {
  return Object.fromEntries(GLOBAL_THIRD_PARTY_SDK_FIELDS.map((field) => {
    const cachedValue = getPersistentValue(GLOBAL_THIRD_PARTY_SDK_CACHE_KEYS[field], null, { version: GLOBAL_THIRD_PARTY_SDK_CACHE_VERSION })
    if (typeof cachedValue === 'string' && cachedValue.length > 0) return [field, cachedValue]
    if (cachedValue !== null) removePersistentValue(GLOBAL_THIRD_PARTY_SDK_CACHE_KEYS[field])
    return [field, null]
  }))
}

function readCachedMultiPush() {
  const cachedValue = getPersistentValue(GLOBAL_MULTI_PUSH_CACHE_KEY, null, { version: GLOBAL_MULTI_PUSH_CACHE_VERSION })
  if (typeof cachedValue === 'boolean') return cachedValue
  if (cachedValue !== null) removePersistentValue(GLOBAL_MULTI_PUSH_CACHE_KEY)
  return false
}

export const useGlobalStore = defineStore('globalStore', {
  state: initialState,
  actions: {
    setGlobal(partial) {
      if (!partial || typeof partial !== 'object' || Array.isArray(partial)) return false
      const fields = Object.keys(partial)
      if (fields.some((field) => !GLOBAL_FIELDS.includes(field))) return false
      if (fields.some((field) => UNRESOLVED_FIELDS.has(field) && partial[field] !== null)) return false
      if (Object.hasOwn(partial, 'token') && (typeof partial.token !== 'string' || partial.token.length === 0)) return false
      if (Object.hasOwn(partial, 'isMultiPush') && typeof partial.isMultiPush !== 'boolean') return false
      if (GLOBAL_APP_INFO_FIELDS.some((field) => Object.hasOwn(partial, field) && (typeof partial[field] !== 'string' || partial[field].length === 0))) return false
      if (GLOBAL_THIRD_PARTY_SDK_FIELDS.some((field) => Object.hasOwn(partial, field) && (typeof partial[field] !== 'string' || partial[field].length === 0))) return false

      const apiHost = Object.hasOwn(partial, 'apiHost') ? normalizeApiHost(partial.apiHost) : null
      if (Object.hasOwn(partial, 'apiHost') && !apiHost) return false

      const nextValues = { ...partial }
      if (apiHost) nextValues.apiHost = apiHost

      const entries = []
      if (Object.hasOwn(partial, 'token')) entries.push({ field: 'token', key: GLOBAL_TOKEN_CACHE_KEY, version: GLOBAL_TOKEN_CACHE_VERSION, value: partial.token })
      if (apiHost) entries.push({ field: 'apiHost', key: GLOBAL_API_HOST_CACHE_KEY, version: GLOBAL_API_HOST_CACHE_VERSION, value: apiHost })
      if (Object.hasOwn(partial, 'isMultiPush')) entries.push({ field: 'isMultiPush', key: GLOBAL_MULTI_PUSH_CACHE_KEY, version: GLOBAL_MULTI_PUSH_CACHE_VERSION, value: partial.isMultiPush })
      GLOBAL_APP_INFO_FIELDS.forEach((field) => {
        if (Object.hasOwn(partial, field)) entries.push({ field, key: GLOBAL_APP_INFO_CACHE_KEYS[field], version: GLOBAL_APP_INFO_CACHE_VERSION, value: partial[field] })
      })
      GLOBAL_THIRD_PARTY_SDK_FIELDS.forEach((field) => {
        if (Object.hasOwn(partial, field)) entries.push({ field, key: GLOBAL_THIRD_PARTY_SDK_CACHE_KEYS[field], version: GLOBAL_THIRD_PARTY_SDK_CACHE_VERSION, value: partial[field] })
      })

      const snapshots = entries.map((entry) => ({
        ...entry,
        previous: getPersistentResult(entry.key, { version: entry.version }),
      }))
      const written = []
      for (const entry of entries) {
        if (!setPersistentValue(entry.key, entry.value, { version: entry.version })) {
          written.forEach((writtenEntry) => {
            removePersistentValue(writtenEntry.key)
            const snapshot = snapshots.find((item) => item.key === writtenEntry.key)?.previous
            if (snapshot?.status === 'found') setPersistentValue(writtenEntry.key, snapshot.value, { version: writtenEntry.version })
          })
          return false
        }
        written.push(entry)
      }

      fields.forEach((field) => { this[field] = nextValues[field] })
      return true
    },
    hydrateGlobal() {
      this.token = readCachedToken()
      hydrateCachedApiHost(this)
      Object.assign(this, readCachedAppInfo())
      Object.assign(this, readCachedThirdPartySdkIdentifiers())
      this.isMultiPush = readCachedMultiPush()

      return this.token
    },
    initializeApiHostFromCurrentLocation() {
      const locationApiHost = normalizeApiHost(readApiHostFromLocation())
      if (locationApiHost) {
        const previousApiHost = this.apiHost
        if (this.setGlobal({ apiHost: locationApiHost })) {
          apiHostHydrationResults.set(this, Object.freeze({ status: 'found', value: locationApiHost }))
          return Object.freeze({ status: 'updated', errorCode: null })
        }
        this.apiHost = previousApiHost
        return Object.freeze({ status: 'failed', errorCode: 'STORE_UPDATE_FAILED' })
      }

      const cachedResult = apiHostHydrationResults.get(this) ?? hydrateCachedApiHost(this)
      if (cachedResult.status === 'failed') {
        return Object.freeze({ status: 'failed', errorCode: 'CACHE_ACCESS_FAILED' })
      }
      if (cachedResult.status === 'found') {
        this.apiHost = cachedResult.value
        return Object.freeze({ status: 'retained', errorCode: null })
      }
      if (normalizeApiHost(this.apiHost)) {
        return Object.freeze({ status: 'retained', errorCode: null })
      }
      return Object.freeze({ status: 'not_found', errorCode: null })
    },
    clearGlobal() {
      const tokenRemoved = removePersistentValue(GLOBAL_TOKEN_CACHE_KEY)
      const apiHostRemoved = removePersistentValue(GLOBAL_API_HOST_CACHE_KEY)
      const appInfoRemoved = GLOBAL_APP_INFO_FIELDS
        .map((field) => removePersistentValue(GLOBAL_APP_INFO_CACHE_KEYS[field]))
        .every(Boolean)
      const thirdPartySdkRemoved = GLOBAL_THIRD_PARTY_SDK_FIELDS
        .map((field) => removePersistentValue(GLOBAL_THIRD_PARTY_SDK_CACHE_KEYS[field]))
        .every(Boolean)
      const multiPushRemoved = removePersistentValue(GLOBAL_MULTI_PUSH_CACHE_KEY)
      this.$patch(initialState())
      apiHostHydrationResults.delete(this)
      return tokenRemoved && apiHostRemoved && appInfoRemoved && thirdPartySdkRemoved && multiPushRemoved
    },
  },
})
