import { createNetworkError, NETWORK_ERROR_CATEGORY } from './errors.js'

const BASE_URL_KEY = 'VITE_API_BASE_URL'
const TIMEOUT_KEY = 'VITE_API_TIMEOUT_MS'

export function readNetworkSettings(environment = import.meta.env) {
  return {
    baseUrl: environment?.[BASE_URL_KEY]?.trim() || '',
    timeoutMs: Number(environment?.[TIMEOUT_KEY]),
  }
}

export function validateNetworkSettings(settings) {
  if (!settings?.baseUrl) {
    throw createNetworkError({
      category: NETWORK_ERROR_CATEGORY.CONFIGURATION,
      message: `${BASE_URL_KEY} is required before a service request can be sent.`,
    })
  }

  let parsedUrl
  try {
    parsedUrl = new URL(settings.baseUrl)
  } catch {
    throw createNetworkError({
      category: NETWORK_ERROR_CATEGORY.CONFIGURATION,
      message: `${BASE_URL_KEY} must be an absolute URL.`,
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

  if (!Number.isInteger(settings.timeoutMs) || settings.timeoutMs <= 0) {
    throw createNetworkError({
      category: NETWORK_ERROR_CATEGORY.CONFIGURATION,
      message: `${TIMEOUT_KEY} must be a positive integer supplied by controlled configuration.`,
    })
  }

  return {
    baseUrl: parsedUrl.toString().replace(/\/$/, ''),
    timeoutMs: settings.timeoutMs,
  }
}
