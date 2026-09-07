import { createNetworkError, NETWORK_ERROR_CATEGORY } from './errors.js'
import { useGlobalStore } from '../globalStore/globalStore.js'

const TIMEOUT_KEY = 'VITE_API_TIMEOUT_MS'

function readApiHostFromGlobalStore() {
  try {
    return useGlobalStore().apiHost || ''
  } catch {
    return ''
  }
}

export function readNetworkSettings(environment = import.meta.env, readApiHost = readApiHostFromGlobalStore) {
  const configuredTimeout = environment?.[TIMEOUT_KEY]
  return {
    baseUrl: readApiHost(),
    timeoutMs: configuredTimeout === undefined || configuredTimeout === null || configuredTimeout === ''
      ? null
      : Number(configuredTimeout),
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
      message: `${TIMEOUT_KEY} must be a positive integer supplied by controlled configuration.`,
    })
  }

  return {
    baseUrl: parsedUrl.toString().replace(/\/$/, ''),
    timeoutMs,
  }
}
