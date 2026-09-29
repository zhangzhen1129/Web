import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const routerSource = readFileSync(
  new URL('../../router/index.js', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n')

test('complainHome replaces the placeholder with a dynamic real page', () => {
  assert.match(routerSource, /const ComplaintHomePage = \(\) => import\('\.\.\/features\/complaint\/views\/ComplaintHomePage\.vue'\)/)
  assert.match(routerSource, /\{ path: 'complainHome', name: 'complainHome', component: ComplaintHomePage \},/)
  const homeRoute = routerSource
    .split('\n')
    .find((line) => line.includes("name: 'complainHome'")) ?? ''
  assert.doesNotMatch(homeRoute, /RoutePlaceholder|props:/)
  assert.doesNotMatch(routerSource, /title: 'Complaints'/)
})

test('complainEdit replaces the placeholder with a guarded dynamic real page', () => {
  const routeBlock = routerSource.match(/name: 'complainEdit'[\s\S]*?name: 'complainList'/)?.[0] ?? ''
  assert.match(routerSource, /const ComplaintEditPage = \(\) => import\('\.\.\/features\/complaint\/views\/ComplaintEditPage\.vue'\)/)
  assert.match(routerSource, /COMPLAIN_EDIT: '\/complainEdit'/)
  assert.match(routeBlock, /component: ComplaintEditPage/)
  assert.doesNotMatch(routeBlock, /RoutePlaceholder|props:/)
  assert.match(routeBlock, /const allowedKeys = \['type', 'question'\]/)
  assert.match(routeBlock, /queryKeys\.length === 2/)
  assert.match(routeBlock, /typeof to\.query\.type === 'string'/)
  assert.match(routeBlock, /agencyValues\.includes\(to\.query\.type\)/)
  assert.match(routeBlock, /typeof to\.query\.question === 'string'/)
  assert.match(routeBlock, /questionValues\.includes\(to\.query\.question\)/)
  assert.match(routeBlock, /return isValid \? true : \{ name: 'home' \}/)
})

test('complainList is a guarded dynamic placeholder without parameters', () => {
  const routeBlock = routerSource.match(/name: 'complainList'[\s\S]*?name: 'settings'/)?.[0] ?? ''
  assert.match(routerSource, /COMPLAIN_LIST: '\/complainList'/)
  assert.match(routeBlock, /component: RoutePlaceholder/)
  assert.match(routeBlock, /props: \{ title: 'Complaint records' \}/)
  assert.match(routeBlock, /queryKeys\.length === 0/)
  assert.match(routeBlock, /return isValid \? true : \{ name: 'home' \}/)
})
