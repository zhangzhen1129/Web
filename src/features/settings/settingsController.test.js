import assert from 'node:assert/strict'
import test from 'node:test'

import { createSettingsController } from './settingsController.js'
import { SETTINGS_TEXT } from './settingsText.js'

function flush() {
  return new Promise((resolve) => setImmediate(resolve))
}

function createHarness(overrides = {}) {
  const profileCalls = []
  const navigateCalls = []
  const backCalls = []
  const clearCalls = []
  const logoutCalls = []
  const requestFailures = []
  const bridgeFailures = []
  const terminalRisks = []
  const bridgeCalls = []
  const controllers = []

  const loadProfile = overrides.loadProfile ?? (async () => ({ type: 'success', hasPassword: false }))
  const navigate = overrides.navigate ?? (() => undefined)
  const navigateBack = overrides.navigateBack ?? (() => undefined)
  const clearGlobal = overrides.clearGlobal ?? (() => true)
  const logout = overrides.logout ?? (() => true)
  const bridge = Object.hasOwn(overrides, 'setPhysicalBackIntercept')
    ? overrides.setPhysicalBackIntercept
    : (config) => (config.enabled ? 'physical-back-enable-id' : 'physical-back-disable-id')

  const controller = createSettingsController({
    services: {
      loadProfile(...args) {
        profileCalls.push(args)
        return loadProfile(...args)
      },
    },
    navigate(routeName) {
      navigateCalls.push(routeName)
      return navigate(routeName)
    },
    navigateBack() {
      backCalls.push('back')
      return navigateBack()
    },
    clearGlobal() {
      clearCalls.push('clear')
      return clearGlobal()
    },
    logout() {
      logoutCalls.push('logout')
      return logout()
    },
    setPhysicalBackIntercept(config, options) {
      bridgeCalls.push({ config, options })
      return bridge(config, options)
    },
    onRequestFailure(error) {
      requestFailures.push(error)
    },
    onBridgeFailure(failure) {
      bridgeFailures.push(failure)
    },
    onTerminalRisk(code) {
      terminalRisks.push(code)
    },
    createAbortController() {
      const controllerInstance = new AbortController()
      controllers.push(controllerInstance)
      return controllerInstance
    },
  })

  return {
    controller,
    profileCalls,
    navigateCalls,
    backCalls,
    clearCalls,
    logoutCalls,
    requestFailures,
    bridgeFailures,
    terminalRisks,
    bridgeCalls,
    controllers,
  }
}

test('exposes the confirmed Spanish settings text', () => {
  assert.deepEqual(SETTINGS_TEXT, {
    title: 'Configuración',
    changePassword: 'Cambiar contraseña',
    createPassword: 'Crear una contraseña',
    legal: 'Legal',
    logout: 'Cerrar sesión',
    terms: 'Condiciones del servicio',
    privacy: 'Política de privacidad',
    logoutConfirm: '¿Está seguro de cerrar sesión?',
    confirm: 'OK',
    cancel: 'Cancelar',
    accessibility: {
      back: 'Go back',
      close: 'Close dialog',
    },
  })
})

test('initializes once with create mode and enables physical back interception', async () => {
  const harness = createHarness()
  const initial = harness.controller.getState()

  assert.equal(initial.active, false)
  assert.equal(initial.passwordMode, 'create')
  assert.equal(harness.controller.initialize(), true)
  assert.equal(harness.controller.initialize(), false)
  await flush()

  assert.equal(harness.profileCalls.length, 1)
  assert.equal(harness.controllers.length, 1)
  assert.equal(harness.bridgeCalls.length, 1)
  assert.equal(harness.bridgeCalls[0].config.enabled, true)
  assert.equal(typeof harness.bridgeCalls[0].config.onIntercept, 'function')
  assert.deepEqual(harness.controller.getState(), {
    active: true,
    passwordMode: 'create',
    protocolDialogVisible: false,
    logoutDialogVisible: false,
    logoutPending: false,
    navigationLocked: false,
  })
})

test('switches to change mode only for a nonzero integer password flag', async () => {
  const harness = createHarness({
    loadProfile: async () => ({ type: 'success', hasPassword: true }),
  })

  harness.controller.initialize()
  await flush()

  assert.equal(harness.controller.getState().passwordMode, 'change')
  assert.equal(harness.requestFailures.length, 0)
})

