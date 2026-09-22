import { networkClient } from '../../../shared/network/index.js'
import {
  REPAYMENT_ORDER_LIST_PATH,
  REPAYMENT_ORDER_STATUS,
  REPAYMENT_STATUS_KEY,
} from '../repaymentConstants.js'

const SUCCESS_CODE = 2000

export class RepaymentOrderMappingError extends Error {
  constructor(code) {
    super(code)
    this.name = 'RepaymentOrderMappingError'
    this.code = code
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nested(value, parent, child) {
  return isRecord(value?.[parent]) ? value[parent][child] : undefined
}

function stringValue(value, code) {
  if (typeof value !== 'string') throw new RepaymentOrderMappingError(code)
  return value
}

function nonEmptyString(value, code) {
  const text = stringValue(value, code).trim()
  if (!text) throw new RepaymentOrderMappingError(code)
  return text
}

function plainText(value, code) {
  const text = nonEmptyString(value, code)
  if (/[<>]/.test(text)) throw new RepaymentOrderMappingError(code)
  return text
}

function validHttpsUrl(value, code) {
  const raw = stringValue(value, code).trim()
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new RepaymentOrderMappingError(code)
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new RepaymentOrderMappingError(code)
  }
  return raw
}

function validNumber(value, code) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RepaymentOrderMappingError(code)
  }
  return value
}

function mapOrder(item, index) {
  if (!isRecord(item)) throw new RepaymentOrderMappingError('REPAYMENT_ORDER_INVALID')

  const orderStatus = item.orderStatus
  if (!Number.isInteger(orderStatus)
    || (orderStatus !== REPAYMENT_ORDER_STATUS.WAY && orderStatus !== REPAYMENT_ORDER_STATUS.DUE)) {
    throw new RepaymentOrderMappingError('REPAYMENT_ORDER_STATUS_INVALID')
  }

  const statusKey = orderStatus === REPAYMENT_ORDER_STATUS.WAY
    ? REPAYMENT_STATUS_KEY.REPAYING
    : REPAYMENT_STATUS_KEY.OVERDUE

  return Object.freeze({
    key: String(index),
    orderId: nonEmptyString(item.orderNo, 'REPAYMENT_ORDER_NO_INVALID'),
    productIconUrl: validHttpsUrl(item.productIconImageUrl, 'REPAYMENT_PRODUCT_ICON_INVALID'),
    productName: stringValue(item.productName, 'REPAYMENT_PRODUCT_NAME_INVALID'),
    amountText: String(validNumber(item.repaymentAmount, 'REPAYMENT_AMOUNT_INVALID')),
    dueDateText: stringValue(item.repaymentTime, 'REPAYMENT_DUE_DATE_INVALID'),
    actionText: plainText(item.orderStatusStr, 'REPAYMENT_ACTION_TEXT_INVALID'),
    statusCode: orderStatus,
    statusKey,
  })
}

export function buildRepaymentOrderRequestBody(store = {}) {
  const value = (key) => (typeof store?.[key] === 'string' ? store[key] : '')

  return {
    cvgH: value('afId'),
    rsbhpZ3X: { pwtL: value('gaId') },
    bgU88QMO: { eybE: value('fbId') },
    amHasFw: value('appName'),
    mmNUCmQdMioQ2O: { ux9jYLcC8H: value('appVersion') },
    qkNsXozI1oC5g3: { tf69g5Spk5: '2' },
    uxzfxbBMxhB: value('packageName'),
    ulG: '',
    vqfH0gehfvNYrW: { rpryc7q8rm: '' },
    yjDnG: value('token'),
  }
}

export function mapRepaymentOrderListResponse(raw) {
  if (!isRecord(raw)) {
    return Object.freeze({ type: 'invalid_response', code: 'REPAYMENT_RESPONSE_INVALID' })
  }

  const returnCode = nested(raw, 'cyiUgNvO2EPltj', 'atY3WWbXIN')
  if (!Number.isInteger(returnCode)) {
    return Object.freeze({ type: 'invalid_response', code: 'REPAYMENT_RETURN_CODE_INVALID' })
  }

  if (returnCode !== SUCCESS_CODE) {
    const message = typeof raw?.pl9xRlV === 'string' && raw.pl9xRlV.trim() && !/[<>]/.test(raw.pl9xRlV)
      ? raw.pl9xRlV.trim()
      : null
    return Object.freeze({ type: 'business_failure', message })
  }

  const list = nested(raw, 'qrAbsjzu7WLU', 'baIJ')
  if (list === null || typeof list === 'undefined') {
    return Object.freeze({ type: 'success', orders: Object.freeze([]) })
  }
  if (!Array.isArray(list)) {
    return Object.freeze({ type: 'invalid_response', code: 'REPAYMENT_ORDER_LIST_INVALID' })
  }

  try {
    return Object.freeze({
      type: 'success',
      orders: Object.freeze(list.map((item, index) => mapOrder(item, index))),
    })
  } catch (error) {
    if (error instanceof RepaymentOrderMappingError) {
      return Object.freeze({ type: 'invalid_response', code: error.code })
    }
    throw error
  }
}

export function createRepaymentOrderListService(options = {}) {
  const client = options.client ?? networkClient
  const getGlobalState = options.getGlobalState ?? (() => ({}))

  return Object.freeze({
    async loadOrders({ signal } = {}) {
      const response = await client.request({
        method: 'POST',
        path: REPAYMENT_ORDER_LIST_PATH,
        data: buildRepaymentOrderRequestBody(getGlobalState()),
        signal,
        protocolId: 'repayment-order-list',
      })
      return mapRepaymentOrderListResponse(response?.data)
    },
  })
}
