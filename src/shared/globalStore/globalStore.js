import { defineStore } from 'pinia'
import { get as getPersistentValue, remove as removePersistentValue, set as setPersistentValue } from '../cache/index.js'

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

export const GLOBAL_FIELDS = Object.freeze([
  'apiHost', 'appName', 'packageName', 'packageId', 'appVersion', 'appVersionName', 'androidId',
  'token', 'userId', 'mobile', 'afId', 'gaId', 'gpsAddress', 'gps',
])

const initialState = () => Object.fromEntries(GLOBAL_FIELDS.map((field) => [field, null]))
const UNRESOLVED_FIELDS = new Set(GLOBAL_FIELDS.filter((field) => field !== 'token' && field !== 'apiHost' && !GLOBAL_APP_INFO_FIELDS.includes(field)))

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

function readCachedApiHost() {
  const cachedValue = getPersistentValue(GLOBAL_API_HOST_CACHE_KEY, null, { version: GLOBAL_API_HOST_CACHE_VERSION })
  const apiHost = normalizeApiHost(cachedValue)
  if (apiHost) return apiHost
  if (cachedValue !== null) removePersistentValue(GLOBAL_API_HOST_CACHE_KEY)
  return null
}

function readCachedAppInfo() {
  return Object.fromEntries(GLOBAL_APP_INFO_FIELDS.map((field) => {
    const cachedValue = getPersistentValue(GLOBAL_APP_INFO_CACHE_KEYS[field], null, { version: GLOBAL_APP_INFO_CACHE_VERSION })
    if (typeof cachedValue === 'string' && cachedValue.length > 0) return [field, cachedValue]
    if (cachedValue !== null) removePersistentValue(GLOBAL_APP_INFO_CACHE_KEYS[field])
    return [field, null]
  }))
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
      if (GLOBAL_APP_INFO_FIELDS.some((field) => Object.hasOwn(partial, field) && (typeof partial[field] !== 'string' || partial[field].length === 0))) return false

      const apiHost = Object.hasOwn(partial, 'apiHost') ? normalizeApiHost(partial.apiHost) : null
      if (Object.hasOwn(partial, 'apiHost') && !apiHost) return false

      const nextValues = { ...partial }
      if (apiHost) nextValues.apiHost = apiHost
      fields.forEach((field) => { this[field] = nextValues[field] })

      let persisted = true
      if (Object.hasOwn(partial, 'token')) {
        persisted = setPersistentValue(GLOBAL_TOKEN_CACHE_KEY, partial.token, { version: GLOBAL_TOKEN_CACHE_VERSION }) && persisted
      }
      if (apiHost) {
        persisted = setPersistentValue(GLOBAL_API_HOST_CACHE_KEY, apiHost, { version: GLOBAL_API_HOST_CACHE_VERSION }) && persisted
      }
      GLOBAL_APP_INFO_FIELDS.forEach((field) => {
        if (Object.hasOwn(partial, field)) {
          persisted = setPersistentValue(GLOBAL_APP_INFO_CACHE_KEYS[field], partial[field], { version: GLOBAL_APP_INFO_CACHE_VERSION }) && persisted
        }
      })
      return persisted
    },
    hydrateGlobal() {
      this.token = readCachedToken()
      this.apiHost = readCachedApiHost()
      Object.assign(this, readCachedAppInfo())

      const locationApiHost = normalizeApiHost(readApiHostFromLocation())
      if (locationApiHost) {
        this.apiHost = locationApiHost
        setPersistentValue(GLOBAL_API_HOST_CACHE_KEY, locationApiHost, { version: GLOBAL_API_HOST_CACHE_VERSION })
      }
      return this.token
    },
    clearGlobal() {
      const tokenRemoved = removePersistentValue(GLOBAL_TOKEN_CACHE_KEY)
      const apiHostRemoved = removePersistentValue(GLOBAL_API_HOST_CACHE_KEY)
      const appInfoRemoved = GLOBAL_APP_INFO_FIELDS
        .map((field) => removePersistentValue(GLOBAL_APP_INFO_CACHE_KEYS[field]))
        .every(Boolean)
      this.$patch(initialState())
      return tokenRemoved && apiHostRemoved && appInfoRemoved
    },
  },
})
