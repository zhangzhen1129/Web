import assert from 'node:assert/strict'
import test from 'node:test'

import { createMineController } from './mineController.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue
    reject = rejectValue
  })
  return { promise, resolve, reject }
}

function createHarness(overrides = {}) {
  const calls = []
  const services = {
    async loadProfile(request) {
      calls.push(['profile', request])
      return overrides.loadProfile ? overrides.loadProfile(request) : { type: 'success', maskedMobile: null }
    },
    async loadComplaintRedDot(request) {
      calls.push(['red-dot', request])
      return overrides.loadComplaintRedDot ? overrides.loadComplaintRedDot(request) : { type: 'success', showRedDot: false }
    },
    async deleteAccount() {
      calls.push(['delete'])
      return overrides.deleteAccount ? overrides.deleteAccount() : { type: 'success' }
    },
  }
  const controller = createMineController({
    services,
    navigate: (location) => {
      calls.push(['navigate', location])
      return Promise.resolve()
    },
    getFallbackMobileText: () => '980****00',
    clearGlobal: () => {
      calls.push(['clear'])
      return true
    },
    logout: () => {
      calls.push(['logout'])
      return true
    },
    showNativeLoading: () => calls.push(['show-loading']),
    hideNativeLoading: () => calls.push(['hide-loading']),
    onBusinessFailure: (message) => calls.push(['business-failure', message]),
    onRequestFailure: (error) => calls.push(['request-failure', error?.message ?? error]),
    onTerminalRisk: (code) => calls.push(['risk', code]),
    createAbortController: () => ({
      signal: 'signal',
      abort: () => calls.push(['abort']),
    }),
  })
  return { controller, calls }
}

async function flush() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

test('starts profile and red-dot requests once and applies only strict red-dot success', async () => {
  const { controller, calls } = createHarness({
    loadProfile: async () => ({ type: 'success', maskedMobile: '111****222' }),
    loadComplaintRedDot: async () => ({ type: 'success', showRedDot: true }),
  })

  controller.start()
  controller.start()
  await flush()

  assert.deepEqual(calls.filter(([name]) => name === 'profile').map(([, request]) => request.signal), ['signal'])
  assert.deepEqual(calls.filter(([name]) => name === 'red-dot').map(([, request]) => request.signal), ['signal'])
  assert.equal(controller.getState().phoneText, '111****222')
  assert.equal(controller.getState().showComplaintRedDot, true)
  assert.equal(calls.some(([name]) => name === 'show-loading' || name === 'hide-loading'), false)
})

test('uses the controlled fallback when profile succeeds without a mask or fails', async () => {
  const { controller, calls } = createHarness({
    loadProfile: async () => ({ type: 'business_failure', message: 'Try again' }),
  })

  controller.start()
  await flush()

  assert.equal(controller.getState().phoneText, '980****00')
  assert.deepEqual(calls.find(([name]) => name === 'business-failure'), ['business-failure', 'Try again'])
})

test('keeps red-dot failures silent and false', async () => {
  const { controller, calls } = createHarness({
    loadComplaintRedDot: async () => {
      throw new Error('Network unavailable')
    },
  })

  controller.start()
  await flush()

  assert.equal(controller.getState().showComplaintRedDot, false)
  assert.equal(calls.some(([name]) => name === 'business-failure' || name === 'request-failure'), false)
})

test('navigation locks one menu action until deactivation and uses only named routes', async () => {
  const { controller, calls } = createHarness()

  assert.equal(controller.requestMenu('orderList'), true)
  assert.equal(controller.requestMenu('bankCardInfo'), false)
  assert.deepEqual(calls.find(([name]) => name === 'navigate'), ['navigate', { name: 'orderList' }])

  controller.deactivate()
  assert.equal(controller.getState().navigationLocked, false)
})

test('delete dialog actions keep the primary operation non-destructive', async () => {
  const { controller, calls } = createHarness()

  assert.equal(controller.openDeleteDialog(), true)
  assert.equal(controller.openDeleteDialog(), false)
  assert.equal(controller.cancelDelete(), true)
  assert.equal(calls.some(([name]) => name === 'delete'), false)
})

