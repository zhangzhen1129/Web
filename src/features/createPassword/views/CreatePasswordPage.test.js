import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./CreatePasswordPage.vue', import.meta.url), 'utf8')

test('renders the confirmed create-password fields and live Figma assets', () => {
  assert.match(source, /defineOptions\(\{ name: 'CreatePasswordPage' \}\)/)
  assert.match(source, /import backAsset from '\.\.\/assets\/back\.svg'/)
  assert.match(source, /import passwordHiddenAsset from '\.\.\/assets\/password-hidden\.svg'/)
  assert.match(source, /import passwordVisibleAsset from '\.\.\/assets\/password-visible\.svg'/)
  assert.match(source, /id="create-password-new"/)
  assert.match(source, /id="create-password-confirm"/)
  assert.match(source, /maxlength="16"/)
  assert.match(source, /:type="state\.newPasswordVisible \? 'text' : 'password'"/)
  assert.match(source, /:type="state\.confirmPasswordVisible \? 'text' : 'password'"/)
  assert.match(source, /@submit\.prevent="controller\.submit\(\)"/)
  assert.match(source, /:disabled="!state\.submitEnabled"/)
})

test('does not contain an old-password field or a placeholder route component', () => {
  assert.doesNotMatch(source, /oldPassword|setOldPassword|Contraseña original/)
  assert.doesNotMatch(source, /RoutePlaceholder/)
})

test('keeps mobile read-only and independent from password controls', () => {
  assert.match(source, /role="group" aria-labelledby="create-password-mobile-label"/)
  assert.match(source, /state\.mobile \|\| CREATE_PASSWORD_TEXT\.placeholders\.mobile/)
  assert.doesNotMatch(source, /id="create-password-mobile"[\s\S]{0,160}<input/)
})
