import { getProjectMessage } from '../../../shared/config/projectLanguage.js'

export const MULTI_PUSH_APP_MODE = 'multi_push'

const MULTI_PUSH_BUTTON_MESSAGE_IDS = Object.freeze({
  apply: '33',
  repay: '30',
  evaluating: '31',
  disbursing: '32',
})

export function getMultiPushPrimaryButtonText(action, processingVariant = 'evaluating') {
  const messageId = action === 'processing'
    ? MULTI_PUSH_BUTTON_MESSAGE_IDS[processingVariant]
    : MULTI_PUSH_BUTTON_MESSAGE_IDS[action]
  return getProjectMessage(messageId)
}

const broadcast = Object.freeze({
  items: Object.freeze([
    Object.freeze({ key: 'one', text: '978***989 solicitó con éxito un préstamo de S/1000' }),
    Object.freeze({ key: 'two', text: '965***347 recibió su desembolso correctamente' }),
  ]),
})
const steps = Object.freeze([
  Object.freeze({ key: 'verify', text: 'Verificación de información' }),
  Object.freeze({ key: 'review', text: 'Revisión del préstamo' }),
  Object.freeze({ key: 'approve', text: 'Aprobación de la solicitud' }),
])

const product = Object.freeze({
  id: 'product-001',
  name: 'Préstamo Rápido',
  iconUrl: '/src/assets/home/multi-product-icon.png',
  loanAmountText: 'S/ 1,500',
  dueDateText: '2025-11-20',
  minAmount: 1000,
  isReloan: true,
  selectable: true,
  selected: true,
})

const products = Object.freeze([1000, 800, 700, 900, 600, 1000].map((minAmount, index) => Object.freeze({
  ...product,
  id: `product-${String(index + 1).padStart(3, '0')}`,
  minAmount,
  selected: true,
})))

const scenarios = Object.freeze({
  'multi-available-only': Object.freeze({
    appMode: MULTI_PUSH_APP_MODE,
    availableProductCount: 6,
    activeLoanCount: 0,
    allProcessing: false,
    availableAmount: 'S/ 5,000',
    availableLabelText: 'Cantidad disponible',
    totalCredit: '5,000',
    totalCreditLabelText: 'Crédito total',
    usedCredit: '0',
    usedCreditLabelText: 'Crédito usado',
    locked: false,
    refreshEnabled: true,
    primaryButtonText: getMultiPushPrimaryButtonText('apply'),
    primaryAction: 'apply',
    statusDescription: '',
    products,
    selectedProductCount: 6,
    selectedMinimumAmount: 'S/ 5,000',
    serverRemainingAmount: 'S/ 5,000',
  minimumSelectionCount: 1,
    selectionSubmitText: 'Solicite ahora',
    productSummaryText: 'Soluciones personalizadas',
  }),
  'multi-active-only': Object.freeze({
    appMode: MULTI_PUSH_APP_MODE,
    availableProductCount: 0,
    activeLoanCount: 2,
    allProcessing: false,
    availableAmount: 'S/ 0',
    availableLabelText: 'Cantidad disponible',
    totalCredit: '5,000',
    totalCreditLabelText: 'Crédito total',
    usedCredit: '0',
    usedCreditLabelText: 'Crédito usado',
    locked: false,
    refreshEnabled: false,
    primaryButtonText: getMultiPushPrimaryButtonText('repay'),
    primaryAction: 'repay',
    statusDescription: 'Demasiados préstamos ahora. Por favor, pagar primero y desbloquear una mayor cantidad del préstamo.',
    products: Object.freeze([]),
    selectedProductCount: 0,
    selectedMinimumAmount: 'S/ 0',
    serverRemainingAmount: 'S/ 0',
    minimumSelectionCount: 0,
  }),
  'multi-processing': Object.freeze({
    appMode: MULTI_PUSH_APP_MODE,
    availableProductCount: 0,
    activeLoanCount: 0,
    allProcessing: true,
    availableAmount: 'S/ 5,000',
    availableLabelText: 'Cantidad disponible',
    totalCredit: '5,000',
    totalCreditLabelText: 'Crédito total',
    usedCredit: '0',
    usedCreditLabelText: 'Crédito usado',
    locked: false,
    refreshEnabled: false,
    primaryButtonText: getMultiPushPrimaryButtonText('processing'),
    primaryAction: 'processing',
    statusDescription: '',
    products: Object.freeze([]),
    selectedProductCount: 0,
    selectedMinimumAmount: 'S/ 0',
    serverRemainingAmount: 'S/ 0',
    minimumSelectionCount: 0,
  }),
  'multi-available-active': Object.freeze({
    appMode: MULTI_PUSH_APP_MODE,
    availableProductCount: 6,
    activeLoanCount: 2,
    allProcessing: false,
    availableAmount: 'S/ 5,000',
    availableLabelText: 'Cantidad disponible',
    totalCredit: '5,000',
    totalCreditLabelText: 'Crédito total',
    usedCredit: '0',
    usedCreditLabelText: 'Crédito usado',
    locked: false,
    refreshEnabled: true,
    primaryButtonText: getMultiPushPrimaryButtonText('apply'),
    primaryAction: 'apply',
    statusDescription: '',
    products,
    selectedProductCount: 6,
    selectedMinimumAmount: 'S/ 5,000',
    serverRemainingAmount: 'S/ 5,000',
    minimumSelectionCount: 1,
    selectionSubmitText: 'Solicite ahora',
    productSummaryText: 'Soluciones personalizadas',
  }),
})

