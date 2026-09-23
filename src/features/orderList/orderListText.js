import { CURRENT_LANGUAGE, getProjectMessage } from '../../shared/config/projectLanguage.js'
import {
  ORDER_LIST_CARD_MODE,
  ORDER_LIST_FILTER,
  ORDER_LIST_STATUS_MESSAGE_ID,
} from './orderListConstants.js'

export const ORDER_LIST_TEXT = Object.freeze({
  title: 'Todos los pedidos',
  back: 'Volver',
  loadingLabel: 'Cargando pedidos',
  filters: Object.freeze({
    [ORDER_LIST_FILTER.PENDING_PAYMENT]: 'Por pagar',
    [ORDER_LIST_FILTER.REVIEWING]: 'Revisión',
    [ORDER_LIST_FILTER.HISTORY]: 'Historial',
  }),
  labels: Object.freeze({
    loanAmount: 'Importe de préstamo',
    applicationDate: 'Fecha de aplicación',
    repaymentAmount: 'Monto a pagar',
    dueDate: 'Fecha de vencimiento',
    currency: 'S/',
  }),
  empty: Object.freeze({
    message: 'Ningún pedido de préstamo',
    action: 'Aplicar ahora',
  }),
  error: Object.freeze({
    message: 'error',
  }),
})

const MODE_LABEL_KEYS = Object.freeze({
  [ORDER_LIST_CARD_MODE.APPLICATION]: Object.freeze({
    amount: 'loanAmount',
    date: 'applicationDate',
  }),
  [ORDER_LIST_CARD_MODE.REPAYMENT]: Object.freeze({
    amount: 'repaymentAmount',
    date: 'dueDate',
  }),
  [ORDER_LIST_CARD_MODE.COMPLETED]: Object.freeze({
    amount: 'repaymentAmount',
    date: 'dueDate',
  }),
})

export function getOrderStatusText(orderStatus, language = CURRENT_LANGUAGE) {
  if (!Number.isInteger(orderStatus)) return ''
  const messageId = ORDER_LIST_STATUS_MESSAGE_ID[orderStatus]
  return messageId ? getProjectMessage(messageId, language) : ''
}

export function getOrderCardAmountLabel(cardMode) {
  const keys = MODE_LABEL_KEYS[cardMode]
  return keys ? ORDER_LIST_TEXT.labels[keys.amount] : ''
}

export function getOrderCardDateLabel(cardMode) {
  const keys = MODE_LABEL_KEYS[cardMode]
  return keys ? ORDER_LIST_TEXT.labels[keys.date] : ''
}
