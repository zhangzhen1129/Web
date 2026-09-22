const CURRENCY_PREFIX = 'S/'

export function amountWithCurrency(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return ''
  if (value.startsWith(`${CURRENCY_PREFIX} `)) return value
  return `${CURRENCY_PREFIX} ${value}`
}
