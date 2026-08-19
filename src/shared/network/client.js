import axios from 'axios'
import { readNetworkSettings, validateNetworkSettings } from './config.js'
import { createCredentialHeaderProvider } from './credentials.js'
import { createNetworkDiagnostics } from './diagnostics.js'
import { createNetworkError, isNetworkError, NETWORK_ERROR_CATEGORY } from './errors.js'

const SENSITIVE_PARAM_NAME = /(token|authorization|auth|password|captcha|phone|mobile|identity|card|device)/i

function createAxiosTransport(adapter) {
  return axios.create({ adapter })
}

function readHeader(headers, name) {
  return headers?.get?.(name) ?? headers?.[name] ?? headers?.[name.toLowerCase()]
}

function validateRequestConfig(config) {
  if (typeof config.method !== 'string' || !config.method) {
    throw createNetworkError({ category: NETWORK_ERROR_CATEGORY.CONFIGURATION, message: 'Request method is required.' })
  }
  if (typeof config.url !== 'string' || !config.url.startsWith('/') || config.url.includes('?')) {
    throw createNetworkError({ category: NETWORK_ERROR_CATEGORY.CONFIGURATION, message: 'Request path must be a relative path without an inline query string.' })
  }
  if (!config.protocolId || typeof config.protocolId !== 'string') {
    throw createNetworkError({ category: NETWORK_ERROR_CATEGORY.CONFIGURATION, message: 'A protocol identifier is required for every service request.' })
  }
  if (config.params && Object.keys(config.params).some((name) => SENSITIVE_PARAM_NAME.test(name))) {
    throw createNetworkError({ category: NETWORK_ERROR_CATEGORY.CONFIGURATION, message: 'Sensitive values must not be sent in request query parameters.' })
  }
  if (config.requestedTimeout !== undefined && (!Number.isInteger(config.requestedTimeout) || config.requestedTimeout <= 0)) {
    throw createNetworkError({ category: NETWORK_ERROR_CATEGORY.CONFIGURATION, message: 'Request timeout must be a positive integer.' })
  }
}

function normalizeTransportError(error, protocolId) {
  if (isNetworkError(error)) return error
  if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') {
    return createNetworkError({ category: NETWORK_ERROR_CATEGORY.CANCELED, message: 'Request was canceled.', protocolId, cause: error })
  }
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return createNetworkError({ category: NETWORK_ERROR_CATEGORY.TIMEOUT, message: 'Request timed out.', protocolId, cause: error })
  }

  const status = error?.response?.status ?? null
  if (status === 401 || status === 403) {
    return createNetworkError({ category: NETWORK_ERROR_CATEGORY.AUTHENTICATION, message: 'Authentication is not valid.', status, protocolId, cause: error })
  }
  if (status !== null) {
    return createNetworkError({ category: NETWORK_ERROR_CATEGORY.HTTP, message: `Request failed with HTTP status ${status}.`, status, protocolId, cause: error })
  }
  return createNetworkError({ category: NETWORK_ERROR_CATEGORY.NETWORK, message: 'Network connection failed.', protocolId, cause: error })
}

function validateResponse(response, protocolId) {
  if (response.status === 401 || response.status === 403) {
    throw createNetworkError({ category: NETWORK_ERROR_CATEGORY.AUTHENTICATION, message: 'Authentication is not valid.', status: response.status, protocolId })
  }
  if (response.status < 200 || response.status >= 300) {
    throw createNetworkError({ category: NETWORK_ERROR_CATEGORY.HTTP, message: `Request failed with HTTP status ${response.status}.`, status: response.status, protocolId })
  }
  if (response.data === undefined || response.data === null || response.data === '') {
    throw createNetworkError({ category: NETWORK_ERROR_CATEGORY.EMPTY_RESPONSE, message: 'Response body is empty.', status: response.status, protocolId })
  }
  if (!String(readHeader(response.headers, 'content-type') || '').toLowerCase().includes('application/json')) {
    throw createNetworkError({ category: NETWORK_ERROR_CATEGORY.NON_JSON_RESPONSE, message: 'Response content type is not JSON.', status: response.status, protocolId })
  }
  if (typeof response.data !== 'object') {
    throw createNetworkError({ category: NETWORK_ERROR_CATEGORY.INVALID_RESPONSE, message: 'Response JSON must be an object or array.', status: response.status, protocolId })
  }

  return response
}

export function createNetworkClient({
  resolveSettings = readNetworkSettings,
  credentialHeaderProvider = createCredentialHeaderProvider(),
  diagnostics = createNetworkDiagnostics(),
  adapter,
} = {}) {
  const transport = createAxiosTransport(adapter)

  transport.interceptors.request.use(async (config) => {
    const request = { ...config, protocolId: config.protocolId ?? config.meta?.protocolId }
    validateRequestConfig(request)
    const settings = validateNetworkSettings(await resolveSettings())
    const credentialHeaders = await credentialHeaderProvider({ protocolId: request.protocolId, path: request.url, method: request.method })
    const headers = axios.AxiosHeaders.from(request.headers)
    headers.set(credentialHeaders)
    request.baseURL = settings.baseUrl
    request.timeout = request.requestedTimeout ?? settings.timeoutMs
    request.headers = headers
    diagnostics.record({ type: 'request', protocolId: request.protocolId, method: request.method.toUpperCase(), path: request.url })
    return request
  })

  transport.interceptors.response.use(
    (response) => {
      try {
        const validatedResponse = validateResponse(response, response.config.protocolId ?? response.config.meta?.protocolId)
        diagnostics.record({ type: 'response', protocolId: validatedResponse.config.protocolId ?? validatedResponse.config.meta?.protocolId, status: validatedResponse.status })
        return validatedResponse
      } catch (error) {
        const normalized = normalizeTransportError(error, response.config.protocolId ?? response.config.meta?.protocolId)
        diagnostics.record({ type: 'error', protocolId: normalized.protocolId, category: normalized.category, status: normalized.status })
        return Promise.reject(normalized)
      }
    },
    (error) => {
      const normalized = normalizeTransportError(error, error?.config?.protocolId ?? error?.config?.meta?.protocolId)
      diagnostics.record({ type: 'error', protocolId: normalized.protocolId, category: normalized.category, status: normalized.status })
      return Promise.reject(normalized)
    },
  )

  return Object.freeze({
    async request({ method, path, params, data, headers, signal, protocolId, timeoutMs } = {}) {
      const requestConfig = { method, url: path, params, data, headers, signal, protocolId }
      if (timeoutMs !== undefined) requestConfig.requestedTimeout = timeoutMs
      return transport.request(requestConfig)
    },
    getInterceptorCounts() {
      return Object.freeze({ request: transport.interceptors.request.handlers.filter(Boolean).length, response: transport.interceptors.response.handlers.filter(Boolean).length })
    },
    diagnostics,
  })
}

export const networkClient = createNetworkClient()
