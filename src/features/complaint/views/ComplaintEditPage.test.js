import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const pageSource = readFileSync(new URL('./ComplaintEditPage.vue', import.meta.url), 'utf8')
const styleSource = readFileSync(new URL('./complaintEditPage.css', import.meta.url), 'utf8')

test('keeps one page, one details input, and protocol-safe source boundaries', () => {
  assert.match(pageSource, /defineOptions\(\{ name: 'ComplaintEditPage' \}\)/)
  assert.match(pageSource, /createComplaintEditController/)
  assert.match(pageSource, /createComplaintServices/)
  assert.match(pageSource, /showNativeLoading/)
  assert.match(pageSource, /hideNativeLoading/)
  assert.match(pageSource, /showToast\(\{ message, forbidClick: true \}\)/)
  assert.match(pageSource, /:maxlength="100"/)
  assert.match(pageSource, /onBeforeRouteLeave\(\(\) => \{\s*controller\.deactivate\(\)/)
  assert.match(pageSource, /onBeforeUnmount\(\(\) => \{\s*controller\.deactivate\(\)/)
  assert.equal((pageSource.match(/<textarea/g) ?? []).length, 1)
  assert.doesNotMatch(pageSource, /\b(axios|fetch|XMLHttpRequest|localStorage|sessionStorage|location\.href|window\.open)\b/)
  assert.doesNotMatch(pageSource, /\b(innerHTML|v-html|eval|new Function)\b/)
  assert.doesNotMatch(pageSource, /[\u3400-\u9fff]/)
})

test('keeps the Figma geometry, one scroll container, and one fixed footer action', () => {
  const pageRule = styleSource.match(/\.complaint-edit-page\s*\{([^}]*)\}/)?.[1] ?? ''
  const headerRule = styleSource.match(/\.complaint-edit-header\s*\{([^}]*)\}/)?.[1] ?? ''
  const scrollRule = styleSource.match(/\.complaint-edit-scroll\s*\{([^}]*)\}/)?.[1] ?? ''
  const readonlyRule = [...styleSource.matchAll(/\.complaint-edit-readonly\s*\{([^}]*)\}/g)].at(-1)?.[1] ?? ''
  const textareaRule = [...styleSource.matchAll(/\.complaint-edit-textarea\s*\{([^}]*)\}/g)].at(-1)?.[1] ?? ''
  const footerRule = styleSource.match(/\.complaint-edit-footer\s*\{([^}]*)\}/)?.[1] ?? ''
  const submitRule = styleSource.match(/\.complaint-edit-submit\s*\{([^}]*)\}/)?.[1] ?? ''

  assert.match(pageRule, /height:\s*100dvh/)
  assert.match(pageRule, /overflow:\s*hidden/)
  assert.match(headerRule, /height:\s*1\.64103rem/)
  assert.match(scrollRule, /overflow-y:\s*auto/)
  assert.match(readonlyRule, /height:\s*1\.43590rem/)
  assert.match(textareaRule, /height:\s*2\.46154rem/)
  assert.match(styleSource, /\.complaint-edit-readonly,\s*\n\.complaint-edit-textarea\s*\{[^}]*border-radius:\s*\.41026rem/)
  assert.match(footerRule, /padding:\s*0 \.41026rem calc\(\.61538rem \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(submitRule, /height:\s*1\.43590rem/)
  assert.equal((styleSource.match(/overflow-y:\s*auto/g) ?? []).length, 2)
  assert.doesNotMatch(styleSource, /\.van-(?:fade|popup-slide)/)
  assert.doesNotMatch(styleSource, /[\u3400-\u9fff]/)
})
