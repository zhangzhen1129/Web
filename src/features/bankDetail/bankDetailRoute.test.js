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

test('addPaymentMethod replaces the placeholder with the real dynamic page and keeps its guard', () => {
  assert.match(routerSource, /ADD_PAYMENT_METHOD: '\/addPaymentMethod'/)
  assert.match(routerSource, /const AddPaymentMethodPage = \(\) => import\('\.\.\/features\/addPaymentMethod\/views\/AddPaymentMethodPage\.vue'\)/)
  assert.match(routerSource, /name: 'addPaymentMethod',\n          component: AddPaymentMethodPage,\n          beforeEnter: \(to\) => \(Object\.keys\(to\.query\)\.length === 0 \? true : \{ name: 'home' \}\)/)
  assert.doesNotMatch(routerSource, /name: 'addPaymentMethod'[\s\S]{0,180}RoutePlaceholder/)
  assert.doesNotMatch(routerSource, /component: RoutePlaceholder, props: \{ title: 'Add payment method' \}/)
})
