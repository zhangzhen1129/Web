import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./LoanConfirmPage.vue', import.meta.url), 'utf8')

test('uses the public data collection and loading components', () => {
  assert.match(source, /createDataCollectionService/)
  assert.match(source, /<LoadingBar :status="state\.loadingBarStatus" \/>/)
  assert.match(source, /createLoanConfirmController/)
})

test('does not call raw bridge APIs, storage, or unsafe HTML from the page', () => {
  assert.doesNotMatch(source, /window\.plahub|localStorage|sessionStorage|innerHTML|v-html|eval\(/)
})

test('keeps the page source free of Chinese characters', () => {
  assert.doesNotMatch(source, /[\u3400-\u9fff]/)
})
