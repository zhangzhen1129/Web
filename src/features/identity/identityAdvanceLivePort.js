import {
  cancelNativeAdvanceLiveConsumer,
  openAdvanceLivePageNat,
} from '../../shared/bridge/index.js'

export function createIdentityAdvanceLivePort({
  onResult = () => {},
  onFailure = () => {},
  openNative = openAdvanceLivePageNat,
  detachNative = cancelNativeAdvanceLiveConsumer,
} = {}) {
  let consumerHandle = null

  return Object.freeze({
    open(url) {
      if (consumerHandle) return false
      const handle = openNative(url, (result) => {
        consumerHandle = null
        onResult(result)
      }, { onFailure: (failure) => {
        consumerHandle = null
        onFailure(failure)
      } })
      if (!handle) return false
      consumerHandle = handle
      return true
    },
    detach() {
      if (!consumerHandle) return false
      const handle = consumerHandle
      consumerHandle = null
      return detachNative(handle)
    },
    isActive() {
      return Boolean(consumerHandle)
    },
  })
}
