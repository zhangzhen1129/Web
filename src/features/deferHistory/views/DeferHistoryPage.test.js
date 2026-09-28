import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageUrl = new URL('./DeferHistoryPage.vue', import.meta.url)
const styleUrl = new URL('./deferHistoryPage.css', import.meta.url)
const backAssetUrl = new URL('../assets/back.svg', import.meta.url)

test('records render dynamically and no Figma sample record values enter production paths', () => {
  const source = readFileSync(pageUrl, 'utf8')

  assert.match(source, /const records = computed\(\(\) => \(Array\.isArray\(state\.value\?\.records\)/)
  assert.match(source, /v-if="isReady"/)
  assert.match(source, /v-for="\(record, index\) in records"/)
  assert.doesNotMatch(source, /S\/ 5,000|2025-11-20|7 días|extensionStages/)
  assert.doesNotMatch(source, /\b(?:const|let|var)\s+records\s*=\s*\[/)
})

test('page shell is immediate and delegates lifecycle, requests, toasts, and navigation to approved contracts', () => {
  const source = readFileSync(pageUrl, 'utf8')

  assert.match(source, /createDeferHistoryController/)
  assert.match(source, /DEFER_HISTORY_PHASE/)
  assert.match(source, /createDeferHistoryServices\(\{ getGlobalState: \(\) => globalStore \}\)/)
  assert.match(source, /showNativeLoading/)
  assert.match(source, /hideNativeLoading/)
  assert.match(source, /setPhysicalBackIntercept/)
  assert.match(source, /onBusinessFailure: showMessage/)
  assert.match(source, /onRequestFailure: showMessage/)
  assert.match(source, /controller\.initialize\(route\.query\)/)
  assert.match(source, /controller\.subscribe\(/)
  assert.match(source, /unsubscribe\(\)/)
  assert.match(source, /controller\.dispose\(\)/)
  assert.match(source, /controller\.requestBack\(\)/)
  assert.match(source, /showToast\(\{ message: text, forbidClick: true \}\)/)
  assert.match(source, /window\.history\.state\?\.back/)
  assert.match(source, /router\.back\(\)/)
  assert.match(source, /router\.replace\(\{ name: 'home' \}\)/)
  assert.match(source, /<section class="defer-history-list">/)
  assert.doesNotMatch(source, /axios|fetch\(|XMLHttpRequest|localStorage|sessionStorage|innerHTML|v-html|eval\(|window\.plahub/)
  assert.doesNotMatch(source, /[\u3400-\u9fff]/)
})

test('stylesheet keeps one scroll container and matches the Figma scale and colors', () => {
  const styles = readFileSync(styleUrl, 'utf8')

  assert.match(styles, /height:\s*100dvh/)
  assert.equal((styles.match(/overflow-y:\s*auto/g) ?? []).length, 1)
  assert.match(styles, /height:\s*calc\(1\.64103rem \+ var\(--app-safe-area-top\)\)/)
  assert.match(styles, /var\(--app-safe-area-top\)/)
  assert.match(styles, /background:\s*#f8f9fc/)
  assert.match(styles, /color:\s*#333/)
  assert.match(styles, /font-size:\s*\.46154rem/)
  assert.match(styles, /font-weight:\s*900/)
  assert.match(styles, /width:\s*calc\(100% - \.82051rem\)/)
  assert.match(styles, /border-radius:\s*\.41026rem/)
  assert.match(styles, /box-shadow: inset 0 0 0 \.02564rem #e5e7eb/)
  assert.match(styles, /box-shadow: 0 \.05128rem \.20513rem rgb\(0 0 0 \/ 8%\)/)
  assert.match(styles, /gap:\s*\.41026rem/)
  assert.match(styles, /color:\s*#fc0f0f/)
  assert.match(styles, /overflow-wrap:\s*anywhere/)
  assert.doesNotMatch(styles, /transition|animation/)
})

test('back control uses the exact neutral Figma glyph', () => {
  const asset = readFileSync(backAssetUrl, 'utf8')

  assert.match(asset, /width="20"/)
  assert.match(asset, /height="20"/)
  assert.match(asset, /stroke="#1F2937"/)
  assert.doesNotMatch(asset, /#155DFC/i)
})

test('router replaces the defer history placeholder with the dynamic page and keeps the guard', () => {
  const source = readFileSync(new URL('../../../router/index.js', import.meta.url), 'utf8')

  assert.match(source, /const DeferHistoryPage = \(\) => import\('\.\.\/features\/deferHistory\/views\/DeferHistoryPage\.vue'\)/)
  assert.match(source, /name:\s*'deferHistory'[\s\S]{0,180}component:\s*DeferHistoryPage/)
  assert.match(source, /name:\s*'deferHistory'[\s\S]{0,400}beforeEnter:/)
  assert.doesNotMatch(source, /name:\s*'deferHistory'[\s\S]{0,120}RoutePlaceholder/)
  assert.match(source, /const allowedKeys = \['orderId', 'productId', 'orderStatus'\]/)
})