test('confirm deletion closes the dialog, submits once, clears state, and logs out', async () => {
  const { controller, calls } = createHarness({
    deleteAccount: async () => ({ type: 'success' }),
  })
  controller.openDeleteDialog()

  assert.equal(await controller.confirmDelete(), true)
  assert.equal(await controller.confirmDelete(), false)
  assert.equal(controller.getState().deleteDialogVisible, false)
  assert.equal(controller.getState().deleteSubmitting, true)
  assert.equal(calls.filter(([name]) => name === 'delete').length, 1)
  assert.deepEqual(calls.filter(([name]) => name === 'clear' || name === 'logout'), [
    ['clear'],
    ['logout'],
  ])
  assert.deepEqual(calls.filter(([name]) => name === 'show-loading' || name === 'hide-loading'), [
    ['show-loading'],
    ['hide-loading'],
  ])
})

test('delete failure unlocks the menu and reports the protocol message', async () => {
  const { controller, calls } = createHarness({
    deleteAccount: async () => ({ type: 'business_failure', message: 'Denied' }),
  })
  controller.openDeleteDialog()

  assert.equal(await controller.confirmDelete(), false)
  assert.equal(controller.getState().deleteSubmitting, false)
  assert.deepEqual(calls.find(([name]) => name === 'business-failure'), ['business-failure', 'Denied'])
  assert.deepEqual(calls.filter(([name]) => name === 'show-loading' || name === 'hide-loading'), [
    ['show-loading'],
    ['hide-loading'],
  ])
})

test('delete success still runs global cleanup and logout after page disposal', async () => {
  const pending = deferred()
  const { controller, calls } = createHarness({
    deleteAccount: async () => pending.promise,
  })
  controller.openDeleteDialog()
  const deletion = controller.confirmDelete()
  controller.dispose()

  pending.resolve({ type: 'success' })
  assert.equal(await deletion, true)
  assert.deepEqual(calls.filter(([name]) => name === 'clear' || name === 'logout'), [
    ['clear'],
    ['logout'],
  ])
  assert.deepEqual(calls.filter(([name]) => name === 'show-loading' || name === 'hide-loading'), [
    ['show-loading'],
    ['hide-loading'],
  ])
})

test('keeps account deletion loading visible until the request reaches a terminal result', async () => {
  const pending = deferred()
  const { controller, calls } = createHarness({
    deleteAccount: async () => pending.promise,
  })
  controller.openDeleteDialog()
  const deletion = controller.confirmDelete()

  assert.deepEqual(calls.filter(([name]) => name === 'show-loading' || name === 'hide-loading'), [
    ['show-loading'],
  ])

  pending.resolve({ type: 'success' })
  assert.equal(await deletion, true)
  assert.deepEqual(calls.filter(([name]) => name === 'show-loading' || name === 'hide-loading'), [
    ['show-loading'],
    ['hide-loading'],
  ])
})

test('hides account deletion loading on request failure and duplicate confirmation', async () => {
  const pending = deferred()
  const { controller, calls } = createHarness({
    deleteAccount: async () => pending.promise,
  })
  controller.openDeleteDialog()

  const deletion = controller.confirmDelete()
  assert.equal(await controller.confirmDelete(), false)
  assert.deepEqual(calls.filter(([name]) => name === 'show-loading' || name === 'hide-loading'), [
    ['show-loading'],
  ])

  pending.reject(new Error('Network unavailable'))
  assert.equal(await deletion, false)
  assert.deepEqual(calls.filter(([name]) => name === 'show-loading' || name === 'hide-loading'), [
    ['show-loading'],
    ['hide-loading'],
  ])
})

test('hides account deletion loading when the page deactivates before the request resolves', async () => {
  const pending = deferred()
  const { controller, calls } = createHarness({
    deleteAccount: async () => pending.promise,
  })
  controller.openDeleteDialog()
  const deletion = controller.confirmDelete()

  controller.deactivate()
  assert.deepEqual(calls.filter(([name]) => name === 'show-loading' || name === 'hide-loading'), [
    ['show-loading'],
    ['hide-loading'],
  ])

  pending.resolve({ type: 'success' })
  assert.equal(await deletion, true)
  assert.deepEqual(calls.filter(([name]) => name === 'show-loading' || name === 'hide-loading'), [
    ['show-loading'],
    ['hide-loading'],
  ])
})
