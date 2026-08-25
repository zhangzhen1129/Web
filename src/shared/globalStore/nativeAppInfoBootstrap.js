import { getNativeAppInfo } from '../bridge/nativeAppInfo.js'

const APP_INFO_FIELDS = Object.freeze([
  'packageId',
  'packageName',
  'appVersion',
  'appVersionName',
  'appName',
  'androidId',
])

function isCompleteAppInfo(reply) {
  return reply?.status === 'success'
    && APP_INFO_FIELDS.every((field) => typeof reply[field] === 'string' && reply[field].length > 0)
}

export function createNativeAppInfoBootstrap(requestAppInfo = getNativeAppInfo) {
  let state = 'idle'
  let requestId = null

  return Object.freeze({
    request(globalStore) {
      if (!globalStore || typeof globalStore.setGlobal !== 'function' || state !== 'idle') return requestId

      state = 'pending'
      const acceptedRequestId = requestAppInfo((reply) => {
        if (state !== 'pending') return

        state = 'completed'
        requestId = null
        if (isCompleteAppInfo(reply)) {
          const appInfo = Object.fromEntries(APP_INFO_FIELDS.map((field) => [field, reply[field]]))
          globalStore.setGlobal(appInfo)
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

const nativeAppInfoBootstrap = createNativeAppInfoBootstrap()

export function requestNativeAppInfo(globalStore) {
  return nativeAppInfoBootstrap.request(globalStore)
}
