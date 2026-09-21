import { homeUiText } from './homeUiText.js'

export function formatAmountText(value) {
  if (typeof value !== 'string' || value.length === 0) return ''
  return value.startsWith(homeUiText.amountCurrencyPrefix)
    ? value
    : `${homeUiText.amountCurrencyPrefix}${value}`
}
