import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./ComplaintListPage.vue', import.meta.url), 'utf8')
const styleSource = readFileSync(new URL('./complaintListPage.css', import.meta.url), 'utf8')
const emptyAsset = readFileSync(new URL('../assets/complaint-record-empty.png', import.meta.url))

test('renders the controlled header, list fields, status states, and empty state', () => {
  assert.match(pageSource, /class="complaint-list-header"/)
  assert.match(pageSource, /COMPLAINT_LIST_CONTENT\.title/)
  assert.match(pageSource, /COMPLAINT_LIST_CONTENT\.backLabel/)
  assert.match(pageSource, /COMPLAINT_LIST_CONTENT\.agencyLabel/)
  assert.match(pageSource, /COMPLAINT_LIST_CONTENT\.questionTypeLabel/)
  assert.match(pageSource, /COMPLAINT_LIST_CONTENT\.questionDetailsLabel/)
  assert.match(pageSource, /COMPLAINT_LIST_CONTENT\.emptyText/)
  assert.match(pageSource, /record\.statusModifier/)
  assert.match(pageSource, /record\.statusText/)
  assert.match(pageSource, /complaint-record-details-text/)
  assert.match(pageSource, /complaint-list-empty/)
})

test('uses the public request, loading bridge, safe toast, and lifecycle cleanup', () => {
  assert.match(pageSource, /createComplaintServices\(\{ getGlobalState: \(\) => globalStore \}\)/)
  assert.match(pageSource, /showNativeLoading/)
  assert.match(pageSource, /hideNativeLoading/)
  assert.match(pageSource, /showToast\(\{ message, forbidClick: true \}\)/)
  assert.match(pageSource, /onBeforeRouteLeave/)
  assert.match(pageSource, /controller\.deactivate\(\)/)
  assert.match(pageSource, /controller\.dispose\(\)/)
  assert.doesNotMatch(pageSource, /v-html|innerHTML|eval\(|new Function/)
})

test('uses one responsive vertical scroll surface and a verified local PNG asset', () => {
  assert.match(styleSource, /height:\s*100dvh/)
  assert.match(styleSource, /overflow-y:\s*auto/)
  assert.match(styleSource, /overflow-x:\s*hidden/)
  assert.doesNotMatch(styleSource, /width:\s*390px|min-width:\s*390px/)
  assert.deepEqual([...emptyAsset.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
})
