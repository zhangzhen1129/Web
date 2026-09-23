import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('keeps repayment card visuals in separate components', () => {
  const page = readFileSync(new URL('./views/RepaymentTabPage.vue', import.meta.url), 'utf8')
  const repaying = readFileSync(new URL('./components/RepayingOrderCard.vue', import.meta.url), 'utf8')
  const overdue = readFileSync(new URL('./components/OverdueOrderCard.vue', import.meta.url), 'utf8')

  assert.match(page, /import RepayingOrderCard from '\.\.\/components\/RepayingOrderCard\.vue'/)
  assert.match(page, /import OverdueOrderCard from '\.\.\/components\/OverdueOrderCard\.vue'/)
  assert.match(repaying, /class="repaying-card"/)
  assert.match(overdue, /class="overdue-card"/)
  assert.match(repaying, /getRepaymentStatusText\(props\.order\.statusCode\)/)
  assert.match(overdue, /getRepaymentStatusText\(props\.order\.statusCode\)/)
  assert.doesNotMatch(repaying, /Pendiente de pago/)
  assert.doesNotMatch(overdue, /Atrasado/)
  assert.doesNotMatch(page, /v-html/)
})

test('uses a controlled custom badge instead of the homepage Vant placeholder', () => {
  const tabs = readFileSync(new URL('../home/components/HomeTabs.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(tabs, /import \{ Badge \} from 'vant'/)
  assert.match(tabs, /class="home-tab__badge"/)
  assert.match(tabs, /getRepaymentBadgeText\(props\.repaymentCount\)/)
})

test('implements pull refresh with the existing Vant PullRefresh component', () => {
  const page = readFileSync(new URL('./views/RepaymentTabPage.vue', import.meta.url), 'utf8')
  const controller = readFileSync(new URL('./repaymentController.js', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('./views/repaymentPage.css', import.meta.url), 'utf8')

  assert.match(page, /import \{ Loading, PullRefresh, Skeleton, showToast \} from 'vant'/)
  assert.match(page, /import 'vant\/es\/pull-refresh\/style'/)
  assert.match(page, /<PullRefresh/)
  assert.match(page, /class="repayment-page__refresh"/)
  assert.match(page, /@refresh="handleRefresh"/)
  assert.match(page, /controller\.refresh\(\)/)
  assert.match(page, /<template #pulling><Loading type="spinner" size="\.8rem" \/><\/template>/)
  assert.match(page, /<template #loosing><Loading type="spinner" size="\.8rem" \/><\/template>/)
  assert.match(page, /<template #loading><Loading type="spinner" size="\.8rem" \/><\/template>/)
  assert.doesNotMatch(page, /pullingText|pulling-text|loosingText|loosing-text|loadingText|loading-text/)
  assert.match(controller, /function refresh\(\)/)
  assert.match(styles, /\.repayment-page__refresh \{[\s\S]*?overflow-y: auto;/)
})

test('keeps the repayment sources free of inline CJK text', () => {
  const sources = [
    './views/RepaymentTabPage.vue',
    './views/repaymentPage.css',
    './repaymentController.js',
    './repaymentConstants.js',
    './repaymentText.js',
    './components/RepayingOrderCard.vue',
    './components/OverdueOrderCard.vue',
  ]

  for (const relativePath of sources) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /[\u4e00-\u9fff]/, `${relativePath} must not contain CJK characters`)
  }
})
