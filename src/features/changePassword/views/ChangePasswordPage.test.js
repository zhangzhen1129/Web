import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./ChangePasswordPage.vue', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const styleSource = readFileSync(new URL('./changePasswordPage.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('wires the page to the controlled controller, network, Toast, and Bridge adapters', () => {
  assert.match(pageSource, /createChangePasswordController/)
  assert.match(pageSource, /createChangePasswordServices\(\{ getGlobalState: \(\) => globalStore \}\)/)
  assert.match(pageSource, /import \{ showToast \} from 'vant'/)
  assert.match(pageSource, /import 'vant\/es\/toast\/style'/)
  assert.match(pageSource, /onStoreFailure: handleStoreFailure/)
  assert.match(pageSource, /showNativeLoading/)
  assert.match(pageSource, /hideNativeLoading/)
  assert.match(pageSource, /setNativeCachedToken/)
  assert.match(pageSource, /setNativeCachedUserId/)
  assert.doesNotMatch(pageSource, /\b(window\.plahub|localStorage|sessionStorage|axios|fetch|XMLHttpRequest)\b/)
})

test('renders one read-only mobile and exactly three password fields', () => {
  assert.equal((pageSource.match(/<input/g) ?? []).length, 3)
  assert.equal((pageSource.match(/<span class="change-password-field__label"/g) ?? []).length, 1)
  assert.equal((pageSource.match(/<label class="change-password-field__label"/g) ?? []).length, 3)
  assert.match(pageSource, /id="change-password-mobile-label"/)
  assert.match(pageSource, /role="group" aria-labelledby="change-password-mobile-label"/)
  assert.match(pageSource, /id="change-password-old"[\s\S]*type="text"/)
  assert.match(pageSource, /id="change-password-new"[\s\S]*state\.newPasswordVisible \? 'text' : 'password'/)
  assert.match(pageSource, /id="change-password-confirm"[\s\S]*state\.confirmPasswordVisible \? 'text' : 'password'/)
  assert.match(pageSource, /maxlength="16"/)
})

test('keeps password visibility independent and uses the exported Figma assets', () => {
  assert.match(pageSource, /import backAsset from '\.\.\/assets\/back\.svg'/)
  assert.match(pageSource, /import passwordHiddenAsset from '\.\.\/assets\/password-hidden\.svg'/)
  assert.match(pageSource, /import passwordVisibleAsset from '\.\.\/assets\/password-visible\.svg'/)
  assert.match(pageSource, /controller\.toggleNewPasswordVisibility\(\)/)
  assert.match(pageSource, /controller\.toggleConfirmPasswordVisibility\(\)/)
  assert.doesNotMatch(pageSource, /toggleOldPasswordVisibility|oldPasswordVisible/)

  for (const asset of ['back.svg', 'password-hidden.svg', 'password-visible.svg']) {
    const source = readFileSync(new URL(`../assets/${asset}`, import.meta.url), 'utf8')
    assert.match(source, /^\s*<svg\b/)
    assert.match(source, /<\/svg>\s*$/)
  }
})

test('contains no unsafe HTML, direct storage, or Chinese source text', () => {
  assert.doesNotMatch(pageSource, /\b(v-html|innerHTML|eval|new Function)\b/)
  assert.doesNotMatch(pageSource, /[\u3400-\u9fff]/)
  assert.doesNotMatch(styleSource, /[\u3400-\u9fff]/)
})

test('preserves the confirmed Figma geometry and a single scroll container', () => {
  assert.match(styleSource, /\.change-password-page\s*\{[\s\S]*?height:\s*100dvh/)
  assert.match(styleSource, /\.change-password-page\s*\{[\s\S]*?padding-top:\s*var\(--app-safe-area-top\)/)
  assert.equal((styleSource.match(/overflow-y:\s*auto/g) ?? []).length, 1)
  assert.match(styleSource, /\.change-password-header\s*\{[\s\S]*?height:\s*1\.64103rem/)
  assert.match(styleSource, /\.change-password-form\s*\{[\s\S]*?gap:\s*\.41026rem/)
  assert.match(styleSource, /\.change-password-control\s*\{[\s\S]*?height:\s*1\.4359rem[\s\S]*?border-radius:\s*\.41026rem/)
  assert.match(styleSource, /\.change-password-footer\s*\{[\s\S]*?margin-top:\s*auto/)
  assert.match(styleSource, /\.change-password-submit\s*\{[\s\S]*?height:\s*1\.4359rem[\s\S]*?background:\s*#155dfc/)
  assert.match(styleSource, /\.change-password-submit:disabled\s*\{[\s\S]*?background:\s*#d8d8d8[\s\S]*?color:\s*#979797/)
})
