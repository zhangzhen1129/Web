const CURRENT_LANGUAGE = 'es'

const PROJECT_MESSAGES = Object.freeze({
  '10': Object.freeze({
    en: 'No products available. Please try again tomorrow.',
    es: 'No hay productos disponibles. Inténtalo mañana.',
    sw: 'Hakuna bidhaa zinazopatikana. Tafadhali jaribu tena kesho.',
  }),
  '20': Object.freeze({
    en: 'Please try again after 0:00!',
    es: 'Por favor, inténtelo de nuevo después de 0:00!',
    sw: 'Tafadhali jaribu tena baada ya saa 0:00!',
  }),
  '30': Object.freeze({
    en: 'Go to repay',
    es: 'Ir a reembolsar',
    sw: 'Nenda kulipa',
  }),
  '31': Object.freeze({
    en: 'Evaluating',
    es: 'Evaluando',
    sw: 'Inatathminiwa',
  }),
  '32': Object.freeze({
    en: 'Disbursing',
    es: 'Desembolsando',
    sw: 'Inatolewa',
  }),
  '33': Object.freeze({
    en: 'Apply now',
    es: 'Aplicar ahora',
    sw: 'Omba sasa',
  }),
  '40': Object.freeze({
    en: 'Verifying your information, please wait patiently.',
    es: 'Verificando su información, por favor espere pacientemente.',
    sw: 'Tunathibitisha maelezo yako, tafadhali subiri kwa subira.',
  }),
  '41': Object.freeze({
    en: 'Upload failed. Please try again later.',
    es: 'Carga fallida, inténtelo más tarde.',
    sw: 'Upakiaji umeshindwa. Tafadhali jaribu tena baadaye.',
  }),
})

export function getProjectMessage(messageId, language = CURRENT_LANGUAGE) {
  const messages = PROJECT_MESSAGES[String(messageId)]
  return messages?.[language] ?? ''
}

export { CURRENT_LANGUAGE }
