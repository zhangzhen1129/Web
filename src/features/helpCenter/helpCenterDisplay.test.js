import assert from 'node:assert/strict'
import test from 'node:test'
import { HELP_CENTER_CONFIG } from './helpCenterConfig.js'
import { getHelpCenterContent } from './helpCenterContent.js'
import { createHelpCenterDisplayModel } from './helpCenterDisplay.js'
import { HELP_CENTER_UI_TEXT } from './helpCenterUiText.js'

const FALLBACK_MODEL = Object.freeze({
  valid: false,
  title: HELP_CENTER_UI_TEXT.pageTitle,
  fallbackMessage: HELP_CENTER_UI_TEXT.fallbackMessage,
})

test('exposes the confirmed frozen config and UI text contract', () => {
  assert.deepEqual(HELP_CENTER_CONFIG, {
    workingHours: 'De lunes a viernes\n(de 9.00 a 19.00 horas)',
    email: 'my@data.com',
  })
  assert.equal(Object.isFrozen(HELP_CENTER_CONFIG), true)
  assert.deepEqual(Object.keys(HELP_CENTER_UI_TEXT).sort(), [
    'backLabel',
    'emailLabel',
    'fallbackMessage',
    'faqListLabel',
    'pageTitle',
    'workingHoursLabel',
  ])
  assert.equal(HELP_CENTER_UI_TEXT.pageTitle, 'Servicio al cliente')
  assert.equal(HELP_CENTER_UI_TEXT.fallbackMessage, 'No se pudo cargar el contenido.')
  assert.equal(Object.isFrozen(HELP_CENTER_UI_TEXT), true)
})
test('builds a valid display model and replaces every email marker', () => {
  const content = getHelpCenterContent('es')
  const config = Object.freeze({
    ...HELP_CENTER_CONFIG,
    email: 'support@example.com',
  })
  const result = createHelpCenterDisplayModel({ content, config })

  assert.equal(result.valid, true)
  assert.equal(result.title, content.title)
  assert.equal(result.workingHours, config.workingHours)
  assert.equal(result.email, config.email)
  assert.equal(result.faqs.length, 6)
  assert.deepEqual(result.faqs.map((faq) => faq.id), ['1', '2', '3', '4', '5', '6'])
  assert.equal(result.faqs[0].answer.includes(config.email), true)
  assert.equal(result.faqs[4].answer.includes(config.email), true)
  assert.equal(JSON.stringify(result).includes('{email}'), false)
  assert.equal(JSON.stringify(result).includes(HELP_CENTER_CONFIG.email), false)
})

test('replaces all marker occurrences in one answer', () => {
  const content = {
    title: 'Servicio al cliente',
    faqs: [
      {
        id: '1',
        question: 'Question',
        answer: 'First {email}; second {email}.',
      },
    ],
  }
  const result = createHelpCenterDisplayModel({
    content,
    config: HELP_CENTER_CONFIG,
  })

  assert.equal(result.valid, true)
  assert.equal(result.faqs[0].answer, 'First my@data.com; second my@data.com.')
})

test('falls back for invalid content', () => {
  const invalidContentCases = [
    undefined,
    null,
    {},
    { title: '', faqs: [] },
    { title: 'Servicio al cliente', faqs: null },
    { title: 'Servicio al cliente', faqs: [] },
    {
      title: 'Servicio al cliente',
      faqs: [{ id: '', question: 'Question', answer: 'Answer' }],
    },
  ]

  for (const content of invalidContentCases) {
    assert.deepEqual(
      createHelpCenterDisplayModel({ content, config: HELP_CENTER_CONFIG }),
      FALLBACK_MODEL,
    )
  }
})

test('falls back for invalid config or missing options', () => {
  const content = getHelpCenterContent('es')
  const invalidConfigCases = [
    undefined,
    null,
    {},
    [],
    { workingHours: '', email: 'my@data.com' },
    { workingHours: 'Working hours', email: '' },
    { workingHours: 'Working hours', email: 123 },
  ]

  for (const config of invalidConfigCases) {
    assert.deepEqual(
      createHelpCenterDisplayModel({ content, config }),
      FALLBACK_MODEL,
    )
  }

  assert.deepEqual(createHelpCenterDisplayModel(), FALLBACK_MODEL)
  assert.deepEqual(createHelpCenterDisplayModel(null), FALLBACK_MODEL)
})
