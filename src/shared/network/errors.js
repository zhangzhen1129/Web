export const NETWORK_ERROR_CATEGORY = Object.freeze({
  CONFIGURATION: 'configuration',
  CANCELED: 'canceled',
  TIMEOUT: 'timeout',
  NETWORK: 'network',
  HTTP: 'http',
  AUTHENTICATION: 'authentication',
  EMPTY_RESPONSE: 'empty_response',
  NON_JSON_RESPONSE: 'non_json_response',
  INVALID_RESPONSE: 'invalid_response',
})

const SENSITIVE_VALUE_PATTERN = /((?:bearer|token|authorization|cookie)\s*[:=]?\s*)[^\s,;]+/gi
const MAX_SUMMARY_LENGTH = 180

function summarizeError(value) {
  const message = typeof value === 'string' ? value : value?.message
  if (!message) return 'No diagnostic message was supplied.'

  return message
    .replace(SENSITIVE_VALUE_PATTERN, '$1[REDACTED]')
    .slice(0, MAX_SUMMARY_LENGTH)
}

export class NetworkError extends Error {
  constructor({ category, message, status = null, protocolId = null, cause = null }) {
    super(message)
    this.name = 'NetworkError'
    this.category = category
    this.status = status
    this.protocolId = protocolId
    this.displayMessage = 'Unable to complete the network request.'
    this.summary = summarizeError(cause ?? message)
  }
}

export function isNetworkError(error) {
  return error instanceof NetworkError
}

export function createNetworkError(details) {
  return new NetworkError(details)
}
