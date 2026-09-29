import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { COMPLAINT_CONTENT } from './complaintContent.js'

const EXPECTED_AGENCIES = Object.freeze([
  Object.freeze({ value: 'DineroPro', label: 'DineroPro' }),
  Object.freeze({
    value: 'Plataforma de quejas en línea',
    label: 'Plataforma de quejas en línea',
  }),
])
const EXPECTED_QUESTIONS = Object.freeze([
  Object.freeze({
    value: 'Problemas de endeudamiento',
    label: 'Problemas de endeudamiento',
  }),
  Object.freeze({
    value: 'Problemas de reembolso',
    label: 'Problemas de reembolso',
  }),
  Object.freeze({
    value: 'Recordatorio de problemas de pago',
    label: 'Recordatorio de problemas de pago',
  }),
  Object.freeze({ value: 'Otras preguntas', label: 'Otras preguntas' }),
])
const SOURCE_FILES = [
  'complaintContent.js',
  'complaintController.js',
  'complaintContent.test.js',
  'complaintController.test.js',
]

test('matches the confirmed Figma content exactly', () => {
  assert.equal(COMPLAINT_CONTENT.title, 'Quejas')
  assert.equal(COMPLAINT_CONTENT.agencySelectorLabel, 'Seleccione una agencia de feedback')
  assert.deepEqual(COMPLAINT_CONTENT.agencyOptions, EXPECTED_AGENCIES)
  assert.deepEqual(COMPLAINT_CONTENT.questionTypes, EXPECTED_QUESTIONS)
  assert.deepEqual(COMPLAINT_CONTENT.tips, {
    heading: 'Consejos útiles:',
    message: 'El sistema enviará el caso de queja a la agencia de quejas seleccionada y la agencia lo procesará dentro de 7 días, espere pacientemente.',
  })
  assert.equal(COMPLAINT_CONTENT.complaintRecordLabel, 'Registro de quejas')
  assert.equal(COMPLAINT_CONTENT.customerServiceText, 'Atención al cliente: 5517872176')
  assert.equal(
    COMPLAINT_CONTENT.questionPopupTitle,
    'Por favor seleccione el tipo de pregunta',
  )
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