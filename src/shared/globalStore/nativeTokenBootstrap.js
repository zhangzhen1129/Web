import { getNativeCachedToken } from '../bridge/nativePersistentCache.js'

export function createNativeTokenBootstrap(requestToken = getNativeCachedToken) {
  let state = 'idle'
  let requestId = null

  return Object.freeze({
    request(globalStore) {
      if (!globalStore || typeof globalStore.setGlobal !== 'function' || state !== 'idle') return requestId

      state = 'pending'
      const acceptedRequestId = requestToken((reply) => {
        if (state !== 'pending') return

        state = 'completed'
        requestId = null
        const token = reply?.cacheValue
        if (reply?.status === 'completed' && reply?.hit === true && typeof token === 'string' && token.length > 0) {
          globalStore.setGlobal({ token })
        }
      })

      if (state === 'pending') {
        if (typeof acceptedRequestId !== 'string' || acceptedRequestId.length === 0) {
          state = 'idle'
          requestId = null
          return null
        }
        requestId = acceptedRequestId
      }

      return acceptedRequestId || null
    },
    getState() {
      return state
    },
  })
}

const nativeTokenBootstrap = createNativeTokenBootstrap()

export function requestNativeToken(globalStore) {
  return nativeTokenBootstrap.request(globalStore)
}
