const tabs = Object.freeze([
  Object.freeze({ key: 'home', text: 'Préstamos', iconResourceKey: 'home', active: true, enabled: true }),
  Object.freeze({ key: 'repayment', text: 'Reembolso', iconResourceKey: 'repayment', active: false, enabled: true }),
  Object.freeze({ key: 'account', text: 'Mi cuenta', iconResourceKey: 'account', active: false, enabled: true }),
])

const steps = Object.freeze([
  Object.freeze({ key: 'identity', text: 'Confirma tu identidad', iconResourceKey: 'step-1' }),
  Object.freeze({ key: 'offer', text: 'Elige tu oferta', iconResourceKey: 'step-2' }),
  Object.freeze({ key: 'deposit', text: 'Recibe tu dinero', iconResourceKey: 'step-3' }),
])

const broadcast = Object.freeze({
  items: Object.freeze([
    Object.freeze({ key: 'broadcast-1', text: '912***438 ha solicitado con éxito S/500' }),
    Object.freeze({ key: 'broadcast-2', text: '934***726 ha solicitado con éxito S/1000' }),
    Object.freeze({ key: 'broadcast-3', text: '956***114 ha solicitado con éxito S/2000' }),
    Object.freeze({ key: 'broadcast-4', text: '978***552 ha solicitado con éxito S/3000' }),
    Object.freeze({ key: 'broadcast-5', text: '923***867 ha solicitado con éxito S/4000' }),
    Object.freeze({ key: 'broadcast-6', text: '965***309 ha solicitado con éxito S/5000' }),
  ]),
})

const amountOptions = Object.freeze(Array.from({ length: 50 }, (_, index) => {
  const amount = (index + 1) * 100
  return Object.freeze({ key: String(amount), text: `S/ ${amount.toLocaleString('en-US')}`, disabled: false })
}))

const termOptions = Object.freeze([
  Object.freeze({ key: '91', text: '91 días', disabled: false }),
  Object.freeze({ key: '120', text: '120 días', disabled: false }),
  Object.freeze({ key: '180', text: '180 días', disabled: false }),
])

const products = Object.freeze(Array.from({ length: 5 }, (_, index) => Object.freeze({
  productId: `product-${index + 1}`,
  iconUrl: `https://fixtures.invalid/product-${index + 1}.png`,
  name: `Producto ${index + 1}`,
  loanAmountText: `S/ ${(index + 1) * 1000}`,
  dueDateText: '2026-09-09',
  isReloan: index < 2,
  selectable: true,
  selected: true,
})))

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function creditSummary({ locked = false, refreshEnabled = true, availableText = 'S/ 5,000' } = {}) {
  return {
    availableLabelText: 'Crédito disponible',
    availableText,
    totalLabelText: 'Crédito total',
    totalText: 'S/ 5,000',
    usedLabelText: 'Crédito usado',
    usedText: locked ? 'S/ 3,000' : 'S/ 0',
    locked,
    refreshEnabled,
  }
}

function localSelection() {
  return {
    amountOptions: clone(amountOptions),
    selectedAmountKey: '5000',
    termOptions: clone(termOptions),
    selectedTermKey: '91',
  }
}

function primaryAction(text, options = {}) {
  return {
    text,
    enabled: options.enabled ?? true,
    loading: options.loading ?? false,
    ...(options.supportingText ? { supportingText: options.supportingText } : {}),
  }
}

function cashPayload(requestId, revision, viewMode, data) {
  return {
    requestId,
    revision,
    pageStatus: 'content',
    homeMode: 'cash_loan',
    viewMode,
    viewData: data,
    tabs: clone(tabs),
  }
}

function multiPayload(requestId, revision, variant, options = {}) {
  const fixtureProducts = options.products === undefined ? clone(products) : clone(options.products)
  const data = {
    variant,
    steps: clone(steps),
    broadcast: clone(broadcast),
    creditSummary: creditSummary({ locked: options.locked, refreshEnabled: !options.locked, availableText: options.availableText }),
    minimumSelectionCount: fixtureProducts.length > 0 ? 1 : 0,
    primaryAction: primaryAction(options.actionText ?? 'Solicite ahora', {
      enabled: options.enabled,
      supportingText: options.supportingText,
    }),
  }
  if (fixtureProducts.length > 0) {
    data.products = fixtureProducts
    data.productSummary = { countTextTemplate: '{count} productos' }
  } else if (variant === 'active_only') {
    data.products = []
    data.productSummary = { countTextTemplate: '{count} productos' }
  }
  return {
    requestId,
    revision,
    pageStatus: 'content',
    homeMode: 'multi_push',
    multiPushViewData: data,
    tabs: clone(tabs),
  }
}

