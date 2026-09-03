import { getProjectMessage } from '../../../shared/config/projectLanguage.js'
import { createLocalContentPayload } from '../providers/localHomeViewData.js'
import { createLocalMultiPushHomeViewData } from '../providers/localMultiPushHomeViewData.js'

const SUCCESS_CODE = 2000
const CASH_MODE_VALUES = new Set([0, 3])
const KNOWN_ORDER_STATUS_VALUES = new Set([10, 20, 21, 30, 40, 70, 80, 90, 100, 101, 110])
const MULTI_BUTTONS = Object.freeze({
  repay: getProjectMessage('30'),
  evaluating: getProjectMessage('31'),
  disbursing: getProjectMessage('32'),
  apply: getProjectMessage('33'),
})

export class HomeDataMappingError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireString(value, code) {
  if (typeof value !== 'string' || value.length === 0) throw new HomeDataMappingError(code)
  return value
}

function requireInteger(value, code) {
  if (!Number.isInteger(value)) throw new HomeDataMappingError(code)
  return value
}

function readNested(record, parent, child) {
  return isRecord(record?.[parent]) ? record[parent][child] : undefined
}

function normalizeEnvelope(response) {
  return {
    returnCode: readNested(response, 'cyiUgNvO2EPltj', 'atY3WWbXIN'),
    message: response?.pl9xRlV,
    data: response,
  }
}

function normalizeAppModeResponse(response) {
  return {
    ...normalizeEnvelope(response),
    data: {
      maskModel: response?.ff1xUx0HoLLBT,
      identityAuth: readNested(response, 'sdev3yZIeDeTpPeCLgpe', 'zzNz2u2KdG2t'),
      addInfoAuth: readNested(response, 'kquKbNemoPpev3iAWeU', 'nxUg4J58bXY'),
      basicInfoAuth: response?.uxevWvdDX78A9ZfO2,
      remittanceAccountAuth: response?.lsnKlOgSn34X6OyM6YoXneo3b,
      amount: readNested(response, 'kuYUF6TeSdvF9D', 'ehE3D2'),
      repaymentTime: readNested(response, 'ujAfyjwfFrlsA2prl52J0', 'wjU33fJgYQNfJ'),
      applyTime: response?.kwou5JkFthdG9,
      button: response?.jex8fsxrsl,
      statusDescription: readNested(response, 'umwAvTdTxSKEvCuIsTlOqqY4W', 'xdbJvIIutssyqJjEo'),
      orderId: response?.kteZ9gY3cBY,
      orderStatus: response?.kxCNx4mRAzCNC7B,
      totalCredit: response?.zbp3php3hzn79bp,
      usedCredit: readNested(response, 'bjNBOTyE0SyECUkmYk', 'dtbUD8bUfa'),
      locked: readNested(response, 'mem6ek5g79TRxP', 'uiRcT5'),
      guideType: response?.zgXKK4MNIx2ZI,
      confirmType: response?.frhj0xbo6Aa6my2,
    },
  }
}

function normalizeMultiPushResponse(response) {
  return {
    ...normalizeEnvelope(response),
    data: {
      usedQuota: response?.zk9qaIUtAK4JQ,
      sumQuota: response?.wzKtJNDdLHKt,
      remaining: response?.hb9P7T2PY2Y2W,
      locked: readNested(response, 'mem6ek5g79TRxP', 'uiRcT5'),
      repaymentNum: readNested(response, 'byrspwnswEcFr9sEYdCb', 'xgxcGompBTCo'),
      button: response?.jex8fsxrsl,
      mergPushProductList: response?.boxeqivkXywlXvshygxTmwx,
    },
  }
}

function requireData(response, code) {
  if (!isRecord(response)) throw new HomeDataMappingError(`${code}_RESPONSE_INVALID`)
  if (requireInteger(response.returnCode, `${code}_RETURN_CODE`) !== SUCCESS_CODE) {
    const error = new HomeDataMappingError(`${code}_BUSINESS_FAILURE`)
    error.displayText = typeof response.message === 'string' && response.message.length > 0 ? response.message : null
    throw error
  }
  if (!isRecord(response.data)) throw new HomeDataMappingError(`${code}_DATA_INVALID`)
  return response.data
}

function createCreditSummary(data) {
  return {
    availableLabelText: 'Cantidad disponible',
    availableText: requireString(data.amount, 'CASH_AMOUNT_INVALID'),
    totalLabelText: 'Credito total',
    totalText: requireString(data.totalCredit, 'CASH_TOTAL_CREDIT_INVALID'),
    usedLabelText: 'Credito usado',
    usedText: requireString(data.usedCredit, 'CASH_USED_CREDIT_INVALID'),
    locked: requireInteger(data.locked, 'CASH_LOCKED_INVALID') !== 0,
    refreshEnabled: requireInteger(data.locked, 'CASH_LOCKED_INVALID') === 0,
    refreshLabelText: 'Actualizar credito',
  }
}

