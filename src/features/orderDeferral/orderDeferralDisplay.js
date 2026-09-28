const CURRENCY_PREFIX = 'S/'
const GROUPABLE_AMOUNT = /^-?\d+(?:\.\d+)?$/

function groupIntegerDigits(value) {
  const sign = value.startsWith('-') ? '-' : ''
  const unsigned = sign ? value.slice(1) : value
  return `${sign}${unsigned.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

export function formatCurrencyAmount(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '--'
  const text = String(value).trim()
  if (text.length === 0) return '--'
  if (text.startsWith(`${CURRENCY_PREFIX} `)) return text
  if (!GROUPABLE_AMOUNT.test(text)) return `${CURRENCY_PREFIX} ${text}`
  const [integerPart, decimalPart] = text.split('.')
  const formattedInteger = groupIntegerDigits(integerPart)
  return `${CURRENCY_PREFIX} ${decimalPart === undefined ? formattedInteger : `${formattedInteger}.${decimalPart}`}`
}

export function buildDeferralDisplayModel(detail) {
  return Object.freeze({
    billId: detail.billId ?? '',
    applicationDate: detail.applicationDate ?? '--',
    dueDate: detail.dueDate ?? '--',
    extensionDays: detail.extensionDays,
    extensionDaysText: detail.extensionDays === null ? '--' : String(detail.extensionDays),
    paymentAmountText: formatCurrencyAmount(detail.paymentAmount),
    serviceFeeText: formatCurrencyAmount(detail.serviceFee),
    overdueFeeText: formatCurrencyAmount(detail.overdueFee),
  })
}

export function fillDeferralTemplate(template, replacements = {}) {
  return Object.keys(replacements).reduce(
    (text, key) => text.replaceAll(`{${key}}`, String(replacements[key])),
    template,
  )
}
