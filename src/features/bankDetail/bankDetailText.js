import { getProjectMessage } from '../../shared/config/projectLanguage.js'

export const BANK_DETAIL_TEXT = Object.freeze({
  title: 'Información de la tarjeta',
  defaultCard: 'Tarjeta bancaria por defecto',
  addMethod: 'Agregar un nuevo método',
  submit: 'Enviar',
  empty: 'Sin cuentas agregadas',
  successToast: getProjectMessage('60'),
  back: 'Volver',
})

export function formatAccountLabel(account) {
  const bank = typeof account?.bank === 'string' ? account.bank : ''
  const last4 = typeof account?.accountLast4 === 'string' ? account.accountLast4 : ''
  return `${bank}（${last4}）`
}