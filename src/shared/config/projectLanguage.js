const CURRENT_LANGUAGE = 'es'

const PROJECT_MESSAGES = Object.freeze({
  '10': Object.freeze({
    en: 'No products available. Please try again tomorrow.',
    es: 'No hay productos disponibles. Inténtalo mañana.',
    sw: 'Hakuna bidhaa zinazopatikana. Tafadhali jaribu tena kesho.',
  }),
})

export function getProjectMessage(messageId, language = CURRENT_LANGUAGE) {
  const messages = PROJECT_MESSAGES[String(messageId)]
  return messages?.[language] ?? ''
}

export { CURRENT_LANGUAGE }
