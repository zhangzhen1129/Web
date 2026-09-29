import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./ComplaintHomePage.vue', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const styleSource = readFileSync(new URL('./complaintHomePage.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

function getCssRule(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
}

const popupBlocks = pageSource.match(/<Popup[\s\S]*?<\/Popup>/g) ?? []
const centerPopup = popupBlocks.find((block) => block.includes('position="center"')) ?? ''
const bottomPopup = popupBlocks.find((block) => block.includes('position="bottom"')) ?? ''

test('renders every visible value from the controlled complaint content', () => {
  for (const field of [
    'title',
    'agencySelectorLabel',
    'agencyOptions',
    'questionTypes',
    'tips',
    'complaintRecordLabel',
    'customerServiceText',
    'questionPopupTitle',
  ]) {
    assert.match(pageSource, new RegExp(`COMPLAINT_CONTENT\\.${field}`))
  }

  assert.doesNotMatch(pageSource, /Quejas|Seleccione una agencia|Atención al cliente|Registro de quejas/)
})

test('uses two Vant Popup carriers with default transitions and explicit close behavior', () => {
  assert.equal(popupBlocks.length, 2)
  assert.match(pageSource, /import \{ Popup \} from 'vant'/)
  assert.match(pageSource, /import 'vant\/es\/popup\/style'/)

  for (const popup of [centerPopup, bottomPopup]) {
    assert.match(popup, /teleport="body"/)
    assert.match(popup, /:lazy-render="false"/)
    assert.match(popup, /:close-on-click-overlay="false"/)
    assert.match(popup, /:close-on-popstate="true"/)
    assert.match(popup, /:lock-scroll="true"/)
    assert.match(popup, /aria-modal="true"/)
    assert.match(popup, /aria-labelledby=/)
    assert.match(popup, /@update:show=/)
    assert.doesNotMatch(popup, /\bduration\b|:transition=|transition=/)
  }

  assert.match(centerPopup, /position="center"/)
  assert.match(bottomPopup, /position="bottom"/)
})

test('shows the second agency as the visual default until controller selection exists', () => {
  assert.match(pageSource, /const DEFAULT_AGENCY_INDEX = 1/)
  assert.match(pageSource, /return index === DEFAULT_AGENCY_INDEX/)
  assert.match(pageSource, /selectedAgency\.value === agency\.value/)
  assert.match(pageSource, /complaint-agency__option--selected/)
  assert.match(pageSource, /:aria-pressed="isAgencySelected\(agency, index\)"/)
})

test('shows the red dot only for a strict true controller value', () => {
  assert.match(pageSource, /v-if="state\.showRedDot === true"/)
  assert.match(pageSource, /complaint-record__red-dot/)
  assert.match(pageSource, /:src="redDotAsset"/)
})

test('renders question types from content and delegates selection to the controller', () => {
  assert.match(pageSource, /v-for="option in COMPLAINT_CONTENT\.questionTypes"/)
  assert.match(pageSource, /@click="controller\.selectQuestion\(option\.value\)"/)
  assert.match(pageSource, /:aria-label="option\.label"/)
  assert.doesNotMatch(pageSource, /submit|confirm/i)
})

