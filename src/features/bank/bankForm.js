import {
  ACCOUNT_NUMBER_ERROR_TEXT,
  ACCOUNT_TYPE,
  BANK_OPTION_BY_CODE,
  BANK_OPTION_BY_NAME,
} from './bankData.js'

export const DEFAULT_ACCOUNT_TYPE = ACCOUNT_TYPE.SAVINGS
export const BANK_PICKER_PLACEHOLDER = 'Por favor, elija'
export const ACCOUNT_NUMBER_PLACEHOLDER = 'Por favor escribe'

export function getBankByCode(code) {
  return BANK_OPTION_BY_CODE[code] ?? null
}

export function getBankByName(name) {
  return BANK_OPTION_BY_NAME[name] ?? null
}

export function isAccountType(value) {
  return value === ACCOUNT_TYPE.CHECKING || value === ACCOUNT_TYPE.SAVINGS
}

export function getAllowedDigits(bank, accountType = DEFAULT_ACCOUNT_TYPE) {
  if (!bank || !isAccountType(accountType)) return null
  return bank.digitRule[accountType] ?? null
}

export function getMaxAccountDigits(bank, accountType = DEFAULT_ACCOUNT_TYPE) {
  const digits = getAllowedDigits(bank, accountType)
  return digits ? Math.max(...digits) : 20
}

export function normalizeAccountNumber(value) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : ''
}

export function isAccountNumberValid(bank, accountType, accountNumber) {
  const digits = getAllowedDigits(bank, accountType)
  if (!digits) return false
  return digits.includes(accountNumber.length)
}

function formatDigitList(digits) {
  if (!digits || digits.length === 0) return ''
  if (digits.length === 1) return String(digits[0])
  return digits.join(' o ')
}

export function getAccountNumberPlaceholder(bank, accountType = DEFAULT_ACCOUNT_TYPE) {
  if (!bank) return ACCOUNT_NUMBER_PLACEHOLDER
  if (typeof bank.placeholder === 'string' && bank.placeholder.length > 0) return bank.placeholder
  const digits = getAllowedDigits(bank, accountType)
  if (!digits) return ACCOUNT_NUMBER_PLACEHOLDER
  return `${formatDigitList(digits)} dígitos`
}

export function getAccountNumberError() {
  return ACCOUNT_NUMBER_ERROR_TEXT
}

export function getAccountNumberLabel(bank) {
  return bank?.recommended ? 'Número de cuenta' : 'Número de cuenta CCI'
}

export function isSubmitEnabled({ bank, accountNumber }) {
  return Boolean(bank)
    && accountNumber.length > 0
}

export function canReusePrefilledAccount({ prefillSnapshot, bank, accountNumber }) {
  return Boolean(prefillSnapshot)
    && Boolean(bank)
    && bank.name === prefillSnapshot.bankName
    && accountNumber === prefillSnapshot.accountNumber
}
