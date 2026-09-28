import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const routerSource = readFileSync(new URL('../../router/index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('bankDetail replaces the placeholder with the real dynamic page and keeps its guard', () => {
  assert.match(routerSource, /const BankDetailPage = \(\) => import\('\.\.\/features\/bankDetail\/views\/BankDetailPage\.vue'\)/)
  assert.match(routerSource, /BANK_DETAIL: '\/bankDetail'/)
  assert.match(routerSource, /name: 'bankDetail',\n          component: BankDetailPage,\n          beforeEnter:/)
  assert.match(routerSource, /const allowedKeys = \['orderId'\]/)
  assert.doesNotMatch(routerSource, /name: 'bankDetail'[\s\S]{0,180}RoutePlaceholder/)
  assert.doesNotMatch(routerSource, /name: 'bankDetail'[\s\S]{0,180}title: 'Update bank account'/)
})

test('addPaymentMethod is a dynamic no-parameter placeholder route with a controlled guard', () => {
  assert.match(routerSource, /ADD_PAYMENT_METHOD: '\/addPaymentMethod'/)
  assert.match(routerSource, /name: 'addPaymentMethod',\n          component: RoutePlaceholder,\n          props: \{ title: 'Add payment method' \},\n          beforeEnter: \(to\) => \(Object\.keys\(to\.query\)\.length === 0 \? true : \{ name: 'home' \}\)/)
  assert.doesNotMatch(routerSource, /import BankDetailPage from/)
  assert.doesNotMatch(routerSource, /component: RoutePlaceholder, props: \{ title: 'Add payment method' \}/)
})