test('keeps create mode for business, invalid, canceled, and globally handled failures', async (t) => {
  const cases = [
    ['business failure', async () => ({ type: 'business_failure' })],
    ['invalid response', async () => ({ type: 'invalid_response' })],
    ['canceled request', async () => {
      const error = new Error('canceled')
      error.category = 'canceled'
      throw error
    }],
    ['handled request failure', async () => {
      const error = new Error('handled')
      error.businessHandled = true
      throw error
    }],
  ]

  for (const [name, loadProfile] of cases) {
    await t.test(name, async () => {
      const harness = createHarness({ loadProfile })
      harness.controller.initialize()
      await flush()

      assert.equal(harness.controller.getState().passwordMode, 'create')
      assert.equal(harness.requestFailures.length, 0)
    })
  }
})

test('reports one unhandled non-canceled request exception', async () => {
  const requestError = new Error('offline')
  const harness = createHarness({
    loadProfile: async () => {
      throw requestError
    },
  })

  harness.controller.initialize()
  await flush()
  harness.controller.initialize()
  await flush()

  assert.equal(harness.requestFailures.length, 1)
  assert.equal(harness.requestFailures[0], requestError)
  assert.equal(harness.controller.getState().passwordMode, 'create')
})

test('keeps protocol and logout dialogs mutually exclusive and dismissible', async () => {
  const harness = createHarness()
  harness.controller.initialize()
  await flush()

  assert.equal(harness.controller.openProtocolDialog(), true)
  assert.equal(harness.controller.openProtocolDialog(), false)
  assert.equal(harness.controller.getState().protocolDialogVisible, true)

  assert.equal(harness.controller.openLogoutDialog(), true)
  assert.equal(harness.controller.getState().protocolDialogVisible, false)
  assert.equal(harness.controller.getState().logoutDialogVisible, true)
  assert.equal(harness.controller.openLogoutDialog(), false)

  assert.equal(harness.controller.cancelLogout(), true)
  assert.equal(harness.controller.cancelLogout(), false)
  assert.equal(harness.controller.getState().logoutDialogVisible, false)
})

test('uses the active password mode and locks duplicate navigation', async () => {
  const createHarnessInstance = createHarness()
  createHarnessInstance.controller.initialize()
  await flush()

  assert.equal(createHarnessInstance.controller.requestPasswordNavigation(), true)
  assert.equal(createHarnessInstance.controller.requestPasswordNavigation(), false)
  assert.deepEqual(createHarnessInstance.navigateCalls, ['createPassword'])
  assert.equal(createHarnessInstance.controller.getState().navigationLocked, true)

  const changeHarness = createHarness({
    loadProfile: async () => ({ type: 'success', hasPassword: true }),
  })
  changeHarness.controller.initialize()
  await flush()

  assert.equal(changeHarness.controller.requestPasswordNavigation(), true)
  assert.deepEqual(changeHarness.navigateCalls, ['retrievePassword'])
})

test('unlocks navigation when a named route is already current', async () => {
  const harness = createHarness({ navigate: () => false })
  harness.controller.initialize()
  await flush()

  assert.equal(harness.controller.requestPasswordNavigation(), false)
  assert.deepEqual(harness.navigateCalls, ['createPassword'])
  assert.equal(harness.controller.getState().navigationLocked, false)
})

test('unlocks back navigation when the router declines it', async () => {
  const harness = createHarness({ navigateBack: () => false })
  harness.controller.initialize()
  await flush()

  assert.equal(harness.controller.requestBack(), false)
  assert.deepEqual(harness.backCalls, ['back'])
  assert.equal(harness.controller.getState().navigationLocked, false)
})

test('unlocks navigation after a controlled router failure', async () => {
  const harness = createHarness({
    navigate: () => {
      throw new Error('route unavailable')
    },
  })
  harness.controller.initialize()
  await flush()

  assert.equal(harness.controller.requestPasswordNavigation(), false)
  assert.deepEqual(harness.navigateCalls, ['createPassword'])
  assert.equal(harness.controller.getState().navigationLocked, false)
})

test('navigates terms and privacy once through named routes', async (t) => {
  const cases = [
    ['terms', 'requestTerms'],
    ['privacy', 'requestPrivacy'],
  ]

  for (const [routeName, methodName] of cases) {
    await t.test(routeName, async () => {
      const harness = createHarness()
      harness.controller.initialize()
      await flush()

      assert.equal(harness.controller[methodName](), true)
      assert.equal(harness.controller[methodName](), false)
      assert.deepEqual(harness.navigateCalls, [routeName])
    })
  }
})

test('does not navigate while a dialog is open', async () => {
  const harness = createHarness()
  harness.controller.initialize()
  await flush()
  assert.equal(harness.controller.openProtocolDialog(), true)
  assert.equal(harness.controller.requestTerms(), false)
  assert.deepEqual(harness.navigateCalls, [])
})

