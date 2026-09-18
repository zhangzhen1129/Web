const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/

function splitDecimal(value) {
  const [integerPart, fractionalPart = ''] = value.split('.')
  return {
    integerPart: integerPart.replace(/^0+(?=\d)/, ''),
    fractionalPart,
  }
}

function groupIntegerPart(value) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function formatScaledInteger(value, scale) {
  const digits = value.toString().padStart(scale + 1, '0')
  const integerPart = scale > 0 ? digits.slice(0, -scale) : digits
  const fractionalPart = scale > 0 ? digits.slice(-scale).replace(/0+$/, '') : ''
  const groupedInteger = groupIntegerPart(integerPart)
  return fractionalPart ? `${groupedInteger}.${fractionalPart}` : groupedInteger
}

export function isDecimalString(value) {
  return typeof value === 'string' && DECIMAL_PATTERN.test(value)
}

export function formatDecimalString(value) {
  if (!isDecimalString(value)) return ''
  const { integerPart, fractionalPart } = splitDecimal(value)
  const normalizedFractional = fractionalPart.replace(/0+$/, '')
  const groupedInteger = groupIntegerPart(integerPart)
  return normalizedFractional ? `${groupedInteger}.${normalizedFractional}` : groupedInteger
}

export function addDecimalStrings(values) {
  if (!Array.isArray(values)) return ''
  const normalized = values.map((value) => {
    if (!isDecimalString(value)) return null
    const { integerPart, fractionalPart } = splitDecimal(value)
    return { integerPart, fractionalPart }
  })
  if (normalized.some((value) => value === null)) return ''

  const scale = normalized.reduce((maximum, value) => Math.max(maximum, value.fractionalPart.length), 0)
  const total = normalized.reduce((sum, value) => {
    const digits = value.integerPart + value.fractionalPart.padEnd(scale, '0')
    return sum + BigInt(digits)
  }, 0n)

  return formatScaledInteger(total, scale)
}
