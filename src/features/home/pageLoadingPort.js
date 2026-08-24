import { hideNativeLoading, showNativeLoading } from '../../shared/bridge/nativeLoading.js'

export function createNoopPageLoadingAdapter() {
  return Object.freeze({
    show() {},
    hide() {},
  })
}

export function createNativePageLoadingAdapter() {
  return Object.freeze({
    // The Android contract requires the global adapter to generate its own requestId.
    show() {
      showNativeLoading()
    },
    hide() {
      hideNativeLoading()
    },
  })
}

export function assertPageLoadingPort(port) {
  if (!port || typeof port.show !== 'function' || typeof port.hide !== 'function') {
    throw new TypeError('PageLoadingPort must provide show() and hide() methods')
  }

  return port
}
