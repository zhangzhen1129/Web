import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createNativePageLoadingAdapter } from './pageLoadingPort.js'

test('delegates loading cycles only through the home host semantic API', () => {
  const calls = []
  const adapter = createNativePageLoadingAdapter({
    showHomeHostLoading(input) { calls.push(['show', input]) },
    hideHomeHostLoading(input) { calls.push(['hide', input]) },
  })

  adapter.show('loading-1')
  adapter.hide('loading-1')

  assert.deepEqual(calls, [
    ['show', { loadingCycleId: 'loading-1' }],
    ['hide', { loadingCycleId: 'loading-1' }],
  ])
})

test('rejects adapters without the complete host loading contract', () => {
  assert.throws(() => createNativePageLoadingAdapter(), /HomeHostService/)
  assert.throws(() => createNativePageLoadingAdapter({ showHomeHostLoading() {} }), /HomeHostService/)
})

test('home page composes initialization and loading through the semantic host service', () => {
  const source = readFileSync(new URL('./views/HomePage.vue', import.meta.url), 'utf8')
  assert.match(source, /createHomeHostService\(\{ globalStore \}\)/)
  assert.match(source, /initializeHomeHostContext\(\{ initCycleId \}\)/)
  assert.match(source, /disposeHomeHostInit\(\{ initCycleId \}\)/)
  assert.doesNotMatch(source, /shared\/bridge|nativeAppInfoBootstrap|nativeTokenBootstrap|nativeThirdPartySdkIdentifiersBootstrap/)
})
