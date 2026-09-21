export function getRepaymentBadgeText(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value === 0) return null
  return value >= 100 ? '99+' : String(value)
}
