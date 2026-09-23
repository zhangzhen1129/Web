import { networkClient } from '../../../shared/network/index.js'
import {
  ORDER_LIST_PATH,
  ORDER_STATUS,
  getOrderListCardMode,
  getOrderListFilterForStatus,
} from '../orderListConstants.js'

const SUCCESS_CODE = 2000

const REPAYMENT_STATUSES = Object.freeze([ORDER_STATUS.WAY, ORDER_STATUS.DUE])
const SUPPORTED_STATUSES = new Set([
  ORDER_STATUS.CREATE,
  ORDER_STATUS.EXAMINE_WAIT,
  ORDER_STATUS.AUTO_REPEAT_EXAMINE_WAIT,
  ORDER_STATUS.EXAMINE_PASS,
  ORDER_STATUS.EXAMINE_FAIL,
  ORDER_STATUS.WAIT_PAY,
  ORDER_STATUS.WAY,
  ORDER_STATUS.DUE,
  ORDER_STATUS.COMPLETE,
  ORDER_STATUS.DUE_COMPLETE,
  ORDER_STATUS.ABANDONED,
])

export class OrderListMappingError extends Error {
  constructor(code) {
    super(code)
    this.name = 'OrderListMappingError'
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
  if (typeof value !== 'string') throw new OrderListMappingError(code)
  return value
}

function nonEmptyString(value, code) {
  const text = stringValue(value, code).trim()
  if (!text) throw new OrderListMappingError(code)
  return text
}

function plainTextValue(value, code) {
  const text = stringValue(value, code)
  if (/[<>]/.test(text)) throw new OrderListMappingError(code)
  return text
}

function plainText(value, code) {
  const text = plainTextValue(value, code).trim()
  if (!text) throw new OrderListMappingError(code)
  return text
}

function validHttpsUrl(value, code) {
  const raw = nonEmptyString(value, code)
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new OrderListMappingError(code)
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new OrderListMappingError(code)
  }
  return raw
}

function validNumber(value, code) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new OrderListMappingError(code)
  }
  return value
}

function mapOrder(item, index) {
  if (!isRecord(item)) throw new OrderListMappingError('ORDER_LIST_ITEM_INVALID')

  const orderStatus = item.orderStatus
  if (!Number.isInteger(orderStatus) || !SUPPORTED_STATUSES.has(orderStatus)) {
    throw new OrderListMappingError('ORDER_LIST_STATUS_INVALID')
  }

  const filterKey = getOrderListFilterForStatus(orderStatus)
  const cardMode = getOrderListCardMode(orderStatus)
  if (!filterKey || !cardMode) throw new OrderListMappingError('ORDER_LIST_STATUS_INVALID')

  const isRepayment = REPAYMENT_STATUSES.includes(orderStatus)
  const amountText = isRepayment
    ? String(validNumber(item.repaymentAmount, 'ORDER_LIST_REPAYMENT_AMOUNT_INVALID'))
    : stringValue(item.approvalAmount, 'ORDER_LIST_LOAN_AMOUNT_INVALID')
  const dateText = isRepayment
    ? stringValue(item.repaymentTime, 'ORDER_LIST_DUE_DATE_INVALID')
    : stringValue(item.applyTime, 'ORDER_LIST_APPLY_TIME_INVALID')

  return Object.freeze({
    key: String(index),
    orderId: nonEmptyString(item.orderNo, 'ORDER_LIST_ORDER_NO_INVALID'),
    productIconUrl: validHttpsUrl(item.productIconImageUrl, 'ORDER_LIST_PRODUCT_ICON_INVALID'),
    productName: plainTextValue(item.productName, 'ORDER_LIST_PRODUCT_NAME_INVALID'),
    amountText,
    dateText,
    actionText: plainText(item.orderStatusStr, 'ORDER_LIST_ACTION_TEXT_INVALID'),
    statusCode: orderStatus,
    filterKey,
    cardMode,
  })
}

export function buildOrderListRequestBody(store = {}) {
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

export function mapOrderListResponse(raw) {
  if (!isRecord(raw)) {
    return Object.freeze({ type: 'invalid_response', code: 'ORDER_LIST_RESPONSE_INVALID' })
  }

  const returnCode = nested(raw, 'cyiUgNvO2EPltj', 'atY3WWbXIN')
  if (!Number.isInteger(returnCode)) {
    return Object.freeze({ type: 'invalid_response', code: 'ORDER_LIST_RETURN_CODE_INVALID' })
  }

  if (returnCode !== SUCCESS_CODE) {
    const rawMessage = raw.pl9xRlV
    const message = typeof rawMessage === 'string' && rawMessage.trim() && !/[<>]/.test(rawMessage)
      ? rawMessage.trim()
      : null
    return Object.freeze({ type: 'business_failure', message })
  }

  const list = nested(raw, 'qrAbsjzu7WLU', 'baIJ')
  if (list === null || typeof list === 'undefined') {
    return Object.freeze({ type: 'success', orders: Object.freeze([]) })
  }
  if (!Array.isArray(list)) {
    return Object.freeze({ type: 'invalid_response', code: 'ORDER_LIST_LIST_INVALID' })
  }

  try {
    return Object.freeze({
      type: 'success',
      orders: Object.freeze(list.map((item, index) => mapOrder(item, index))),
    })
  } catch (error) {
    if (error instanceof OrderListMappingError) {
      return Object.freeze({ type: 'invalid_response', code: error.code })
    }
    throw error
  }
}

export function createOrderListService(options = {}) {
  const client = options.client ?? networkClient
  const getGlobalState = options.getGlobalState ?? (() => ({}))

  return Object.freeze({
    async loadOrders({ signal } = {}) {
      const response = await client.request({
        method: 'POST',
        path: ORDER_LIST_PATH,
        data: buildOrderListRequestBody(getGlobalState()),
        signal,
        protocolId: 'order-list',
      })
      return mapOrderListResponse(response?.data)
    },
  })
}
