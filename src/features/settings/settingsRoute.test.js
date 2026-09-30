import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { SETTINGS_ROUTE_TITLES } from './settingsRouteText.js'

const routerSource = readFileSync(new URL('../../router/index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const expectedChildRoutes = Object.freeze([
  Object.freeze({
    constant: 'TERMS',
    path: '/terms',
    name: 'terms',
    textKey: 'terms',
  }),
  Object.freeze({
    constant: 'PRIVACY',
    path: '/privacy',
    name: 'privacy',
    textKey: 'privacy',
  }),
])

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function routeLine(name) {
  return routerSource
    .split('\n')
    .find((line) => line.includes(`name: '${name}'`)) ?? ''
}

test('settings replaces only the placeholder component and keeps its route contract', () => {
  assert.match(routerSource, /import \{ SETTINGS_ROUTE_TITLES \} from '\.\.\/features\/settings\/settingsRouteText\.js'/)
  assert.match(routerSource, /const SettingsPage = \(\) => import\('\.\.\/features\/settings\/views\/SettingsPage\.vue'\)/)
  assert.match(routerSource, /SETTINGS: '\/settings'/)

  const settingsRoute = routeLine('settings')
  assert.match(settingsRoute, /path: 'settings'/)
  assert.match(settingsRoute, /component: SettingsPage/)
  assert.doesNotMatch(settingsRoute, /RoutePlaceholder|props|beforeEnter|meta|query|params/)
})

test('registers two dynamic placeholder child routes with controlled titles', () => {
  assert.match(routerSource, /const RoutePlaceholder = \(\) => import\('\.\/RoutePlaceholder\.vue'\)/)

  for (const route of expectedChildRoutes) {
    assert.match(
      routerSource,
      new RegExp(`${route.constant}: '${escapeRegExp(route.path)}'`),
    )

    const childRoute = routeLine(route.name)
    assert.match(childRoute, new RegExp(`path: ROUTE_PATH\\.${route.constant}`))
    assert.match(childRoute, /component: RoutePlaceholder/)
    assert.match(childRoute, new RegExp(`props: \\{ title: SETTINGS_ROUTE_TITLES\\.${route.textKey} \\}`))
    assert.doesNotMatch(childRoute, /path: '[^']*:[^']*'|beforeEnter|meta|query|params/)
  }
})

test('replaces createPassword with the real dynamic page without changing route contract', () => {
  assert.match(routerSource, /const CreatePasswordPage = \(\) => import\('\.\.\/features\/createPassword\/views\/CreatePasswordPage\.vue'\)/)
  assert.match(routerSource, /CREATE_PASSWORD: '\/createPassword'/)

  const route = routeLine('createPassword')
  assert.match(route, /path: ROUTE_PATH\.CREATE_PASSWORD/)
  assert.match(route, /component: CreatePasswordPage/)
  assert.doesNotMatch(route, /RoutePlaceholder|props|beforeEnter|meta|query|params/)
})

test('replaces retrievePassword with the real dynamic page without changing route contract', () => {
  assert.match(routerSource, /const ChangePasswordPage = \(\) => import\('\.\.\/features\/changePassword\/views\/ChangePasswordPage\.vue'\)/)
  assert.match(routerSource, /RETRIEVE_PASSWORD: '\/retrievePassword'/)

  const route = routeLine('retrievePassword')
  assert.match(route, /path: ROUTE_PATH\.RETRIEVE_PASSWORD/)
  assert.match(route, /component: ChangePasswordPage/)
  assert.doesNotMatch(route, /RoutePlaceholder|props|beforeEnter|meta|query|params/)
})

test('uses the live Figma route titles without hardcoding them in the router', () => {
  assert.deepEqual(SETTINGS_ROUTE_TITLES, {
    createPassword: 'Crear una contraseña',
    retrievePassword: 'Cambiar contraseña',
    terms: 'Condiciones del servicio',
    privacy: 'Política de privacidad',
  })
  assert.equal(Object.isFrozen(SETTINGS_ROUTE_TITLES), true)

  for (const title of Object.values(SETTINGS_ROUTE_TITLES)) {
    assert.doesNotMatch(routerSource, new RegExp(escapeRegExp(title)))
  }
})

test('keeps every route name unique', () => {
  const routeNames = Array.from(routerSource.matchAll(/^\s*(?:\{\s*path:[^\n]*?,\s*)?name:\s*'([^']+)'/gm), (match) => match[1])
  assert.equal(new Set(routeNames).size, routeNames.length)
})