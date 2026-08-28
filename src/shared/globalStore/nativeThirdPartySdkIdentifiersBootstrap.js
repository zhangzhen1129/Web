import { getThirdPartySdkIdentifiers } from '../bridge/nativeThirdPartySdkIdentifiers.js'

const IDENTIFIER_FIELDS = Object.freeze(['afId', 'fbId', 'gaId'])

function createUpdate(reply) {
  if ((reply?.status !== 'success' && reply?.status !== 'partial_success') || !reply || typeof reply !== 'object') return null

  const update = {}
  IDENTIFIER_FIELDS.forEach((field) => {
    if (typeof reply[field] === 'string' && reply[field].length > 0) update[field] = reply[field]
  })
  return Object.keys(update).length > 0 ? update : null
}

export function createNativeThirdPartySdkIdentifiersBootstrap(requestIdentifiers = getThirdPartySdkIdentifiers) {
  let state = 'idle'
  let requestId = null

  return Object.freeze({
    request(globalStore) {
      if (!globalStore || typeof globalStore.setGlobal !== 'function' || state !== 'idle') return requestId

      state = 'pending'
      const acceptedRequestId = requestIdentifiers((reply) => {
        if (state !== 'pending') return

        state = 'completed'
        requestId = null
        const update = createUpdate(reply)
        if (update) globalStore.setGlobal(update)
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

const nativeThirdPartySdkIdentifiersBootstrap = createNativeThirdPartySdkIdentifiersBootstrap()

export function requestNativeThirdPartySdkIdentifiers(globalStore) {
  return nativeThirdPartySdkIdentifiersBootstrap.request(globalStore)
}
