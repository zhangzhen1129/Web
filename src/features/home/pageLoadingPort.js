export function createNoopPageLoadingAdapter() {
  return Object.freeze({
    show() {},
    hide() {},
  })
}

export function assertPageLoadingPort(port) {
  if (!port || typeof port.show !== 'function' || typeof port.hide !== 'function') {
    throw new TypeError('PageLoadingPort must provide show() and hide() methods')
  }

  return port
}
