import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./LoanSuccessPage.vue', import.meta.url), 'utf8')

test('uses the public controller, services, and loading components', () => {
  assert.match(source, /createLoanSuccessController/)
  assert.match(source, /createLoanSuccessServices/)
  assert.match(source, /createDataCollectionService/)
  assert.match(source, /<LoadingBar :status="state\.loadingBarStatus" \/>/)
})

test('does not call raw bridge APIs, storage, unsafe HTML, or Chinese text', () => {
  assert.doesNotMatch(source, /window\.plahub|localStorage|sessionStorage|innerHTML|v-html|eval\(/)
  assert.doesNotMatch(source, /[\u3400-\u9fff]/)
})
