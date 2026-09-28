import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { ORDER_DEFERRAL_TEXT } from '../orderDeferralText.js'

const pageUrl = new URL('./OrderDeferralPage.vue', import.meta.url)
const styleUrl = new URL('./orderDeferralPage.css', import.meta.url)

test('page delegates network and bridge behavior to the controller and approved wrappers', () => {
  const source = readFileSync(pageUrl, 'utf8')
  assert.doesNotMatch(source, /axios|fetch\(|XMLHttpRequest|localStorage|sessionStorage|innerHTML|v-html|eval\(|window\.open|window\.plahub/)
  assert.doesNotMatch(source, /[\u3400-\u9fff]/)
  assert.match(source, /createOrderDeferralController/)
  assert.match(source, /createOrderDeferralServices/)
  assert.match(source, /showNativeLoading/)
  assert.match(source, /hideNativeLoading/)
  assert.match(source, /setPhysicalBackIntercept/)
  assert.match(source, /openPrivacyAgreementInAppNat/)
  assert.match(source, /v-if="state\.entryValid"/)
  assert.match(source, /:disabled="!isReady \|\| state\.submitting \|\| state\.navigationLocked"/)
  assert.match(source, /controller\.toggleDetails\(\)/)
  assert.match(source, /controller\.requestSubmit\(\)/)
})

test('layout keeps one scroll container, safe areas, sticky action, and Figma rem values', () => {
  const styles = readFileSync(styleUrl, 'utf8')
  assert.match(styles, /height:\s*100dvh/)
  assert.equal((styles.match(/overflow-y:\s*auto/g) ?? []).length, 1)
  assert.match(styles, /var\(--app-safe-area-top\)/)
  assert.match(styles, /env\(safe-area-inset-bottom\)/)
  assert.match(styles, /position:\s*sticky/)
  assert.doesNotMatch(styles, /transition|animation/)
  assert.match(styles, /7\.02564rem/)
  assert.match(styles, /1\.4359rem/)
  assert.match(styles, /\.41026rem/)
})

test('router replaces the deferDetail placeholder with the real dynamic component and keeps the guard', () => {
  const source = readFileSync(new URL('../../../router/index.js', import.meta.url), 'utf8')
  assert.match(source, /const OrderDeferralPage = \(\) => import\('\.\.\/features\/orderDeferral\/views\/OrderDeferralPage\.vue'\)/)
  assert.match(source, /name:\s*'deferDetail'[\s\S]{0,180}component:\s*OrderDeferralPage/)
  assert.match(source, /name:\s*'deferDetail'[\s\S]{0,260}beforeEnter:/)
  assert.doesNotMatch(source, /name:\s*'deferDetail'[\s\S]{0,180}RoutePlaceholder/)
})

test('confirmed Figma display text and dynamic values stay distinct', () => {
  assert.equal(ORDER_DEFERRAL_TEXT.pageTitle, 'Detalles del pedido')
  assert.equal(ORDER_DEFERRAL_TEXT.detailsTrigger, 'Ver el historial de prórrogas')
  assert.equal(ORDER_DEFERRAL_TEXT.submitAction, 'Prórroga')
  assert.equal(ORDER_DEFERRAL_TEXT.summaryTitleTemplate, 'Retraso de {days} días')
  assert.equal(ORDER_DEFERRAL_TEXT.summaryTitleTemplate.includes('Retraso de 7'), false)
})

test('Figma-derived assets are present and the summary badge removes the static sample day', () => {
  const assetNames = [
    'back.svg',
    'chevron.svg',
    'customer-service.svg',
    'progress-active.svg',
    'progress-inactive.svg',
    'summary-calendar-base.svg',
  ]
  assetNames.forEach((name) => assert.equal(existsSync(new URL(`../assets/${name}`, import.meta.url)), true))
  const summary = readFileSync(new URL('../assets/summary-calendar-base.svg', import.meta.url), 'utf8')
  assert.doesNotMatch(summary, /Vector_4/)
  assert.match(summary, /width="40"/)
  assert.match(summary, /height="40"/)
})
