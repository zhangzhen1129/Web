export const MULTI_PUSH_APP_MODE = 'MULTI_PUSH'

const broadcast = Object.freeze({
  items: Object.freeze([
    Object.freeze({ key: 'one', text: '978***989 solicitó con éxito un préstamo de S/1000' }),
    Object.freeze({ key: 'two', text: '965***347 recibió su desembolso correctamente' }),
  ]),
})

const product = Object.freeze({
  id: 'product-001',
  name: 'Soluciones personalizadas',
  imageUrl: '',
  iconUrl: '',
  interestText: 'Préstamo personalizado',
  companyName: 'DineroPro',
  amountRangeText: 'S/ 100 - S/ 5,000',
  minAmount: 100,
  maxAmount: 5000,
  isReloan: false,
})

const scenarios = Object.freeze({
  'multi-available-only': Object.freeze({
    appMode: MULTI_PUSH_APP_MODE,
    availableProductCount: 6,
    activeLoanCount: 0,
    allProcessing: false,
    availableAmount: 'S/ 5,000',
    totalCredit: '5,000',
    usedCredit: '0',
    locked: false,
    primaryButtonText: 'Aplicar ahora',
    primaryAction: 'APPLY',
    statusDescription: '',
    products: Object.freeze([product]),
  }),
  'multi-active-only': Object.freeze({
    appMode: MULTI_PUSH_APP_MODE,
    availableProductCount: 0,
    activeLoanCount: 2,
    allProcessing: false,
    availableAmount: 'S/ 0',
    totalCredit: '5,000',
    usedCredit: '0',
    locked: false,
    primaryButtonText: 'Ir a reembolsar',
    primaryAction: 'REPAY',
    statusDescription: 'Demasiados préstamos ahora. Por favor, pagar primero y desbloquear una mayor cantidad del préstamo.',
    products: Object.freeze([]),
  }),
  'multi-processing': Object.freeze({
    appMode: MULTI_PUSH_APP_MODE,
    availableProductCount: 0,
    activeLoanCount: 0,
    allProcessing: true,
    availableAmount: 'S/ 5,000',
    totalCredit: '5,000',
    usedCredit: '0',
    locked: false,
    primaryButtonText: 'Evaluando',
    primaryAction: 'PROCESSING',
    statusDescription: '',
    products: Object.freeze([]),
  }),
  'multi-available-active': Object.freeze({
    appMode: MULTI_PUSH_APP_MODE,
    availableProductCount: 6,
    activeLoanCount: 2,
    allProcessing: false,
    availableAmount: 'S/ 5,000',
    totalCredit: '5,000',
    usedCredit: '0',
    locked: false,
    primaryButtonText: 'Aplicar ahora',
    primaryAction: 'APPLY',
    statusDescription: '',
    products: Object.freeze([product]),
  }),
})

export function createLocalMultiPushHomeViewData(scenario) {
  return scenarios[scenario] ?? scenarios['multi-available-only']
}

export function getMultiPushHomeState(data) {
  if (data?.appMode !== MULTI_PUSH_APP_MODE
    || !Number.isInteger(data?.availableProductCount)
    || data.availableProductCount < 0
    || !Number.isInteger(data?.activeLoanCount)
    || data.activeLoanCount < 0) return 'invalid'
  if (data.availableProductCount > 0 && data.activeLoanCount === 0) return 'available-only'
  if (data.availableProductCount === 0 && data.activeLoanCount > 0) return 'active-only'
  if (data.availableProductCount === 0 && data.activeLoanCount === 0 && data.allProcessing === true) return 'processing'
  if (data.availableProductCount > 0 && data.activeLoanCount > 0) return 'available-active'
  return 'invalid'
}

export const localMultiPushScenarios = Object.freeze(Object.keys(scenarios))
