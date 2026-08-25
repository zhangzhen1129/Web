const RECOVERY_ID = 'app-runtime-recovery'

function dispatchDiagnostic(targetWindow, code) {
  if (!targetWindow || typeof targetWindow.dispatchEvent !== 'function' || typeof targetWindow.CustomEvent !== 'function') return
  try {
    targetWindow.dispatchEvent(new targetWindow.CustomEvent('dinero-pro:diagnostic', {
      detail: { code, source: 'runtime' },
    }))
  } catch {
    return
  }
}

export function renderRuntimeRecovery(targetDocument, reload) {
  if (!targetDocument || typeof targetDocument.createElement !== 'function') return false
  if (targetDocument.getElementById(RECOVERY_ID)) return true

  const root = targetDocument.getElementById('app')
  if (!root || typeof root.replaceChildren !== 'function') return false

  const panel = targetDocument.createElement('section')
  panel.id = RECOVERY_ID
  panel.className = 'runtime-recovery'
  panel.setAttribute('role', 'alert')

  const message = targetDocument.createElement('p')
  message.className = 'runtime-recovery__message'
  message.textContent = 'No se pudo continuar.'

  const button = targetDocument.createElement('button')
  button.className = 'runtime-recovery__button'
  button.type = 'button'
  button.textContent = 'Recargar'
  button.addEventListener('click', reload)

  panel.append(message, button)
  root.replaceChildren(panel)
  return true
}

export function createRuntimeRecovery({
  targetWindow = typeof window === 'undefined' ? null : window,
  targetDocument = typeof document === 'undefined' ? null : document,
  reload = () => targetWindow?.location?.reload?.(),
  render = renderRuntimeRecovery,
} = {}) {
  function recover(code) {
    dispatchDiagnostic(targetWindow, code)
    render(targetDocument, reload)
  }

  function handleUnhandledRejection() {
    recover('RUNTIME_UNHANDLED_REJECTION')
  }

  function handleWindowError() {
    recover('RUNTIME_RESOURCE_OR_SCRIPT_FAILED')
  }

  return Object.freeze({
    install() {
      targetWindow?.addEventListener?.('unhandledrejection', handleUnhandledRejection)
      targetWindow?.addEventListener?.('error', handleWindowError)
    },
    dispose() {
      targetWindow?.removeEventListener?.('unhandledrejection', handleUnhandledRejection)
      targetWindow?.removeEventListener?.('error', handleWindowError)
    },
    handleStartupFailure() {
      recover('RUNTIME_STARTUP_FAILED')
    },
    handleVueError() {
      recover('RUNTIME_RENDER_FAILED')
    },
  })
}