test('closes the logout dialog and runs clear then logout exactly once', async () => {
  const harness = createHarness({
    clearGlobal: () => false,
  })
  harness.controller.initialize()
  await flush()
  harness.controller.openLogoutDialog()

  assert.equal(harness.controller.confirmLogout(), true)
  assert.equal(harness.controller.confirmLogout(), false)
  assert.deepEqual(harness.clearCalls, ['clear'])
  assert.deepEqual(harness.logoutCalls, ['logout'])
  assert.deepEqual(harness.terminalRisks, ['CLEAR_GLOBAL_FAILED'])
  assert.equal(harness.controller.getState().logoutDialogVisible, false)
  assert.equal(harness.controller.getState().logoutPending, true)
})

test('continues logout when global cleanup throws', async () => {
  const harness = createHarness({
    clearGlobal: () => {
      throw new Error('clear failed')
    },
  })
  harness.controller.initialize()
  await flush()
  harness.controller.openLogoutDialog()

  assert.equal(harness.controller.confirmLogout(), true)
  assert.deepEqual(harness.clearCalls, ['clear'])
  assert.deepEqual(harness.logoutCalls, ['logout'])
  assert.deepEqual(harness.terminalRisks, ['CLEAR_GLOBAL_FAILED'])
})

test('physical back proxy invokes the shared back path and is invalidated on deactivate', async () => {
  const harness = createHarness()
  harness.controller.initialize()
  await flush()

  const enabledConfig = harness.bridgeCalls[0].config
  enabledConfig.onIntercept({ status: 'intercepted' })
  assert.deepEqual(harness.backCalls, ['back'])
  assert.equal(harness.bridgeCalls[1].config.enabled, false)

  const secondHarness = createHarness()
  secondHarness.controller.initialize()
  await flush()
  const staleIntercept = secondHarness.bridgeCalls[0].config.onIntercept

  assert.equal(secondHarness.controller.deactivate(), true)
  staleIntercept({ status: 'intercepted' })
  assert.deepEqual(secondHarness.backCalls, [])
  assert.equal(secondHarness.bridgeCalls[1].config.enabled, false)
})

test('keeps the profile request usable when the back capability is unavailable or throws', async (t) => {
  const cases = [
    ['unavailable', undefined],
    ['throws', () => {
      throw new Error('bridge failed')
    }],
  ]

  for (const [name, setPhysicalBackIntercept] of cases) {
    await t.test(name, async () => {
      const harness = createHarness({ setPhysicalBackIntercept })
      assert.equal(harness.controller.initialize(), true)
      await flush()

      assert.equal(harness.profileCalls.length, 1)
      assert.equal(harness.bridgeFailures.length, 1)
    })
  }
})

test('does not retry a failed close and still invalidates the consumer', async () => {
  const harness = createHarness({
    setPhysicalBackIntercept(config, options) {
      if (config.enabled) return 'physical-back-enable-id'
      options.onFailure({ capability: 'setPhysicalBackInterceptConfig', code: 'BRIDGE_NOT_ACCEPTED' })
      return null
    },
  })
  harness.controller.initialize()
  await flush()

  assert.equal(harness.controller.deactivate(), true)
  assert.equal(harness.controller.deactivate(), false)
  assert.equal(harness.bridgeCalls.length, 2)
  assert.equal(harness.bridgeFailures.length, 1)
})

test('ignores a late profile response after deactivate', async () => {
  let resolveProfile
  const pending = new Promise((resolve) => {
    resolveProfile = resolve
  })
  const harness = createHarness({ loadProfile: () => pending })

  harness.controller.initialize()
  await flush()
  assert.equal(harness.controller.deactivate(), true)
  resolveProfile({ type: 'success', hasPassword: true })
  await flush()

  assert.equal(harness.controller.getState().active, false)
  assert.equal(harness.controller.getState().passwordMode, 'create')
  assert.equal(harness.controllers[0].signal.aborted, true)
})

test('ignores a late profile response after dispose and releases listeners', async () => {
  let resolveProfile
  const pending = new Promise((resolve) => {
    resolveProfile = resolve
  })
  const harness = createHarness({ loadProfile: () => pending })
  let notifications = 0
  harness.controller.subscribe(() => {
    notifications += 1
  })

  harness.controller.initialize()
  await flush()
  const notificationsBeforeDispose = notifications
  harness.controller.dispose()
  resolveProfile({ type: 'success', hasPassword: true })
  await flush()

  assert.equal(harness.controller.getState().active, false)
  assert.equal(harness.controller.getState().passwordMode, 'create')
  assert.equal(notifications, notificationsBeforeDispose + 1)
  assert.equal(harness.controllers[0].signal.aborted, true)
})


