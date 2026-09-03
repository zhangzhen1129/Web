import assert from 'node:assert/strict'
import test from 'node:test'
import { createVConsoleManager } from './vConsole.js'

function createHarness({ loaderFailure = false, constructorFailure = false } = {}) {
  const instances = []
  const diagnostics = []
  class TestVConsole {
    constructor(options) {
      if (constructorFailure) throw new Error('constructor failed')
      this.options = options
      instances.push(this)
    }
  }
  const manager = createVConsoleManager({
    loadVConsole() {
      if (loaderFailure) return Promise.reject(new Error('loader failed'))
      return Promise.resolve({ default: TestVConsole })
    },
    diagnostic(code) {
      diagnostics.push(code)
    },
  })
  return { diagnostics, instances, manager }
}

test('enables only the non-production default and true boolean cases', async () => {
  for (const [isProduction, hasArgument, value, expectedCount] of [
    [false, false, undefined, 1],
    [false, true, true, 1],
    [false, true, false, 0],
    [true, false, undefined, 0],
    [true, true, true, 0],
    [true, true, false, 0],
  ]) {
    const { instances, manager } = createHarness()
    const result = hasArgument
      ? await manager.initializeForEnvironment(isProduction, value)
      : await manager.initializeForEnvironment(isProduction)
    assert.equal(instances.length, expectedCount)
    assert.equal(result, expectedCount === 1 ? instances[0] : null)
  }
})

test('creates one concurrent singleton with the default plugin set', async () => {
  const { instances, manager } = createHarness()
  const first = manager.initializeForEnvironment(false, true)
  const second = manager.initializeForEnvironment(false, true)
  const [firstInstance, secondInstance] = await Promise.all([first, second])

  assert.equal(instances.length, 1)
  assert.equal(firstInstance, secondInstance)
  assert.equal(firstInstance.options, undefined)
  assert.equal(await manager.initializeForEnvironment(false, true), firstInstance)
  assert.equal(instances.length, 1)
})

test('contains loader and constructor failures without retaining an instance', async () => {
  for (const options of [{ loaderFailure: true }, { constructorFailure: true }]) {
    const { diagnostics, manager } = createHarness(options)
    assert.equal(await manager.initializeForEnvironment(false, true), null)
    assert.equal(manager.getInstance(), null)
    assert.deepEqual(diagnostics, ['VCONSOLE_INIT_FAILED'])
  }
})

test('contains diagnostic reporter failures after initialization errors', async () => {
  const manager = createVConsoleManager({
    loadVConsole() {
      return Promise.reject(new Error('sensitive loader detail'))
    },
    diagnostic() {
      throw new Error('diagnostic unavailable')
    },
  })

  assert.equal(await manager.initializeForEnvironment(false, true), null)
  assert.equal(manager.getInstance(), null)
})

test('rejects non-boolean environment inputs', async () => {
  const { instances, manager } = createHarness()
  assert.equal(await manager.initializeForEnvironment(false, 'false'), null)
  assert.equal(await manager.initializeForEnvironment('false', true), null)
  assert.equal(instances.length, 0)
})
