export const COMPLAINT_RECORD_STATUS = Object.freeze({
  PROCESSING: 0,
  PROCESSED: 1,
})

const STATUS_TEMPLATES = Object.freeze({
  [COMPLAINT_RECORD_STATUS.PROCESSING]: 'Su queja está siendo enviada al {mechanism}, por favor tenga paciencia',
  [COMPLAINT_RECORD_STATUS.PROCESSED]: 'Su queja ha sido recibida y procesada por {mechanism}',
})

const STATUS_WITHOUT_MECHANISM = Object.freeze({
  [COMPLAINT_RECORD_STATUS.PROCESSING]: 'Su queja está siendo enviada, por favor tenga paciencia',
  [COMPLAINT_RECORD_STATUS.PROCESSED]: 'Su queja ha sido recibida y procesada',
})

function normalizeMechanism(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function getComplaintRecordStatusPresentation(record) {
  const status = record?.submitStatus
  if (status !== COMPLAINT_RECORD_STATUS.PROCESSING && status !== COMPLAINT_RECORD_STATUS.PROCESSED) {
    return null
  }

  const mechanism = normalizeMechanism(record?.feedbackMechanism)
  const template = mechanism
    ? STATUS_TEMPLATES[status]
    : STATUS_WITHOUT_MECHANISM[status]

  return Object.freeze({
    text: mechanism ? template.replace('{mechanism}', mechanism) : template,
    modifier: status === COMPLAINT_RECORD_STATUS.PROCESSING ? 'processing' : 'processed',
  })
}

export const COMPLAINT_LIST_CONTENT = Object.freeze({
  title: 'Registro de quejas',
  backLabel: 'Volver',
  recordNumberPrefix: 'No.',
  agencyLabel: 'Agencia de retroalimentación',
  questionTypeLabel: 'Tipo de pregunta',
  questionDetailsLabel: 'Detalles de la pregunta',
  emptyText: 'Sin registro',
  requestFailureFallback: 'Unable to complete the request.',
  invalidResponseMessage: 'Unable to validate the server response.',
})
