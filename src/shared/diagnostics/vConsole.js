let instance = null
let initializationPromise = null

function reportDiagnostic(code) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent('dinero-pro:diagnostic', {
      detail: { code, source: 'vconsole' },
    }))
  } catch {
    // Diagnostics are best effort and must not block application startup.
  }
}

/**
 * Initialize the application-level vConsole singleton.
 * The argument intentionally remains a boolean; URL, host, and page flags are
 * not accepted. The returned promise is safe to ignore from the startup path.
 */
export function initializeVConsole(isTestEnvironment = true) {
  const enableVConsole = !import.meta.env.PROD && isTestEnvironment
  if (!enableVConsole || typeof isTestEnvironment !== 'boolean') return Promise.resolve(null)
  if (instance) return Promise.resolve(instance)
  if (initializationPromise) return initializationPromise

  // Keep the import behind Vite's production constant so the production
  // graph cannot instantiate or ship the diagnostic tool.
  initializationPromise = (!import.meta.env.PROD ? import('vconsole') : Promise.resolve(null))
    .then(({ default: VConsole }) => {
      if (instance) return instance
      instance = new VConsole()
      return instance
    })
    .catch(() => {
      reportDiagnostic('VCONSOLE_INIT_FAILED')
      return null
    })
    .finally(() => {
      initializationPromise = null
    })

  return initializationPromise
}

export function getVConsoleInstance() {
  return instance
}
