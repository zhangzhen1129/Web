import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const directory = dirname(fileURLToPath(import.meta.url))
const page = readFileSync(join(directory, 'IdentityPage.vue'), 'utf8')
const style = readFileSync(join(directory, 'identityPage.css'), 'utf8')

test('maps the identity states to accessible dynamic UI controls', () => {
  assert.match(page, /identity-title/)
  assert.match(page, /for="identity-dni"/)
  assert.match(page, /aria-busy/)
  assert.match(page, /identity-first-popup/)
  assert.match(page, /identity-progress-popup/)
  assert.match(page, /identity-leave-popup/)
  assert.match(page, /controller\.submit\(\)/)
  assert.match(page, /router\.replace\(\{ name: 'addBank'/)
  assert.match(style, /var\(--app-safe-area-top\)/)
  assert.match(style, /env\(safe-area-inset-bottom\)/)
  assert.match(style, /overflow-y: auto/)
  assert.doesNotMatch(page, /identity-status-bar|9:41/)
  assert.match(page, /class="identity-camera"/)
  assert.doesNotMatch(page, /v-if="!state\?\.imageBase64"/)
  assert.match(page, /left: progressPosition/)
  assert.match(page, /resumeFromExternalFlow/)
  assert.match(page, /pageshow/)
  assert.match(page, /visibilitychange/)
  assert.match(page, /blur/)
  assert.match(page, /focus/)
})

test('does not embed sensitive payloads, raw bridge calls, or authored SVG markup', () => {
  assert.doesNotMatch(page, /window\.(plahub|advanceCallBack)/)
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|axios/)
  assert.doesNotMatch(page, /innerHTML|v-html|new Function|eval\(/)
  assert.doesNotMatch(page, /base64|token|identityNo|h5LivenessId/)
  assert.doesNotMatch(page, /<svg|<path/)
})

