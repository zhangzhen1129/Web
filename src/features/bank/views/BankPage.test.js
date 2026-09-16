import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./BankPage.vue', import.meta.url), 'utf8')

test('uses Vant popups and keeps business popups separate from the page state', () => {
  assert.match(source, /<Popup[\s\S]*:show="state\?\.dialog === BANK_DIALOG\.BANK"/)
  assert.match(source, /<Popup[\s\S]*:show="state\?\.dialog === BANK_DIALOG\.CONFIRM"/)
  assert.match(source, /<Popup[\s\S]*:show="state\?\.dialog === BANK_DIALOG\.LEAVE"/)
  assert.match(source, /:close-on-click-overlay="false"/)
  assert.match(source, /:lock-scroll="true"/)
})

test('does not call raw bridge APIs, storage, or unsafe HTML from the page', () => {
  assert.doesNotMatch(source, /window\.plahub|localStorage|sessionStorage|innerHTML|v-html|eval\(/)
})
