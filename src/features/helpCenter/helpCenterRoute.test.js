import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const routerSource = readFileSync(new URL('../../router/index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const helpCenterRoute = routerSource
  .split('\n')
  .find((line) => line.includes("name: 'helpCenter'")) ?? ''

test('helpCenter replaces the placeholder with a dynamic real page', () => {
  assert.match(routerSource, /const HelpCenterPage = \(\) => import\('\.\.\/features\/helpCenter\/views\/HelpCenterPage\.vue'\)/)
  assert.match(helpCenterRoute, /\{ path: 'helpCenter', name: 'helpCenter', component: HelpCenterPage \},/)
  assert.doesNotMatch(helpCenterRoute, /RoutePlaceholder|props:/)
})

test('helpCenter keeps its registered path and empty contract metadata', () => {
  assert.match(routerSource, /HELP_CENTER: '\/helpCenter'/)
  assert.doesNotMatch(helpCenterRoute, /beforeEnter|meta:/)
})