import { CURRENT_LANGUAGE, getProjectMessage } from '../../shared/config/projectLanguage.js'
import { REPAYMENT_ORDER_STATUS } from './repaymentConstants.js'

const REPAYMENT_STATUS_MESSAGE_ID = Object.freeze({
  [REPAYMENT_ORDER_STATUS.WAY]: '55',
  [REPAYMENT_ORDER_STATUS.DUE]: '56',
})

export const REPAYMENT_TEXT = Object.freeze({
  labels: Object.freeze({
    amount: 'Monto a pagar',
    dueDate: 'Fecha de vencimiento',
    currency: 'S/',
  }),
  empty: Object.freeze({
    message: 'Sin orden',
    action: 'Aplicar ahora',
  }),
  error: Object.freeze({
    message: 'No se pudieron cargar los pedidos.',
  }),
  loadingLabel: 'Cargando pedidos',
})

export function getRepaymentStatusText(orderStatus, language = CURRENT_LANGUAGE) {
  if (!Number.isInteger(orderStatus)) return ''
  const messageId = REPAYMENT_STATUS_MESSAGE_ID[orderStatus]
  return messageId ? getProjectMessage(messageId, language) : ''
}
