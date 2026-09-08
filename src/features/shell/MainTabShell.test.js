import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('renders main tabs only for routes with a tab key', () => {
  const appSource = readFileSync(new URL('../../App.vue', import.meta.url), 'utf8')
  const routerSource = readFileSync(new URL('../../router/index.js', import.meta.url), 'utf8')

  assert.match(appSource, /const showMainTabs = computed\(\(\) => route\.meta\.showTab === true\)/)
  assert.match(appSource, /createHomeRouteConsumer\(\{ router \}\)/)
  assert.match(appSource, /installHomeRouteDispatcher\(router\)/)
  assert.match(appSource, /<HomeTabs v-if="showMainTabs" :tabs="tabs" @navigate="navigateTabIntent" \/>/)
  assert.match(routerSource, /component: MainTabShell/)
  assert.match(routerSource, /children: \[/)
  assert.match(routerSource, /showTab: true, tabKey: 'home'/)
  assert.match(routerSource, /component: MultiPushResultPlaceholder/)
  assert.match(routerSource, /beforeEnter:/)
  assert.match(routerSource, /Number\.isSafeInteger\(Number\(systemTime\)\)/)
})