function cashStage(data) {
  const mode = requireInteger(data.maskModel, 'CASH_MODE_INVALID')
  if (mode === 2) return { stage: 'application_unavailable', mode: 'cash_loan' }
  if (!CASH_MODE_VALUES.has(mode)) throw new HomeDataMappingError('CASH_MODE_INVALID')

  const authFields = ['basicInfoAuth', 'addInfoAuth', 'identityAuth', 'remittanceAccountAuth']
  for (const field of authFields) {
    if (requireInteger(data[field], `CASH_${field}_INVALID`) === 0) return { stage: 'apply', mode: 'cash_loan' }
  }

  if (typeof data.orderId !== 'string' || data.orderId.length === 0 || !Number.isInteger(data.orderStatus)) {
    throw new HomeDataMappingError('CASH_ORDER_UNAVAILABLE')
  }
  if (!KNOWN_ORDER_STATUS_VALUES.has(data.orderStatus)) throw new HomeDataMappingError('CASH_ORDER_STATUS_INVALID')
  if (data.orderStatus === 20 || data.orderStatus === 21) return { stage: 'reviewing', mode: 'cash_loan' }
  if (data.orderStatus === 30 || data.orderStatus === 70) return { stage: 'disbursing', mode: 'cash_loan' }
  if (data.orderStatus === 80 || data.orderStatus === 90) return { stage: 'repaying', mode: 'cash_loan', notice: data.orderStatus === 90 ? 'overdue' : 'repayment_due' }
  if (data.orderStatus === 40) return { stage: 'rejected', mode: 'cash_loan', effect: 'show_overlay_notice', messageId: '20' }
  return { stage: 'apply', mode: 'cash_loan' }
}

function createCashPayload(data, requestId, sourceOperationId) {
  const result = cashStage(data)
  const stage = result.stage === 'application_unavailable' ? 'apply' : result.stage
  const template = createLocalContentPayload(stage, requestId).viewData
  const viewData = {
    ...template,
    primaryAction: {
      ...template.primaryAction,
      text: requireString(data.button, 'CASH_BUTTON_INVALID'),
    },
  }
  delete viewData.productSelection
  viewData.creditSummary = createCreditSummary(data)
  if (result.notice) {
    viewData.statusNotice = {
      text: requireString(data.statusDescription, 'CASH_STATUS_DESCRIPTION_INVALID'),
      tone: result.notice === 'overdue' ? 'warning' : 'info',
      stateKey: result.notice,
    }
  }
  return {
    payload: {
      requestId,
      ...(sourceOperationId ? { sourceOperationId } : {}),
      pageStatus: 'content',
      homeMode: 'cash_loan',
      viewMode: stage,
      viewData,
    },
    snapshot: Object.freeze({
      mode: 'cash_loan',
      stage: result.stage,
      primaryActionEffect: result.effect ?? null,
      primaryActionMessageId: result.messageId ?? null,
      orderId: data.orderId,
      repaymentTime: data.repaymentTime,
      applyTime: data.applyTime,
    }),
  }
}

function isSafeResourceUrl(value) {
  return typeof value === 'string' && /^https:\/\//.test(value)
}

function parseMinimumAmount(value) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new HomeDataMappingError('MULTI_MINIMUM_AMOUNT_INVALID')
  const parsed = Number(value.replace(/,/g, '').trim())
  if (!Number.isFinite(parsed) || parsed < 0) throw new HomeDataMappingError('MULTI_MINIMUM_AMOUNT_INVALID')
  return parsed
}

function formatAmount(value) {
  return value.toLocaleString('en-US')
}

function dueDateText(now) {
  const date = new Date(now)
  if (Number.isNaN(date.getTime())) throw new HomeDataMappingError('MULTI_DATE_INVALID')
  date.setDate(date.getDate() + 6)
  return date.toISOString().slice(0, 10)
}

function mapMultiAction(button) {
  if (button === MULTI_BUTTONS.repay) return { primaryAction: 'repay', allProcessing: false, effect: 'navigate_repayment_list' }
  if (button === MULTI_BUTTONS.evaluating) return { primaryAction: 'processing', allProcessing: true, effect: 'navigate_order_list', variant: 'evaluating' }
  if (button === MULTI_BUTTONS.disbursing) return { primaryAction: 'processing', allProcessing: true, effect: 'navigate_order_list', variant: 'disbursing' }
  if (button === MULTI_BUTTONS.apply) return { primaryAction: 'apply', allProcessing: false, effect: 'apply_order' }
  throw new HomeDataMappingError('MULTI_BUTTON_INVALID')
}