test('wires page lifecycle without raw network, storage, external navigation, or physical back handling', () => {
  assert.match(pageSource, /onMounted\(\(\) => controller\.start\(\)\)/)
  assert.match(pageSource, /onBeforeRouteLeave\(\(\) => \{\s*controller\.deactivate\(\)/)
  assert.match(pageSource, /onBeforeUnmount\(\(\) => \{\s*controller\.deactivate\(\)\s*unsubscribe\(\)\s*controller\.dispose\(\)/)
  assert.doesNotMatch(pageSource, /\b(axios|fetch|XMLHttpRequest|localStorage|sessionStorage|window\.open|location\.href|setPhysicalBackIntercept)\b/)
  assert.doesNotMatch(pageSource, /\b(innerHTML|v-html|eval|new Function)\b/)
  assert.doesNotMatch(pageSource, /[\u3400-\u9fff]/)
})

test('keeps one page scroll container and the confirmed Figma rem geometry', () => {
  const pageRule = getCssRule(styleSource, '.complaint-page')
  const headerRule = getCssRule(styleSource, '.complaint-page__header')
  const backRule = getCssRule(styleSource, '.complaint-page__back')
  const customerServiceRule = getCssRule(styleSource, '.complaint-page__customer-service')
  const headerIconRule = styleSource.match(/\.complaint-page__back img,\s*\.complaint-page__customer-service img\s*\{([^}]*)\}/)?.[1] ?? ''
  const contentRule = getCssRule(styleSource, '.complaint-page__content')
  const agencyOptionRule = styleSource.match(/\.complaint-agency__option,\s*\.complaint-question-option\s*\{([^}]*)\}/)?.[1] ?? ''
  const agencyOptionsRule = getCssRule(styleSource, '.complaint-agency__options')
  const tipsRule = getCssRule(styleSource, '.complaint-tips')
  const customerLayerRule = getCssRule(styleSource, '.complaint-customer-layer')
  const customerCardRule = getCssRule(styleSource, '.complaint-customer-card')
  const customerPopupRule = getCssRule(styleSource, '.complaint-customer-popup')
  const questionTitleRule = getCssRule(styleSource, '.complaint-question-header h2')
  const customerCloseIconRule = getCssRule(styleSource, '.complaint-customer-close img')
  const questionCloseIconRule = getCssRule(styleSource, '.complaint-question-close img')
  const redDotRule = getCssRule(styleSource, '.complaint-record__red-dot')
  const questionSheetRule = getCssRule(styleSource, '.complaint-question-sheet')
  const questionOptionsRule = getCssRule(styleSource, '.complaint-question-options')

  assert.match(pageRule, /height:\s*100dvh/)
  assert.match(pageRule, /overflow-y:\s*auto/)
  assert.match(headerRule, /height:\s*1\.64103rem/)
  assert.match(backRule, /width:\s*1\.12821rem/)
  assert.match(backRule, /height:\s*1\.12821rem/)
  assert.match(backRule, /border-radius:\s*\.30769rem/)
  assert.match(backRule, /background:\s*#fff/)
  assert.match(backRule, /box-shadow:\s*0 \.05128rem \.10256rem/)
  assert.match(customerServiceRule, /width:\s*1\.12821rem/)
  assert.match(customerServiceRule, /height:\s*1\.12821rem/)
  assert.match(customerServiceRule, /background:\s*transparent/)
  assert.match(customerServiceRule, /box-shadow:\s*none/)
  assert.doesNotMatch(customerServiceRule, /border-radius/)
  assert.match(headerIconRule, /width:\s*\.51282rem/)
  assert.match(headerIconRule, /height:\s*\.51282rem/)
  assert.match(contentRule, /padding:\s*\.69231rem \.41026rem 0/)
  assert.match(agencyOptionRule, /height:\s*1\.07692rem/)
  assert.match(agencyOptionRule, /border-radius:\s*\.51282rem/)
  assert.match(agencyOptionsRule, /gap:\s*\.35897rem/)
  assert.match(styleSource, /\.complaint-question-option:focus-visible\s*\{[^}]*border-color:\s*#155dfc[^}]*color:\s*#155dfc[^}]*font-weight:\s*700/)
  assert.match(tipsRule, /margin-top:\s*\.35897rem/)
  assert.match(tipsRule, /font-size:\s*\.30769rem/)
  assert.match(tipsRule, /line-height:\s*\.46154rem/)
  assert.match(customerLayerRule, /width:\s*8\.76923rem/)
  assert.match(customerCardRule, /padding:\s*\.61538rem \.41026rem/)
  assert.match(customerCardRule, /border-radius:\s*\.61538rem/)
  assert.match(customerPopupRule, /top:\s*44\.55%/)
  assert.doesNotMatch(customerPopupRule, /transition|animation|transform|duration/)
  assert.match(questionSheetRule, /min-height:\s*9\.84615rem/)
  assert.match(questionSheetRule, /padding:\s*\.61538rem \.41026rem calc\(\.41026rem \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(questionSheetRule, /border-radius:\s*\.61538rem \.61538rem 0 0/)
  assert.match(questionOptionsRule, /gap:\s*\.61538rem/)
  assert.match(questionOptionsRule, /margin-top:\s*1\.02564rem/)
  assert.match(questionTitleRule, /font-size:\s*\.61538rem/)
  assert.match(questionTitleRule, /line-height:\s*\.82051rem/)
  assert.match(customerCloseIconRule, /width:\s*\.61538rem/)
  assert.match(customerCloseIconRule, /height:\s*\.61538rem/)
  assert.match(questionCloseIconRule, /width:\s*\.61538rem/)
  assert.match(questionCloseIconRule, /height:\s*\.66667rem/)
  assert.match(redDotRule, /width:\s*\.15385rem/)
  assert.match(redDotRule, /height:\s*\.15385rem/)
  assert.doesNotMatch(styleSource, /\.van-(?:fade|popup-slide)/)
  assert.doesNotMatch(styleSource, /(?:^|[;{\s])(?:transition|animation)(?:-duration)?\s*:/)
  assert.doesNotMatch(styleSource, /[\u3400-\u9fff]/)
})