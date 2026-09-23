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
