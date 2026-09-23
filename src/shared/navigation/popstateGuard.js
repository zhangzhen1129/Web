let activeHandler = null
let installed = false

function dispatchPopstate() {
  if (typeof activeHandler !== 'function') return
  try {
    activeHandler()
  } catch {}
}

function installPopstateGuard() {
  if (installed || typeof window === 'undefined') return
  window.addEventListener('popstate', dispatchPopstate, true)
  installed = true
}

export function setPopstateGuard(handler) {
  installPopstateGuard()
  activeHandler = typeof handler === 'function' ? handler : null
  return () => {
    if (activeHandler === handler) activeHandler = null
  }
}
