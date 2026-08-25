import assert from 'node:assert/strict'
import test from 'node:test'
import { createRuntimeRecovery, renderRuntimeRecovery } from './runtimeRecovery.js'

test('registers recoverable runtime handlers and emits only controlled diagnostic codes', () => {
  const listeners = new Map()
  const diagnostics = []
  const renders = []
  class TestCustomEvent {
    constructor(type, options) {
      this.type = type
      this.detail = options.detail
    }
  }
  const targetWindow = {
    CustomEvent: TestCustomEvent,
    addEventListener(type, listener) { listeners.set(type, listener) },
    removeEventListener(type) { listeners.delete(type) },
    dispatchEvent(event) { diagnostics.push(event.detail) },
  }
  const recovery = createRuntimeRecovery({
    targetWindow,
    targetDocument: {},
    render(documentValue, reload) { renders.push({ documentValue, reload }) },
  })

  recovery.install()
  listeners.get('unhandledrejection')({ reason: new Error('Token=secret') })
  listeners.get('error')({ message: 'password=secret' })
  recovery.handleStartupFailure(new Error('mobile=secret'))
  recovery.handleVueError(new Error('card=secret'))

  assert.deepEqual(diagnostics, [
    { code: 'RUNTIME_UNHANDLED_REJECTION', source: 'runtime' },
    { code: 'RUNTIME_RESOURCE_OR_SCRIPT_FAILED', source: 'runtime' },
    { code: 'RUNTIME_STARTUP_FAILED', source: 'runtime' },
    { code: 'RUNTIME_RENDER_FAILED', source: 'runtime' },
  ])
  assert.equal(renders.length, 4)
  recovery.dispose()
  assert.equal(listeners.size, 0)
})

test('renders one recovery panel and wires the reload action', () => {
  const elements = new Map()
  const root = {
    replaceChildren(child) {
      this.child = child
      elements.set(child.id, child)
    },
  }
  function createElement(tagName) {
    return {
      tagName,
      children: [],
      setAttribute(name, value) { this[name] = value },
      addEventListener(type, listener) { this[type] = listener },
      append(...children) { this.children.push(...children) },
    }
  }
  const targetDocument = {
    createElement,
    getElementById(id) { return id === 'app' ? root : elements.get(id) ?? null },
  }
  let reloadCount = 0

  assert.equal(renderRuntimeRecovery(targetDocument, () => { reloadCount += 1 }), true)
  assert.equal(renderRuntimeRecovery(targetDocument, () => { reloadCount += 1 }), true)
  assert.equal(root.child.children[0].textContent, 'No se pudo continuar.')
  assert.equal(root.child.children[1].textContent, 'Recargar')
  root.child.children[1].click()
  assert.equal(reloadCount, 1)
})