function mapMultiProducts(value, now) {
  if (!Array.isArray(value)) throw new HomeDataMappingError('MULTI_PRODUCTS_INVALID')
  const ids = new Set()
  const dueDate = dueDateText(now)
  return value.map((item) => {
    if (!isRecord(item)) throw new HomeDataMappingError('MULTI_PRODUCT_INVALID')
    const id = requireString(item.id, 'MULTI_PRODUCT_ID_INVALID')
    if (ids.has(id)) throw new HomeDataMappingError('MULTI_PRODUCT_ID_DUPLICATE')
    ids.add(id)
    const minAmount = parseMinimumAmount(item.minAmount)
    return {
      id,
      name: requireString(item.productName, 'MULTI_PRODUCT_NAME_INVALID'),
      ...(isSafeResourceUrl(item.icon) ? { iconUrl: item.icon } : {}),
      loanAmountText: requireString(item.minAmount, 'MULTI_PRODUCT_MINIMUM_TEXT_INVALID'),
      dueDateText: dueDate,
      minAmount,
      isReloan: requireInteger(item.isReloan, 'MULTI_PRODUCT_RELOAN_INVALID') === 1,
      selectable: true,
      selected: true,
    }
  })
}

export function mapAppModeResponse(response, { requestId, sourceOperationId } = {}) {
  const data = requireData(normalizeAppModeResponse(response), 'APP_MODE')
  const mode = requireInteger(data.maskModel, 'APP_MODE_INVALID')
  if (mode === 1) return { kind: 'multi_push', requestId, sourceOperationId, data: Object.freeze({ ...data }) }
  return { kind: 'cash_loan', ...createCashPayload(data, requestId, sourceOperationId) }
}

export function mapMultiPushResponse(response, { requestId, sourceOperationId, now = Date.now() } = {}) {
  const data = requireData(normalizeMultiPushResponse(response), 'MULTI')
  const products = mapMultiProducts(data.mergPushProductList, now)
  const action = mapMultiAction(requireString(data.button, 'MULTI_BUTTON_INVALID'))
  const template = createLocalMultiPushHomeViewData('multi-available-only')
  const selectedMinimum = products.reduce((sum, product) => sum + product.minAmount, 0)
  const isEmptyApply = action.primaryAction === 'apply' && products.length === 0
  if (action.primaryAction !== 'apply' && products.length > 0) throw new HomeDataMappingError('MULTI_PRODUCTS_FOR_ACTION_INVALID')
  const multiPushViewData = {
    ...template,
    availableProductCount: products.length,
    activeLoanCount: requireInteger(data.repaymentNum, 'MULTI_REPAYMENT_COUNT_INVALID'),
    allProcessing: action.allProcessing,
    availableAmount: formatAmount(selectedMinimum),
    totalCredit: requireString(data.sumQuota, 'MULTI_TOTAL_CREDIT_INVALID'),
    usedCredit: requireString(data.usedQuota, 'MULTI_USED_CREDIT_INVALID'),
    serverRemainingAmount: requireString(data.remaining, 'MULTI_REMAINING_AMOUNT_INVALID'),
    locked: requireInteger(data.locked, 'MULTI_LOCKED_INVALID') !== 0,
    refreshEnabled: requireInteger(data.locked, 'MULTI_LOCKED_INVALID') === 0,
    primaryButtonText: requireString(data.button, 'MULTI_BUTTON_INVALID'),
    primaryAction: action.primaryAction,
    statusDescription: typeof data.statusDescription === 'string' ? data.statusDescription : '',
    products,
    selectedProductCount: products.length,
    selectedMinimumAmount: formatAmount(selectedMinimum),
    minimumSelectionCount: products.length > 0 ? 1 : 0,
    productCountText: `${products.length} productos`,
  }
  return {
    payload: {
      requestId,
      ...(sourceOperationId ? { sourceOperationId } : {}),
      pageStatus: 'content',
      homeMode: 'multi_push',
      multiPushViewData,
    },
    snapshot: Object.freeze({
      mode: 'multi_push',
      primaryActionEffect: isEmptyApply ? 'show_empty_products_toast' : action.effect,
      primaryActionMessageId: isEmptyApply ? '10' : null,
      serverRemainingAmount: data.remaining,
    }),
  }
}
