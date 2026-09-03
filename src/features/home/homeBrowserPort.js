function dispatch(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

export function createHomeBrowserPort() {
  let registeredUpdate = null
  let handlers = null

  function mount(nextHandlers) {
    handlers = nextHandlers
    registeredUpdate = (payload) => handlers?.updateHomeView?.(payload)
    window.updateHomeView = registeredUpdate
    window.addEventListener('pagehide', handlers.onPageHide)
    window.addEventListener('pageshow', handlers.onPageShow)
    document.addEventListener('visibilitychange', handlers.onVisibilityChange)
  }

  function unmount() {
    if (!handlers) return
    window.removeEventListener('pagehide', handlers.onPageHide)
    window.removeEventListener('pageshow', handlers.onPageShow)
    document.removeEventListener('visibilitychange', handlers.onVisibilityChange)
    if (window.updateHomeView === registeredUpdate) delete window.updateHomeView
    handlers = null
    registeredUpdate = null
  }

  return Object.freeze({
    mount,
    unmount,
    emitDiagnostic(diagnostic) { dispatch('dinero-pro:home-diagnostic', diagnostic) },
    emitOperation(operation) { dispatch('dinero-pro:home-operation', operation) },
  })
}
