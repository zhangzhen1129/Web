import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./HelpCenterPage.vue', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const styleSource = readFileSync(new URL('./helpCenterPage.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const routerSource = readFileSync(new URL('../../../router/index.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

function getCssRule(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
}

test('page renders from the controlled display model and fixed assets', () => {
  assert.match(pageSource, /createHelpCenterDisplayModel\(\{\s*content: getHelpCenterContent\(\),\s*config: HELP_CENTER_CONFIG,\s*\}\)/)
  assert.match(pageSource, /import backAsset from '\.\.\/assets\/back\.svg'/)
  assert.match(pageSource, /import chevronAsset from '\.\.\/assets\/chevron\.svg'/)
  assert.match(pageSource, /import workingHoursAsset from '\.\.\/assets\/working-hours\.svg'/)
  assert.match(pageSource, /import emailAsset from '\.\.\/assets\/email\.svg'/)
  assert.match(pageSource, /displayModel\.workingHours/)
  assert.match(pageSource, /displayModel\.email/)
  assert.match(pageSource, /v-for="faq in displayModel\.faqs"/)
  assert.doesNotMatch(pageSource, /my@data\.com|\{email\}/)
  assert.doesNotMatch(pageSource, /workingHours:\s*['"]|email:\s*['"]/)
})

test('page keeps the fixed selector contract and accessible FAQ state', () => {
  for (const selector of [
    'help-center-page',
    'help-center-header',
    'help-center-header__back',
    'help-center-info',
    'help-center-info__card',
    'help-center-faq',
    'help-center-faq__item',
    'help-center-faq__trigger',
    'help-center-faq__answer',
    'help-center-faq__answer-text',
    'help-center-faq__chevron',
    'help-center-fallback',
  ]) {
    assert.match(pageSource, new RegExp(selector))
    assert.match(styleSource, new RegExp(`\\.${selector}`))
  }

  assert.match(pageSource, /:aria-expanded="isExpanded\(faq\.id\)"/)
  assert.match(pageSource, /:aria-controls="getFaqAnswerId\(faq\.id\)"/)
  assert.match(pageSource, /role="region"/)
  assert.match(pageSource, /:aria-labelledby="getFaqTriggerId\(faq\.id\)"/)
  assert.match(pageSource, /:aria-hidden="isExpanded\(faq\.id\) \? 'false' : 'true'"/)
  assert.match(pageSource, /:aria-label="HELP_CENTER_UI_TEXT\.backLabel"/)
})

test('header and information cards follow the confirmed Figma geometry', () => {
  const headerRule = getCssRule(styleSource, '.help-center-header')
  const cardRule = getCssRule(styleSource, '.help-center-info__card')
  assert.match(headerRule, /position:\s*relative/)
  assert.doesNotMatch(headerRule, /sticky|top:/)
  assert.match(cardRule, /justify-content:\s*flex-start/)
  assert.match(cardRule, /padding:\s*\.35897rem \.20513rem \.20513rem/)
  assert.match(cardRule, /background:\s*transparent/)
})

test('FAQ motion uses CSS grid transitions with reverse-safe reduced motion', () => {
  assert.match(styleSource, /grid-template-rows:\s*0fr/)
  assert.match(styleSource, /grid-template-rows:\s*1fr/)
  assert.match(styleSource, /transition:\s*grid-template-rows/)
  assert.match(styleSource, /rotate\(90deg\)/)
  assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(styleSource, /--help-center-motion-duration:\s*1ms/)
  assert.doesNotMatch(getCssRule(styleSource, '.help-center-faq__answer'), /overflow-y/)
})

test('page excludes direct network, storage, bridge, unsafe render, timers, and listeners', () => {
  assert.doesNotMatch(pageSource, /\b(axios|fetch|XMLHttpRequest|localStorage|sessionStorage|innerHTML|v-html|eval|new Function|window\.open)\b/)
  assert.doesNotMatch(pageSource, /setTimeout|setInterval|addEventListener|removeEventListener/)
  assert.doesNotMatch(pageSource, /[\u3400-\u9fff]/)
  assert.doesNotMatch(styleSource, /[\u3400-\u9fff]/)
})

test('router keeps the registered route contract and uses a dynamic page import', () => {
  assert.match(routerSource, /const HelpCenterPage = \(\) => import\('\.\.\/features\/helpCenter\/views\/HelpCenterPage\.vue'\)/)
  assert.match(routerSource, /\{ path: 'helpCenter', name: 'helpCenter', component: HelpCenterPage \},/)
  assert.match(routerSource, /HELP_CENTER: '\/helpCenter'/)

  const helpCenterRoute = routerSource
    .split('\n')
    .find((line) => line.includes("name: 'helpCenter'")) ?? ''
  assert.match(helpCenterRoute, /path: 'helpCenter'/)
  assert.doesNotMatch(helpCenterRoute, /RoutePlaceholder|beforeEnter|meta:|props:/)
})
