import test from 'node:test'
import assert from 'node:assert/strict'
import { dispatchHomeRouteIntent, installHomeRouteDispatcher } from './homeRouteDispatcher.js'

const intent = { intentId: 'intent-1', sourceOperationId: 'operation-1', target: 'account_tab' }

test('routes through the application dispatcher and does not expose a page-local router dependency', async () => {
  const calls = []
  const router = {
    currentRoute: { value: { name: 'home', query: {} } },
    push: async () => undefined,
    replace: async (location) => calls.push(location),
  }
  const dispose = installHomeRouteDispatcher(router)

  const result = await dispatchHomeRouteIntent({ routeIntent: intent })
  dispose()

  assert.equal(result.type, 'navigated')
  assert.deepEqual(calls, [{ name: 'mine', query: {} }])
  assert.equal((await dispatchHomeRouteIntent({ routeIntent: intent })).reason, 'router_unavailable')
})
