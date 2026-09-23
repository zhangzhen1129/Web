export function maskMobile(value) {
  if (typeof value !== 'string') return ''
  const digits = value.replace(/\D/g, '')
  if (digits.length < 7) return ''
  return digits.slice(0, 3) + '*'.repeat(digits.length - 5) + digits.slice(-2)
}
