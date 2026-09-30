import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./SettingsPage.vue', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const styleSource = readFileSync(new URL('./settingsPage.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

function getCssRule(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
}

const popupBlocks = pageSource.match(/<Popup[\s\S]*?<\/Popup>/g) ?? []

test('uses the real settings dependencies and fixed SVG assets', () => {
  assert.match(pageSource, /createSettingsController/)
  assert.match(pageSource, /createSettingsServices\(\{ getGlobalState: \(\) => globalStore \}\)/)
  assert.match(pageSource, /import \{ SETTINGS_TEXT \} from '\.\.\/settingsText\.js'/)
  assert.match(pageSource, /import backAsset from '\.\.\/assets\/back\.svg'/)
  assert.match(pageSource, /import chevronAsset from '\.\.\/assets\/chevron\.svg'/)
  assert.match(pageSource, /import closeAsset from '\.\.\/assets\/close\.svg'/)
  assert.match(pageSource, /import logoutAsset from '\.\.\/assets\/logout\.svg'/)

  for (const asset of ['back.svg', 'chevron.svg', 'close.svg', 'logout.svg']) {
    const source = readFileSync(new URL(`../assets/${asset}`, import.meta.url), 'utf8')
    assert.match(source, /^\s*<svg\b/)
    assert.match(source, /<\/svg>\s*$/)
  }
})

test('renders exactly one password row from controller state', () => {
  assert.match(pageSource, /v-if="state\.passwordMode === 'change'"/)
  assert.match(pageSource, /v-else/)
  assert.match(pageSource, /SETTINGS_TEXT\.changePassword/)
  assert.match(pageSource, /SETTINGS_TEXT\.createPassword/)
  assert.match(pageSource, /controller\.requestPasswordNavigation\(\)/)
  assert.doesNotMatch(pageSource, /passwordMode === 'createPassword'|passwordMode === 'changePassword'/)
  assert.doesNotMatch(pageSource, /textContent|innerText/)
})

test('uses Vant center popups with the required close behavior and no custom transition', () => {
  assert.equal(popupBlocks.length, 2)
  assert.match(pageSource, /import \{ Popup, showToast \} from 'vant'/)
  assert.match(pageSource, /import 'vant\/es\/popup\/style'/)

  for (const popup of popupBlocks) {
    assert.match(popup, /position="center"/)
    assert.match(popup, /teleport="body"/)
    assert.match(popup, /:lock-scroll="true"/)
    assert.match(popup, /:close-on-popstate="true"/)
    assert.match(popup, /:close-on-click-overlay="true"/)
    assert.match(popup, /@update:show=/)
    assert.doesNotMatch(popup, /\bduration\b|:transition=|transition=/)
  }

  assert.match(pageSource, /data-action="terms"[\s\S]*requestTermsFromDialog\(\)/)
  assert.match(pageSource, /data-action="privacy"[\s\S]*requestPrivacyFromDialog\(\)/)
  assert.match(pageSource, /data-action="confirm-logout"[\s\S]*controller\.confirmLogout\(\)/)
  assert.match(pageSource, /data-action="cancel-logout"[\s\S]*controller\.cancelLogout\(\)/)
})

test('keeps navigation named-route only and delegates lifecycle to the controller', () => {
  assert.match(pageSource, /router\.currentRoute\.value\.name === routeName/)
  assert.match(pageSource, /router\.push\(\{ name: routeName \}\)/)
  assert.match(pageSource, /router\.replace\(\{ name: 'home' \}\)/)
  assert.match(pageSource, /dinero-pro:settings-bridge-diagnostic/)
  assert.match(pageSource, /onTerminalRisk: handleTerminalRisk/)
  assert.match(pageSource, /dinero-pro:settings-terminal-risk/)
  assert.match(pageSource, /onMounted\(\(\) => \{\s*controller\.initialize\(\)/)
  assert.match(pageSource, /onBeforeRouteLeave\(\(\) => \{\s*controller\.deactivate\(\)/)
  assert.match(pageSource, /onBeforeUnmount\(\(\) => \{\s*controller\.deactivate\(\)\s*unsubscribe\(\)\s*controller\.dispose\(\)/)
  assert.doesNotMatch(pageSource, /router\.push\(['"`]|location\.href|window\.open/)
})

test('contains no direct service, network, storage, unsafe HTML, or Chinese source', () => {
  assert.doesNotMatch(pageSource, /\b(axios|fetch|XMLHttpRequest|localStorage|sessionStorage)\b/)
  assert.doesNotMatch(pageSource, /\b(innerHTML|v-html|eval|new Function)\b/)
  assert.doesNotMatch(pageSource, /[\u3400-\u9fff]/)
  assert.doesNotMatch(styleSource, /[\u3400-\u9fff]/)
})

test('keeps the confirmed Figma layout geometry and single scroll container', () => {
  const pageRule = getCssRule(styleSource, '.settings-page')
  const headerRule = getCssRule(styleSource, '.settings-page__header')
  const contentRule = getCssRule(styleSource, '.settings-page__content')
  const rowRule = getCssRule(styleSource, '.settings-page__row')
  const footerRule = getCssRule(styleSource, '.settings-page__footer')
  const logoutRule = getCssRule(styleSource, '.settings-page__logout')
  const overlayRule = getCssRule(styleSource, '.settings-popup-overlay')
  const logoutPopupRule = getCssRule(styleSource, '.settings-logout-popup')
  const protocolRule = getCssRule(styleSource, '.settings-dialog--protocol')
  const closeIconRule = getCssRule(styleSource, '.settings-protocol-close img')
  const logoutDialogRule = getCssRule(styleSource, '.settings-dialog--logout')
  const logoutIconRule = getCssRule(styleSource, '.settings-logout-content__icon img')

  assert.match(pageRule, /height:\s*100dvh/)
  assert.match(pageRule, /padding-top:\s*var\(--app-safe-area-top\)/)
  assert.match(pageRule, /overflow-x:\s*hidden/)
  assert.match(pageRule, /overflow-y:\s*auto/)
  assert.equal((styleSource.match(/overflow-y:\s*auto/g) ?? []).length, 1)
  assert.match(headerRule, /height:\s*1\.64103rem/)
  assert.match(contentRule, /gap:\s*\.41026rem/)
  assert.match(contentRule, /padding:\s*\.41026rem \.41026rem 0/)
  assert.match(rowRule, /height:\s*1\.4359rem/)
  assert.match(rowRule, /border-radius:\s*\.41026rem/)
  assert.match(footerRule, /margin-top:\s*auto/)
  assert.match(footerRule, /padding:\s*\.41026rem \.41026rem calc\(\.61538rem \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(logoutRule, /background:\s*#f7430c/)
  assert.match(overlayRule, /background:\s*rgb\(0 0 0 \/ 70%\)/)
  assert.match(logoutPopupRule, /width:\s*8\.76923rem/)
  assert.match(logoutPopupRule, /max-width:\s*calc\(100vw - \.82051rem\)/)
  assert.match(protocolRule, /padding:\s*\.61538rem \.41026rem/)
  assert.match(closeIconRule, /width:\s*\.61538rem/)
  assert.match(closeIconRule, /height:\s*\.61538rem/)
  assert.match(logoutDialogRule, /gap:\s*1\.02564rem/)
  assert.match(logoutIconRule, /width:\s*\.82051rem/)
  assert.match(logoutIconRule, /height:\s*\.82051rem/)
  assert.doesNotMatch(styleSource, /\.van-(?:fade|popup-slide)/)
  assert.doesNotMatch(styleSource, /(?:^|[;{\s])(?:transition|animation)(?:-duration)?\s*:/)
})



