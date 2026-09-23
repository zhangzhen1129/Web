import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

test('implements pull refresh with the existing Vant PullRefresh component', () => {
  const page = read('./views/OrderListPage.vue')
  const styles = read('./views/orderListPage.css')

  assert.match(page, /import \{ Loading, PullRefresh, Skeleton, showToast \} from 'vant'/)
  assert.match(page, /import 'vant\/es\/pull-refresh\/style'/)
  assert.match(page, /<PullRefresh/)
  assert.match(page, /class="order-list-page__refresh"/)
  assert.match(page, /@refresh="handleRefresh"/)
  assert.match(page, /controller\.refresh\(\)/)
  assert.match(page, /<template #pulling><Loading type="spinner" size="\.8rem" \/><\/template>/)
  assert.match(page, /<template #loosing><Loading type="spinner" size="\.8rem" \/><\/template>/)
  assert.match(page, /<template #loading><Loading type="spinner" size="\.8rem" \/><\/template>/)
  assert.doesNotMatch(page, /pullingText|pulling-text|loosingText|loosing-text|loadingText|loading-text/)
  assert.match(styles, /\.order-list-page__refresh \{[\s\S]*?overflow-y: auto;/)
})

test('keeps the skeleton exclusive to the first loading cycle', () => {
  const page = read('./views/OrderListPage.vue')

  assert.match(page, /v-if="isLoading"/)
  assert.match(page, /class="order-list-skeleton-card"/)
  assert.match(page, /const isLoading = computed\(\(\) => rootState\.value === ORDER_LIST_ROOT_STATE\.LOADING\)/)
})

test('routes only the card action button and the empty state action', () => {
  const card = read('./components/OrderListCard.vue')
  const page = read('./views/OrderListPage.vue')

  assert.doesNotMatch(card, /<article[^>]*@click/)
  assert.match(card, /@click="openOrder"/)
  assert.match(page, /@open="controller\.requestOrderAction"/)
  assert.match(page, /@click="controller\.requestHome\(\)"/)
})

test('consumes the shared network client and native loading wrappers only', () => {
  const service = read('./services/orderListService.js')
  const page = read('./views/OrderListPage.vue')

  assert.match(service, /import \{ networkClient \} from '\.\.\/\.\.\/\.\.\/shared\/network\/index\.js'/)
  assert.match(page, /import \{ hideNativeLoading, showNativeLoading \} from '\.\.\/\.\.\/\.\.\/shared\/bridge\/nativeLoading\.js'/)

  for (const source of [service, page]) {
    assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest/)
    assert.doesNotMatch(source, /window\.plahub|window\[['"]plahub['"]\]/)
    assert.doesNotMatch(source, /v-html|innerHTML|eval\(|new Function/)
  }
})

test('registers the real order list page as a dynamic route component', () => {
  const router = read('../../router/index.js')

  assert.match(router, /const OrderListPage = \(\) => import\('\.\.\/features\/orderList\/views\/OrderListPage\.vue'\)/)
  assert.match(router, /\{ path: 'orderList', name: 'orderList', component: OrderListPage \}/)
  assert.doesNotMatch(router, /path: 'orderList', name: 'orderList', component: RoutePlaceholder/)
})

test('keeps the order list sources free of inline CJK text', () => {
  const sources = [
    './orderListConstants.js',
    './orderListText.js',
    './orderListController.js',
    './services/orderListService.js',
    './components/OrderListCard.vue',
    './views/OrderListPage.vue',
    './views/orderListPage.css',
  ]

  for (const relativePath of sources) {
    assert.doesNotMatch(read(relativePath), /[\u4e00-\u9fff]/, `${relativePath} must not contain CJK characters`)
  }
})
