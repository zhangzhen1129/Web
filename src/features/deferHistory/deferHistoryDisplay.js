import { formatDecimalString } from '../loanSuccess/loanSuccessAmount.js'

const CURRENCY_PREFIX = 'S/'

function formatCurrencyAmount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  const formatted = formatDecimalString(String(value))
  return formatted ? `${CURRENCY_PREFIX} ${formatted}` : '--'
}

export function buildDeferHistoryRecordDisplayModel(record) {
  return Object.freeze({
    approvalDate: record.approvalDate,
    amount: record.amount,
    amountText: formatCurrencyAmount(record.amount),
    extendedTerm: record.extendedTerm,
    extendedTermText: `${record.extendedTerm} días`,
    updatedDueDate: record.updatedDueDate,
  })
}

export function buildDeferHistoryDisplayModel(records) {
  return Object.freeze(records.map(buildDeferHistoryRecordDisplayModel))
}