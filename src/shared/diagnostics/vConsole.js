let applicationManager = null

function reportDiagnostic(code) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent('dinero-pro:diagnostic', {
      detail: { code, source: 'vconsole' },
    }))
  } catch {
    return
  }
}

export function createVConsoleManager({ loadVConsole, diagnostic = reportDiagnostic } = {}) {
  let instance = null
  let initializationPromise = null

  function initializeEnabled(enableVConsole) {
    if (enableVConsole !== true) return Promise.resolve(null)
    if (instance) return Promise.resolve(instance)
    if (initializationPromise) return initializationPromise

    initializationPromise = Promise.resolve()
      .then(() => loadVConsole())
      .then((module) => {
        if (instance) return instance
        const VConsole = module?.default ?? module
        if (typeof VConsole !== 'function') throw new TypeError('vConsole constructor is unavailable')
        instance = new VConsole()
        return instance
      })
      .catch(() => {
        try {
          diagnostic('VCONSOLE_INIT_FAILED')
        } catch {
          return null
        }
        return null
      })
      .finally(() => {
        initializationPromise = null
      })

    return initializationPromise
  }

  return Object.freeze({
    initializeEnabled,
    initializeForEnvironment(isProduction, isTestEnvironment = true) {
      if (typeof isProduction !== 'boolean' || typeof isTestEnvironment !== 'boolean') return Promise.resolve(null)
      const enableVConsole = !isProduction && isTestEnvironment
      return initializeEnabled(enableVConsole)
    },
    getInstance() {
      return instance
    },
  })
}

function getApplicationManager() {
  if (!applicationManager) {
    applicationManager = createVConsoleManager({ loadVConsole: () => import('vconsole') })
  }
  return applicationManager
}

export function initializeVConsole(isTestEnvironment = true) {
  if (typeof isTestEnvironment !== 'boolean') return Promise.resolve(null)
  const enableVConsole = !import.meta.env.PROD && isTestEnvironment
  if (!enableVConsole) return Promise.resolve(null)
  return getApplicationManager().initializeEnabled(enableVConsole)
}

export function getVConsoleInstance() {
  return applicationManager?.getInstance() ?? null
}
