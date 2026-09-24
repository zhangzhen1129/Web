import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./MultiPushResultPage.vue', import.meta.url), 'utf8')
const routerSource = readFileSync(new URL('../../../router/index.js', import.meta.url), 'utf8')

test('reuses the shared success controller, multi push services, and loading component', () => {
  assert.match(source, /createLoanSuccessController/)
  assert.match(source, /createMultiPushResultServices/)
  assert.match(source, /createDataCollectionService/)
  assert.match(source, /<LoadingBar :status="state\.loadingBarStatus" \/>/)
})

test('uses Vant Popup as the overlay carrier with center default transitions', () => {
  assert.match(source, /import \{ Popup, showToast \} from 'vant'/)
  assert.match(source, /import 'vant\/es\/popup\/style'/)
  assert.match(source, /<Popup[\s\S]*position="center"[\s\S]*:close-on-click-overlay="false"/)
  assert.doesNotMatch(source, /class="loan-success-mask"/)
  assert.doesNotMatch(source, /<Transition|transition:|animation:/)
})

test('keeps recommendation content visible while a submission is in progress', () => {
  assert.match(source, /const isRecommendationContent = computed\(\(\) => \(/)
  assert.match(source, /state\.value\?\.rootState === 'recommendation'/)
  assert.match(source, /state\.value\?\.rootState === 'submitting'/)
  assert.match(source, /v-if="isRecommendationContent"/)
})

test('does not call the permission capability, raw bridge APIs, storage, or unsafe HTML', () => {
  assert.doesNotMatch(source, /requestNativeOneClickPermissions|H5-INT-006/)
  assert.doesNotMatch(source, /window\.plahub|localStorage|sessionStorage|innerHTML|v-html|eval\(/)
  assert.doesNotMatch(source, /[\u3400-\u9fff]/)
})

test('does not accept the single query parameter', () => {
  assert.doesNotMatch(source, /single/)
  assert.doesNotMatch(routerSource, /single/)
})

test('registers the real dynamic page for loanSuccessMulti without touching other result routes', () => {
  assert.match(routerSource, /const MultiPushResultPage = \(\) => import\('\.\.\/features\/multiPushResult\/views\/MultiPushResultPage\.vue'\)/)
  assert.match(routerSource, /path: 'loanSuccessMulti',\s*\n\s*name: 'loanSuccessMulti',\s*\n\s*component: MultiPushResultPage,/)
  assert.doesNotMatch(routerSource, /MultiPushResultPlaceholder/)
  assert.match(routerSource, /component: LoanSuccessPage/)
  assert.match(routerSource, /component: LoanFailPage/)
})