export const unifiedHomeFixtures = Object.freeze({
  'cash-apply': cashPayload('model-cash-apply', 1, 'apply', {
    steps: clone(steps),
    broadcast: clone(broadcast),
    productSelection: localSelection(),
    primaryAction: primaryAction('Solicite ahora'),
  }),
  'cash-reviewing': cashPayload('model-cash-reviewing', 1, 'reviewing', {
    broadcast: clone(broadcast),
    productSelection: localSelection(),
    primaryAction: primaryAction('En evaluación', { enabled: false }),
  }),
  'cash-disbursing': cashPayload('model-cash-disbursing', 1, 'disbursing', {
    broadcast: clone(broadcast),
    creditSummary: creditSummary({ locked: true, refreshEnabled: false }),
    primaryAction: primaryAction('Desembolsando', { enabled: false }),
  }),
  'cash-repaying': cashPayload('model-cash-repaying', 1, 'repaying', {
    broadcast: clone(broadcast),
    creditSummary: creditSummary({ locked: true, refreshEnabled: false }),
    primaryAction: primaryAction('Ir a reembolsar', { supportingText: 'Tienes un pago pendiente' }),
  }),
  'cash-rejected': cashPayload('model-cash-rejected', 1, 'rejected', {
    broadcast: clone(broadcast),
    productSelection: localSelection(),
    primaryAction: primaryAction('Inténtalo de nuevo', { enabled: false }),
  }),
  'multi-active-only': multiPayload('model-multi-active', 1, 'active_only', {
    products: [],
    locked: true,
    availableText: 'S/ 0',
    actionText: 'Ir a reembolsar',
    supportingText: 'Tienes un pago pendiente',
  }),
  'multi-processing-only': multiPayload('model-multi-processing', 1, 'processing_only', {
    locked: true,
    actionText: 'Evaluando',
    enabled: false,
  }),
  'multi-available-only': multiPayload('model-multi-available', 1, 'available_only'),
  'multi-available-active': multiPayload('model-multi-both', 1, 'available_and_active'),
  loading: {
    requestId: 'model-loading',
    revision: 1,
    pageStatus: 'loading',
    tabs: clone(tabs),
  },
  error: {
    requestId: 'model-error',
    revision: 1,
    pageStatus: 'error',
    tabs: clone(tabs),
    errorData: { messageText: 'No pudimos cargar esta información.' },
  },
  overlay: {
    ...cashPayload('model-overlay', 1, 'apply', {
      steps: clone(steps),
      broadcast: clone(broadcast),
      productSelection: localSelection(),
      primaryAction: primaryAction('Solicite ahora'),
    }),
    overlayNotice: { noticeId: 'overlay-1', text: 'Tu solicitud sigue en proceso.' },
  },
  toast: {
    requestId: 'model-toast',
    revision: 1,
    pageStatus: 'loading',
    tabs: clone(tabs),
    toastNotice: { noticeId: 'toast-1', text: 'Información actualizada.' },
  },
})

export function createUnifiedHomeFixture(name, activeTabKey = 'home') {
  const fixture = unifiedHomeFixtures[name] ?? unifiedHomeFixtures['cash-apply']
  const payload = clone(fixture)
  payload.tabs = payload.tabs.map((tab) => ({ ...tab, active: tab.key === activeTabKey }))
  return payload
}

export function createFixtureParts() {
  return {
    tabs: clone(tabs),
    steps: clone(steps),
    broadcast: clone(broadcast),
    amountOptions: clone(amountOptions),
    termOptions: clone(termOptions),
    products: clone(products),
    creditSummary,
    localSelection,
    primaryAction,
    cashPayload,
    multiPayload,
  }
}
