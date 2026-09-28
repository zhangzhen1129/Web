import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./AddPaymentMethodPage.vue', import.meta.url), 'utf8')

test('uses Vant popups and a single page scroll container', () => {
  assert.match(source, /<Popup[\s\S]*:show="state\.dialog === 'bank'"/)
  assert.match(source, /<Popup[\s\S]*:show="state\.dialog === 'confirm'"/)
  assert.match(source, /:close-on-click-overlay="false"/)
  assert.match(source, /:lock-scroll="true"/)
  assert.match(source, /ref="scrollElement" class="add-payment-scroll"/)
})

test('does not call raw bridge APIs, storage, or unsafe HTML from the page', () => {
  assert.doesNotMatch(source, /window\.plahub|localStorage|sessionStorage|innerHTML|v-html|eval\(/)
  assert.doesNotMatch(source, /orderId|order_id|order-id/)
})

test('keeps bank business data in the shared bank module', () => {
  assert.match(source, /from '\.\.\/\.\.\/bank\/bankData\.js'/)
  assert.match(source, /from '\.\.\/\.\.\/bank\/bankForm\.js'/)
  assert.doesNotMatch(source, /BANK_OPTIONS\s*=\s*\[/)
})