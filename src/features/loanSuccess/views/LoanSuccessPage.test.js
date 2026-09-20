import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./LoanSuccessPage.vue', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./loanSuccessPage.css', import.meta.url), 'utf8')

test('uses the public controller, services, and loading components', () => {
  assert.match(source, /createLoanSuccessController/)
  assert.match(source, /createLoanSuccessServices/)
  assert.match(source, /createDataCollectionService/)
  assert.match(source, /<LoadingBar :status="state\.loadingBarStatus" \/>/)
})

test('keeps recommendation content visible while a submission is in progress', () => {
  assert.match(source, /const isRecommendationContent = computed\(\(\) => \(/)
  assert.match(source, /state\.value\?\.rootState === 'recommendation'/)
  assert.match(source, /state\.value\?\.rootState === 'submitting'/)
  assert.match(source, /v-if="isRecommendationContent"/)
})

test('does not call raw bridge APIs, storage, unsafe HTML, or Chinese text', () => {
  assert.doesNotMatch(source, /window\.plahub|localStorage|sessionStorage|innerHTML|v-html|eval\(/)
  assert.doesNotMatch(source, /[\u3400-\u9fff]/)
})

test('keeps the review gradient visible and centers the cancel action', () => {
  assert.match(styles, /\.loan-success-review__header\s*\{[^}]*background:\s*linear-gradient\(90deg,\s*#155dfc 0%,\s*#4f39f6 50%,\s*#9810fa 100%\)/s)
  assert.match(styles, /\.loan-success-modal__cancel\s*\{[^}]*display:\s*block;[^}]*width:\s*100%;[^}]*text-align:\s*center;/s)
})
