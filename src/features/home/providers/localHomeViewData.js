const common = {
  titleText: 'Solicitud rápida en 3 pasos',
  steps: [
    { key: 'verify', text: 'Verificación de información' },
    { key: 'review', text: 'Revisión del préstamo' },
    { key: 'approve', text: 'Aprobación de la solicitud' },
  ],
  broadcast: {
    items: [
      { key: 'one', text: '978***989 solicitó con éxito un préstamo de S/1000' },
      { key: 'two', text: '965***347 recibió su desembolso correctamente' },
    ],
  },
  tabs: [
    { key: 'home', text: 'Préstamos', iconResourceKey: 'home', active: true, enabled: true },
    { key: 'account', text: 'Mi cuenta', iconResourceKey: 'account', active: false, enabled: true },
  ],
}

export const AMOUNT_MINIMUM = 100
export const AMOUNT_MAXIMUM = 5000
export const AMOUNT_STEP = 100
export const DEFAULT_AMOUNT_KEY = `amount-${AMOUNT_MAXIMUM}`
export const DEFAULT_TERM_KEY = 'term-91'

function formatAmount(amount) {
  return `S/ ${amount.toLocaleString('en-US')}`
}

export const amountOptions = Object.freeze(Array.from(
  { length: ((AMOUNT_MAXIMUM - AMOUNT_MINIMUM) / AMOUNT_STEP) + 1 },
  (_, index) => {
    const amount = AMOUNT_MINIMUM + (index * AMOUNT_STEP)
    return Object.freeze({ key: `amount-${amount}`, text: formatAmount(amount), disabled: false })
  },
))

export const termOptions = Object.freeze([
  Object.freeze({ key: 'term-91', text: '91 días', disabled: false }),
  Object.freeze({ key: 'term-120', text: '120 días', disabled: false }),
  Object.freeze({ key: 'term-180', text: '180 días', disabled: false }),
])

function createProductSelection(selectedAmountKey = DEFAULT_AMOUNT_KEY, selectedTermKey = DEFAULT_TERM_KEY) {
  return {
    amountLabelText: 'Límite de crédito',
    amountOptions,
    selectedAmountKey,
    termLabelText: 'Plazo del préstamo',
    termOptions,
    selectedTermKey,
  }
}

const summary = {
  availableLabelText: 'Cantidad disponible',
  availableText: 'S/ 0',
  totalLabelText: 'Crédito total',
  totalText: '5,000',
  usedLabelText: 'Crédito usado',
  usedText: '5,000',
  locked: true,
}

const modes = {
  apply: { primaryAction: { text: 'Pruébalo ahora', enabled: true, loading: false, badgeText: 'Casi: 95%' } },
  reviewing: { primaryAction: { text: 'Evaluando', enabled: false, loading: false } },
  disbursing: { creditSummary: summary, primaryAction: { text: 'Desembolsando', enabled: false, loading: true } },
  repaying: {
    creditSummary: summary,
    statusNotice: { text: 'Devuelve el dinero a tiempo y desbloquea un préstamo de mayor cuantía', tone: 'warning' },
    primaryAction: { text: 'Ir a reembolsar', enabled: true, loading: false },
  },
  rejected: { primaryAction: { text: 'Rechazado', enabled: false, loading: false } },
}

export function modeHasProductSelection(viewMode) {
  return viewMode === 'apply' || viewMode === 'reviewing' || viewMode === 'rejected'
}

export function createLocalContentPayload(viewMode, requestId, selection = {}) {
  const productSelection = modeHasProductSelection(viewMode)
    ? createProductSelection(selection.selectedAmountKey, selection.selectedTermKey)
    : undefined
  return {
    requestId,
    pageStatus: 'content',
    viewMode,
    viewData: { ...common, ...modes[viewMode], ...(productSelection ? { productSelection } : {}) },
  }
}

export function createLocalLoadingPayload(requestId) {
  return { requestId, pageStatus: 'loading' }
}

export function createLocalErrorPayload(requestId) {
  return {
    requestId,
    pageStatus: 'error',
    errorData: { messageText: 'No se pudo cargar la información', retryVisible: true, retryText: 'Reintentar' },
  }
}

export const localViewModes = Object.keys(modes)