function createTabs() {
  return [
    { key: 'home', text: 'Préstamos', iconResourceKey: 'home', active: true, enabled: true },
    { key: 'repayment', text: 'Reembolso', iconResourceKey: 'repayment', active: false, enabled: true },
    { key: 'account', text: 'Mi cuenta', iconResourceKey: 'account', active: false, enabled: true },
  ]
}

export function createLocalMultiPushHomeViewData(scenario) {
  const data = scenarios[scenario] ?? scenarios['multi-available-only']
  const products = data.products.map((item) => ({ ...item }))
  const selectedMinimumAmount = products
    .filter((item) => item.selectable && item.selected)
    .reduce((total, item) => total + item.minAmount, 0)
  const selectedMinimumAmountText = `S/ ${selectedMinimumAmount.toLocaleString('en-US')}`
  const selectedProductCount = products.filter((item) => item.selectable && item.selected).length
  const { appMode, ...displayData } = data
  return {
    ...displayData,
    titleText: 'Solicitud rápida en 3 pasos',
    creditRefreshLabelText: 'Actualizar crédito',
    loanAmountLabelText: 'Monto del préstamo',
    dueDateLabelText: 'Vence el',
    reloanLabelText: 'Volver a prestar',
    steps,
    broadcast,
    availableAmount: data.availableAmount,
    tabs: createTabs(),
    products,
    selectedProductCount,
    selectedMinimumAmount: selectedMinimumAmountText,
    productCountText: `${selectedProductCount} productos`,
  }
}

export function getMultiPushHomeState(data) {
  if ((data?.appMode !== undefined && data.appMode !== MULTI_PUSH_APP_MODE)
    || !Number.isInteger(data?.availableProductCount)
    || data.availableProductCount < 0
    || !Number.isInteger(data?.activeLoanCount)
    || data.activeLoanCount < 0) return 'invalid'
  if (data.primaryAction === 'apply' && data.availableProductCount > 0) return 'available-and-active'
  if (data.primaryAction === 'repay' && data.activeLoanCount > 0) return 'active-only'
  if (data.primaryAction === 'processing' && data.allProcessing === true) return 'processing-only'
  return 'invalid'
}

export function createMultiPushContentPayload(scenario, requestId, sourceOperationId) {
  const viewData = createLocalMultiPushHomeViewData(scenario)
  return {
    requestId,
    ...(sourceOperationId ? { sourceOperationId } : {}),
    pageStatus: 'content',
    homeMode: MULTI_PUSH_APP_MODE,
    multiPushViewData: viewData,
  }
}

export const localMultiPushScenarios = Object.freeze(Object.keys(scenarios))
