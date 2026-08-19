import { createNetworkError, NETWORK_ERROR_CATEGORY } from './errors.js'

export function createCredentialHeaderProvider(readHeaders = () => ({})) {
  if (typeof readHeaders !== 'function') {
    throw createNetworkError({
      category: NETWORK_ERROR_CATEGORY.CONFIGURATION,
      message: 'Credential header provider must be a function.',
    })
  }

  return async function getCredentialHeaders(context) {
    const headers = await readHeaders(context)
    if (headers === undefined || headers === null) return {}
    if (Object.prototype.toString.call(headers) !== '[object Object]') {
      throw createNetworkError({
        category: NETWORK_ERROR_CATEGORY.CONFIGURATION,
        message: 'Credential header provider must return a plain header object.',
      })
    }

    return headers
  }
}
