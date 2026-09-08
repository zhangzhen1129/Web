import { createNetworkError, NETWORK_ERROR_CATEGORY } from './errors.js'
import { useGlobalStore } from '../globalStore/globalStore.js'

const NETWORK_TIMEOUT_MS = 180_000

function readApiHostFromGlobalStore() {
  try {
    return useGlobalStore().apiHost || ''
  } catch {
    return ''
  }
}

export function readNetworkSettings(readApiHost = readApiHostFromGlobalStore) {
  return {
    baseUrl: readApiHost(),
    timeoutMs: NETWORK_TIMEOUT_MS,
  }
}

export function validateNetworkSettings(settings, requestedTimeout) {
  if (!settings?.baseUrl) {
    throw createNetworkError({
      category: NETWORK_ERROR_CATEGORY.CONFIGURATION,
      message: 'globalStore.apiHost is required before a service request can be sent.',
    })
  }

  let parsedUrl
  try {
    parsedUrl = new URL(settings.baseUrl)
  } catch {
    throw createNetworkError({
      category: NETWORK_ERROR_CATEGORY.CONFIGURATION,
      message: 'globalStore.apiHost must be an absolute URL.',
    })
  }

  const isLocalHttp = parsedUrl.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname)
  if (parsedUrl.protocol !== 'https:' && !isLocalHttp) {
    throw createNetworkError({
      category: NETWORK_ERROR_CATEGORY.CONFIGURATION,
      message: 'Only HTTPS base URLs are allowed outside local development.',
    })
  }

  const timeoutMs = requestedTimeout ?? settings.timeoutMs
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw createNetworkError({
      category: NETWORK_ERROR_CATEGORY.CONFIGURATION,
      message: 'Request timeout must be a positive integer supplied by the network configuration.',
    })
  }

  return {
    baseUrl: parsedUrl.toString().replace(/\/$/, ''),
    timeoutMs,
  }
}
