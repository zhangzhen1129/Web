import { HELP_CENTER_UI_TEXT } from './helpCenterUiText.js'

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isValidFaq(faq) {
  return (
    faq !== null &&
    typeof faq === 'object' &&
    !Array.isArray(faq) &&
    isNonEmptyString(faq.id) &&
    isNonEmptyString(faq.question) &&
    isNonEmptyString(faq.answer)
  )
}

function isValidContent(content) {
  return (
    content !== null &&
    typeof content === 'object' &&
    !Array.isArray(content) &&
    isNonEmptyString(content.title) &&
    Array.isArray(content.faqs) &&
    content.faqs.length > 0 &&
    content.faqs.every(isValidFaq)
  )
}

function isValidConfig(config) {
  return (
    config !== null &&
    typeof config === 'object' &&
    !Array.isArray(config) &&
    isNonEmptyString(config.workingHours) &&
    isNonEmptyString(config.email)
  )
}

export function createHelpCenterDisplayModel(options) {
  const content = options?.content
  const config = options?.config

  if (!isValidContent(content) || !isValidConfig(config)) {
    return {
      valid: false,
      title: HELP_CENTER_UI_TEXT.pageTitle,
      fallbackMessage: HELP_CENTER_UI_TEXT.fallbackMessage,
    }
  }

  return {
    valid: true,
    title: content.title,
    workingHours: config.workingHours,
    email: config.email,
    faqs: content.faqs.map((faq) => ({
      id: faq.id,
      question: faq.question,
      answer: faq.answer.split('{email}').join(config.email),
    })),
  }
}