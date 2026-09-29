export const COMPLAINT_CONTENT = Object.freeze({
  title: 'Quejas',
  agencySelectorLabel: 'Seleccione una agencia de feedback',
  agencyOptions: Object.freeze([
    Object.freeze({
      value: 'DineroPro',
      label: 'DineroPro',
    }),
    Object.freeze({
      value: 'Plataforma de quejas en línea',
      label: 'Plataforma de quejas en línea',
    }),
  ]),
  questionTypes: Object.freeze([
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
    Object.freeze({
      value: 'Otras preguntas',
      label: 'Otras preguntas',
    }),
  ]),
  tips: Object.freeze({
    heading: 'Consejos útiles:',
    message: 'El sistema enviará el caso de queja a la agencia de quejas seleccionada y la agencia lo procesará dentro de 7 días, espere pacientemente.',
  }),
  complaintRecordLabel: 'Registro de quejas',
  customerServiceText: 'Atención al cliente: 5517872176',
  questionPopupTitle: 'Por favor seleccione el tipo de pregunta',
})