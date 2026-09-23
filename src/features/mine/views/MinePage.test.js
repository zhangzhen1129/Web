import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('replaces the mine placeholder with a dynamic real page and keeps its route contract', () => {
  const source = readFileSync(new URL('../../../router/index.js', import.meta.url), 'utf8')
  assert.match(source, /const MinePage = \(\) => import\('\.\.\/features\/mine\/views\/MinePage\.vue'\)/)
  assert.match(source, /path: ROUTE_PATH\.MINE, name: 'mine', component: MinePage, meta: \{ showTab: true, tabKey: 'account' \}/)
  assert.doesNotMatch(source, /path: ROUTE_PATH\.MINE[\s\S]{0,120}RoutePlaceholder/)
})

test('page source keeps bridge access controlled and avoids raw storage or unsafe HTML', () => {
  const source = readFileSync(new URL('./MinePage.vue', import.meta.url), 'utf8')
  assert.match(source, /logoutToOtpLoginNative/)
  assert.doesNotMatch(source, /window\.plahub|localStorage|sessionStorage|v-html|innerHTML/)
})

test('page source contains no Chinese characters', () => {
  const source = readFileSync(new URL('./MinePage.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /[\u4e00-\u9fff]/)
})

test('page uses the controlled native loading wrapper only through the controller', () => {
  const source = readFileSync(new URL('./MinePage.vue', import.meta.url), 'utf8')
  const serviceSource = readFileSync(new URL('../services/mineServices.js', import.meta.url), 'utf8')

  assert.match(source, /showNativeLoading/)
  assert.match(source, /hideNativeLoading/)
  assert.doesNotMatch(serviceSource, /nativeLoading|showNativeLoading|hideNativeLoading|showLoading|hideLoading/)
})
