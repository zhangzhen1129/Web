import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createLoanFailController } from './loanFailController.js'

function createHarness() {
  const events = []
  const controller = createLoanFailController({
    onNavigateBack() {
      events.push('back')
    },
    onNavigateHome() {
      events.push('home')
    },
  })
  return { controller, events }
}

test('accepts only a single non-empty orderId query and starts in ready', () => {
  const valid = createHarness()
  assert.equal(valid.controller.initialize({ orderId: 'order-1' }), true)
  assert.equal(valid.controller.getState().phase, 'ready')
  assert.equal(valid.controller.getState().navigationLocked, false)

  const invalidQueries = [
    undefined,
    {},
    { orderId: '' },
    { orderId: '   ' },
    { orderId: 1 },
    { orderId: ['order-1'] },
    { orderId: 'order-1', extra: 'x' },
  ]

  for (const query of invalidQueries) {
    const harness = createHarness()
    assert.equal(harness.controller.initialize(query), false)
    assert.equal(harness.controller.getState().phase, 'inactive')
    assert.equal(harness.events.length, 0)
  }
})

test('locks navigation before delegating back and home once per instance', () => {
  const backHarness = createHarness()
  backHarness.controller.initialize({ orderId: 'order-1' })
  assert.equal(backHarness.controller.requestBack(), true)
  assert.deepEqual(backHarness.events, ['back'])
  assert.equal(backHarness.controller.getState().phase, 'inactive')
  assert.equal(backHarness.controller.requestBack(), false)
  assert.equal(backHarness.controller.requestHome(), false)
  assert.deepEqual(backHarness.events, ['back'])

  const homeHarness = createHarness()
  homeHarness.controller.initialize({ orderId: 'order-1' })
  assert.equal(homeHarness.controller.requestHome(), true)
  assert.deepEqual(homeHarness.events, ['home'])
  assert.equal(homeHarness.controller.requestHome(), false)
  assert.equal(homeHarness.controller.requestBack(), false)
  assert.deepEqual(homeHarness.events, ['home'])
})

test('does not navigate before a valid instance is initialized', () => {
  const harness = createHarness()
  assert.equal(harness.controller.requestBack(), false)
  assert.equal(harness.controller.requestHome(), false)
  assert.deepEqual(harness.events, [])
})

test('dispose inactivates the instance and clears listeners', () => {
  const harness = createHarness()
  harness.controller.initialize({ orderId: 'order-1' })
  const observed = []
  const unsubscribe = harness.controller.subscribe((state) => {
    observed.push(state.phase)
  })
  unsubscribe()
  harness.controller.dispose()
  assert.equal(harness.controller.getState().phase, 'inactive')
  assert.equal(harness.controller.requestBack(), false)
  assert.deepEqual(harness.events, [])
})

test('page stays static and avoids interfaces, storage, and Chinese text', () => {
  const source = readFileSync(new URL('./views/LoanFailPage.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /axios|fetch\(|XMLHttpRequest|localStorage|sessionStorage|innerHTML|v-html|eval\(/)
  assert.doesNotMatch(source, /[\u3400-\u9fff]/)
  assert.match(source, /failure-illustration\.png/)
  assert.match(source, /createLoanFailController/)
})

test('layout keeps the design scale, safe area, and vertical scrolling', () => {
  const styles = readFileSync(new URL('./views/loanFailPage.css', import.meta.url), 'utf8')
  assert.match(styles, /height:\s*100dvh/)
  assert.match(styles, /var\(--app-safe-area-top\)/)
  assert.match(styles, /overflow-y:\s*auto/)
  assert.match(styles, /width:\s*4\.69231rem/)
  assert.match(styles, /height:\s*2\.76923rem/)
})
