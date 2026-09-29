import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getHelpCenterContent } from './helpCenterContent.js'

const EXPECTED_FAQS = Object.freeze([
  Object.freeze({
    id: '1',
    question: '¿Por qué se rechazó mi solicitud de préstamo?',
    answer: 'Respuesta: En DineroPro utilizamos un sistema de evaluación automatizado. Un rechazo puede deberse a que el puntaje crediticio actual no cumple con nuestros criterios mínimos, ingresos no verificables, un nivel de endeudamiento elevado en el sistema financiero o inconsistencias en las fotos del DNI presentadas. ¡No se desanime! Le sugerimos revisar que todos sus datos estén actualizados e intentarlo nuevamente en unos días. Si desea una aclaración detallada, escríbanos a nuestro correo de soporte: {email}.',
  }),
  Object.freeze({
    id: '2',
    question: '¿Puedo cancelar o modificar mi solicitud después de enviarla?',
    answer: 'Respuesta: No de forma manual. Una vez que hace clic en enviar, su solicitud ingresa de inmediato a nuestro flujo de aprobación e inteligencia artificial de alta velocidad, por lo que no se puede cancelar ni retirar del sistema. En caso de que su crédito sea aprobado y ya no requiera los fondos, simplemente puede realizar la devolución total del capital desde la App el mismo día para liquidar el saldo.',
  }),
  Object.freeze({
    id: '3',
    question: '¿Cuánto tiempo toma el proceso de evaluación?',
    answer: 'Respuesta: ¡Somos ultra rápidos! El 90% de nuestros usuarios recibe un diagnóstico en menos de 10 minutos. En momentos de alta demanda tecnológica, este proceso podría extenderse hasta un máximo de 30 minutos. Le recomendamos mantenerse atento a las notificaciones de la App y revisar su bandeja de entrada.',
  }),
  Object.freeze({
    id: '4',
    question: '¿Cuánto tiempo tarda en depositarse el dinero a mi cuenta?',
    answer: 'Respuesta: Una vez aprobada su solicitud, la transferencia se ejecuta de inmediato. Por lo general, los fondos se verán reflejados en su cuenta bancaria vinculada en un lapso de 15 minutos. Tenga en cuenta que, dependiendo de los tiempos de procesamiento interbancario de su entidad financiera, el depósito final podría reflejarse en un plazo máximo de 24 horas.',
  }),
  Object.freeze({
    id: '5',
    question: '¿Qué debo hacer si mi dinero no se ha acreditado a tiempo?',
    answer: 'Respuesta: Si han transcurrido más de 24 horas y aún no visualiza el saldo, verifique primero desde la App que los datos de su cuenta bancaria o CCI sean correctos. De estar todo en orden, comuníquese con nuestro equipo a través de {email} adjuntando su número de solicitud. Nota de tranquilidad: Si el retraso se debe a una falla técnica de nuestro sistema, nos aseguramos de que no se generen intereses ordinarios durante los días que dure la incidencia.',
  }),
  Object.freeze({
    id: '6',
    question: '¿Existen penalizaciones o cargos por pagar antes de la fecha límite?',
    answer: 'Respuesta: En DineroPro premiamos la puntualidad. Puede realizar pagos anticipados en el momento que lo desee sin incurrir en ninguna comisión por liquidación anticipada. Los intereses se recalcularán de forma justa cobrándole únicamente por los días exactos que utilizó el crédito. Además, al pagar antes de tiempo, su cupo disponible se restablecerá de inmediato y podrá aplicar a montos mayores.',
  }),
])

const SOURCE_FILES = [
  'helpCenterConfig.js',
  'helpCenterContent.js',
  'helpCenterDisplay.js',
  'helpCenterUiText.js',
  'helpCenterDisplay.test.js',
  'helpCenterContent.test.js',
]

test('defaults to current language and returns the confirmed Spanish content in order', () => {
  const content = getHelpCenterContent()

  assert.equal(content, getHelpCenterContent('es'))
  assert.ok(content)
  assert.equal(content.title, 'Servicio al cliente')
  assert.deepEqual(content.faqs, EXPECTED_FAQS)
  assert.equal(content.faqs.length, 6)
})

test('returns frozen content and returns null for unconfigured languages', () => {
  const content = getHelpCenterContent('es')

  assert.ok(Object.isFrozen(content))
  assert.ok(Object.isFrozen(content.faqs))
  assert.ok(content.faqs.every((faq) => Object.isFrozen(faq)))
  assert.equal(getHelpCenterContent('en'), null)
  assert.equal(getHelpCenterContent('sw'), null)
  assert.equal(getHelpCenterContent('__proto__'), null)
})

test('keeps the email marker and excludes the configured email literal', () => {
  const content = getHelpCenterContent('es')
  const markerFaqIds = content.faqs
    .filter((faq) => faq.answer.includes('{email}'))
    .map((faq) => faq.id)
  const serializedContent = JSON.stringify(content)

  assert.deepEqual(markerFaqIds, ['1', '5'])
  assert.equal(serializedContent.includes('my@data.com'), false)
})

test('keeps all help center source files free of Chinese characters', () => {
  const chineseCharacterPattern = /[\u3400-\u9fff\uf900-\ufaff]/u

  for (const sourceFile of SOURCE_FILES) {
    const source = readFileSync(new URL(sourceFile, import.meta.url), 'utf8')
    assert.equal(chineseCharacterPattern.test(source), false, sourceFile)
  }
})