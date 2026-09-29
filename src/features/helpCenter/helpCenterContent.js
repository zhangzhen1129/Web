import { CURRENT_LANGUAGE } from '../../shared/config/projectLanguage.js'

const ES_FAQS = Object.freeze([
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

const HELP_CENTER_CONTENT_BY_LANGUAGE = Object.freeze({
  es: Object.freeze({
    title: 'Servicio al cliente',
    faqs: ES_FAQS,
  }),
})

export function getHelpCenterContent(language = CURRENT_LANGUAGE) {
  if (!Object.hasOwn(HELP_CENTER_CONTENT_BY_LANGUAGE, language)) {
    return null
  }

  return HELP_CENTER_CONTENT_BY_LANGUAGE[language]
}
