import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ORDER_DETAIL_TEXT } from '../orderDetailText.js'

test('page delegates requests and navigation to the controller without direct network or bridge calls', () => {
  const source = readFileSync(new URL('./OrderDetailPage.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /axios|fetch\(|XMLHttpRequest|localStorage|sessionStorage|innerHTML|v-html|eval\(|window\.open|window\.plahub/)
  assert.doesNotMatch(source, /[\u3400-\u9fff]/)
  assert.match(source, /createOrderDetailController/)
  assert.match(source, /createOrderDetailServices/)
  assert.match(source, /openPrivacyAgreementInAppNat/)
  assert.match(source, /controller\.requestHelp\(\)/)
  assert.match(source, /controller\.requestPayment\(\)/)
})

test('layout keeps a single scroll container, safe-area, sticky actions, and Figma scale', () => {
  const styles = readFileSync(new URL('./orderDetailPage.css', import.meta.url), 'utf8')
  assert.match(styles, /height:\s*100dvh/)
  assert.match(styles, /overflow-y:\s*auto/)
  assert.match(styles, /var\(--app-safe-area-top\)/)
  assert.match(styles, /position:\s*sticky/)
  assert.match(styles, /1\.4359rem/)
  assert.match(styles, /\.41026rem/)
})

test('router replaces the placeholder with the real dynamic order detail component and keeps the guard', () => {
  const source = readFileSync(new URL('../../../router/index.js', import.meta.url), 'utf8')
  assert.match(source, /const OrderDetailPage = \(\) => import\('\.\.\/features\/orderDetail\/views\/OrderDetailPage\.vue'\)/)
  assert.match(source, /name:\s*'orderDetail'/)
  assert.match(source, /beforeEnter:/)
  assert.doesNotMatch(source, /name:\s*'orderDetail'[\s\S]{0,120}RoutePlaceholder/)
})

test('bottom action texts match the confirmed Figma button nodes', () => {
  assert.equal(ORDER_DETAIL_TEXT.actions.changeBankAccount, 'Cambio de cuenta de cobro')
  assert.equal(ORDER_DETAIL_TEXT.actions.applyAgain, 'Volver a solicitar un prestamo')
  assert.equal(ORDER_DETAIL_TEXT.actions.payNow, 'Pagar ahora')
  assert.equal(ORDER_DETAIL_TEXT.actions.extension, 'Prórroga')
})

test('bank detail route accepts only an optional order id', () => {
  const source = readFileSync(new URL('../../../router/index.js', import.meta.url), 'utf8')
  assert.match(source, /name:\s*'bankDetail'/)
  assert.match(source, /const allowedKeys = \['orderId'\]/)
  assert.doesNotMatch(source, /bankAccess/)
})
