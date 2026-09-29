import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { COMPLAINT_CONTENT } from './complaintContent.js'

const SOURCE_FILES = [
  'complaintContent.js',
  'complaintController.js',
  'complaintContent.test.js',
  'complaintController.test.js',
]

function assertOptionList(options, field) {
  assert.ok(Array.isArray(options), field)
  assert.ok(options.length > 0, field)
  for (const option of options) {
    assert.equal(typeof option?.value, 'string', field)
    assert.equal(typeof option?.label, 'string', field)
    assert.ok(option.value.trim().length > 0, field)
    assert.ok(option.label.trim().length > 0, field)
  }
}

test('exposes non-empty controlled display fields and option collections', () => {
  for (const field of [
    'title',
    'agencySelectorLabel',
    'complaintRecordLabel',
    'customerServiceText',
    'questionPopupTitle',
  ]) {
    assert.equal(typeof COMPLAINT_CONTENT[field], 'string', field)
    assert.ok(COMPLAINT_CONTENT[field].trim().length > 0, field)
  }

  assert.equal(typeof COMPLAINT_CONTENT.tips?.heading, 'string')
  assert.equal(typeof COMPLAINT_CONTENT.tips?.message, 'string')
  assert.ok(COMPLAINT_CONTENT.tips.heading.trim().length > 0)
  assert.ok(COMPLAINT_CONTENT.tips.message.trim().length > 0)
  assertOptionList(COMPLAINT_CONTENT.agencyOptions, 'agencyOptions')
  assertOptionList(COMPLAINT_CONTENT.questionTypes, 'questionTypes')
})

test('keeps option values equal to labels and preserves their order', () => {
  const options = [
    ...COMPLAINT_CONTENT.agencyOptions,
    ...COMPLAINT_CONTENT.questionTypes,
  ]

  for (const option of options) {
    assert.equal(option.value, option.label)
  }

  assert.equal(
    new Set(COMPLAINT_CONTENT.agencyOptions.map((option) => option.value)).size,
    COMPLAINT_CONTENT.agencyOptions.length,
  )
  assert.equal(
    new Set(COMPLAINT_CONTENT.questionTypes.map((option) => option.value)).size,
    COMPLAINT_CONTENT.questionTypes.length,
  )
})

test('freezes controlled content and nested option records', () => {
  assert.ok(Object.isFrozen(COMPLAINT_CONTENT))
  assert.ok(Object.isFrozen(COMPLAINT_CONTENT.agencyOptions))
  assert.ok(Object.isFrozen(COMPLAINT_CONTENT.questionTypes))
  assert.ok(Object.isFrozen(COMPLAINT_CONTENT.tips))
  assert.ok(COMPLAINT_CONTENT.agencyOptions.every((option) => Object.isFrozen(option)))
  assert.ok(COMPLAINT_CONTENT.questionTypes.every((option) => Object.isFrozen(option)))
})

test('keeps controlled visible text out of the controller module', () => {
  const controllerSource = readFileSync(
    new URL('./complaintController.js', import.meta.url),
    'utf8',
  )
  const visibleText = [
    COMPLAINT_CONTENT.title,
    COMPLAINT_CONTENT.agencySelectorLabel,
    COMPLAINT_CONTENT.tips.heading,
    COMPLAINT_CONTENT.tips.message,
    COMPLAINT_CONTENT.complaintRecordLabel,
    COMPLAINT_CONTENT.customerServiceText,
    COMPLAINT_CONTENT.questionPopupTitle,
    ...COMPLAINT_CONTENT.agencyOptions.map((option) => option.label),
    ...COMPLAINT_CONTENT.questionTypes.map((option) => option.label),
  ]

  for (const text of visibleText) {
    assert.equal(controllerSource.includes(text), false, text)
  }
})

test('keeps complaint source files free of Chinese characters', () => {
  const chineseCharacterPattern = /[\u3400-\u9fff\uf900-\ufaff]/u

  for (const sourceFile of SOURCE_FILES) {
    const source = readFileSync(new URL(sourceFile, import.meta.url), 'utf8')
    assert.equal(chineseCharacterPattern.test(source), false, sourceFile)
  }
})
