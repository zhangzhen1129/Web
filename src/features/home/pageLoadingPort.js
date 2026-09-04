export function createNoopPageLoadingAdapter() {
  return Object.freeze({
    show() {},
    hide() {},
  })
}

export function createNativePageLoadingAdapter(homeHostService) {
  if (
    !homeHostService
    || typeof homeHostService.showHomeHostLoading !== 'function'
    || typeof homeHostService.hideHomeHostLoading !== 'function'
  ) {
    throw new TypeError('HomeHostService must provide loading lifecycle methods')
  }

  return Object.freeze({
    show(loadingCycleId) {
      homeHostService.showHomeHostLoading({ loadingCycleId })
    },
    hide(loadingCycleId) {
      homeHostService.hideHomeHostLoading({ loadingCycleId })
    },
  })
}

export function assertPageLoadingPort(port) {
  if (!port || typeof port.show !== 'function' || typeof port.hide !== 'function') {
    throw new TypeError('PageLoadingPort must provide show() and hide() methods')
  }

  return port
}
