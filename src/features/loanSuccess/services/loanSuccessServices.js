import { networkClient } from '../../../shared/network/index.js'
import { isDecimalString } from '../loanSuccessAmount.js'

const PRODUCT_PATH = '/pQj/qSpEvDu/nBtLWFdPnNfOegjTu'
const PRE_APPLICATION_PATH = '/yra/gt5gj/jg4qeo6p5S6t8gLwkj/rjgwrhnq'
const APPLICATION_PATH = '/iyA/GAvnJ/EnJpw2MBz/syHuQ'
const ORDER_LIST_PATH = '/p7R/X9MW0/J7Y37DNa332A0VN9o01b'
const REVIEW_PROMPT_PATH = '/dQz/GSFELDK/wBMPLSrCCFXPDNvOK'
const SAVE_REVIEW_PATH = '/ox8/fzelkkj/iilmzilwkz0jbmwwcu4vj'

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value) {
  return typeof value === 'string' ? value : ''
}

function result(type, extra = {}) {
  return Object.freeze({ type, ...extra })
}

function commonPayload(globalState) {
  return {
    afId: stringValue(globalState?.afId),
    gaId: stringValue(globalState?.gaId),
    fbId: stringValue(globalState?.fbId),
    appName: stringValue(globalState?.appName),
    appVersion: stringValue(globalState?.appVersion),
    mobileType: '2',
    packageName: stringValue(globalState?.packageName),
    gps: '',
    gpsAddress: '',
    token: stringValue(globalState?.token),
  }
}

function readEnvelope(payload) {
  const returnCode = payload?.returnCode
  return {
    valid: Number.isInteger(returnCode),
    returnCode,
    message: stringValue(payload?.message),
  }
}

async function post(client, path, protocolId, data, signal) {
  const response = await client.request({ method: 'POST', path, protocolId, data, signal })
  const payload = response?.data
  if (!isPlainObject(payload)) return result('invalid_response')
  return payload
}

function isSafeHttpsUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function parseProduct(item) {
  if (!isPlainObject(item)) return null
  const id = stringValue(item.id)
  const productName = stringValue(item.productName)
  const minAmount = stringValue(item.minAmount)
  const icon = stringValue(item.icon)
  if (
    id.trim().length === 0
    || productName.trim().length === 0
    || !isDecimalString(minAmount)
    || !isSafeHttpsUrl(icon)
  ) return null
  return Object.freeze({ id, productName, minAmount, icon })
}

function parseOrder(item) {
  if (!isPlainObject(item)) return null
  const orderNo = stringValue(item.orderNo)
  const approvalAmount = stringValue(item.approvalAmount)
  return Object.freeze({
    orderId: orderNo.trim().length > 0 ? orderNo : '',
    productIcon: isSafeHttpsUrl(item.productIconImageUrl) ? item.productIconImageUrl : '',
    productName: stringValue(item.productName),
    approvalAmount: isDecimalString(approvalAmount) ? approvalAmount : '',
    orderStatusText: stringValue(item.orderStatusStr),
  })
}

function validStringArray(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((item) => typeof item === 'string' && item.trim().length > 0)
}

export function createLoanSuccessServices({ client = networkClient, getGlobalState } = {}) {
  if (typeof getGlobalState !== 'function') throw new TypeError('getGlobalState is required.')

  async function loadRecommendedProducts({ signal } = {}) {
    const payload = await post(client, PRODUCT_PATH, 'API-001', commonPayload(getGlobalState()), signal)
    if (payload.type === 'invalid_response') return payload
    const envelope = readEnvelope(payload)
    if (!envelope.valid) return result('invalid_response')
    if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })

    const list = payload?.data?.list
    if (list === undefined || list === null || (Array.isArray(list) && list.length === 0)) {
      return result('empty')
    }
    if (!Array.isArray(list)) return result('invalid_response')

    const products = []
    const ids = new Set()
    for (const item of list) {
      const product = parseProduct(item)
      if (!product || ids.has(product.id)) return result('invalid_response')
      ids.add(product.id)
      products.push(product)
    }
    return result('success', { products: Object.freeze(products) })
  }

  async function preApply({ productIds, signal } = {}) {
    if (!validStringArray(productIds)) return result('invalid_response')
    const payload = await post(client, PRE_APPLICATION_PATH, 'API-002', {
      ...commonPayload(getGlobalState()),
      productList: [...productIds],
    }, signal)
    if (payload.type === 'invalid_response') return payload
    const envelope = readEnvelope(payload)
    if (!envelope.valid) return result('invalid_response')
    if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })
    const orderIds = payload?.data?.orderIdList
    if (!validStringArray(orderIds)) return result('business_failure', { message: envelope.message })
    return result('success', { orderIds: Object.freeze([...orderIds]) })
  }

  async function apply({ orderIds, signal } = {}) {
    if (!validStringArray(orderIds)) return result('invalid_response')
    const payload = await post(client, APPLICATION_PATH, 'API-003', {
      ...commonPayload(getGlobalState()),
      orderIdList: [...orderIds],
    }, signal)
    if (payload.type === 'invalid_response') return payload
    const envelope = readEnvelope(payload)
    if (!envelope.valid) return result('invalid_response')
    if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })
    if (!validStringArray(payload?.data)) return result('business_failure', { message: envelope.message })
    return result('success', { orderIds: Object.freeze([...payload.data]) })
  }

  async function loadOrders({ startApplyTime, signal } = {}) {
    const payload = await post(client, ORDER_LIST_PATH, 'API-004', {
      ...commonPayload(getGlobalState()),
      startApplyTime: stringValue(startApplyTime),
    }, signal)
    if (payload.type === 'invalid_response') return payload
    const envelope = readEnvelope(payload)
    if (!envelope.valid) return result('invalid_response')
    if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })

    const list = payload?.data?.list
    if (list === undefined || list === null || (Array.isArray(list) && list.length === 0)) {
      return result('empty')
    }
    if (!Array.isArray(list)) return result('invalid_response')

    const orders = []
    for (const item of list) {
      const order = parseOrder(item)
      if (!order) return result('invalid_response')
      orders.push(order)
    }
    return result('success', { orders: Object.freeze(orders) })
  }

  async function getReviewPromptEnabled({ signal } = {}) {
    const payload = await post(client, REVIEW_PROMPT_PATH, 'API-005', commonPayload(getGlobalState()), signal)
    if (payload.type === 'invalid_response') return payload
    const envelope = readEnvelope(payload)
    if (!envelope.valid) return result('invalid_response')
    if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })
    if (typeof payload?.data !== 'boolean') return result('invalid_response')
    return result('success', { enabled: payload.data })
  }

  async function saveReview({ grade, content, signal } = {}) {
    if (!Number.isInteger(grade) || grade < 1 || grade > 5 || typeof content !== 'string') {
      return result('invalid_response')
    }
    const payload = await post(client, SAVE_REVIEW_PATH, 'API-006', {
      ...commonPayload(getGlobalState()),
      grade,
      content,
    }, signal)
    if (payload.type === 'invalid_response') return payload
    const envelope = readEnvelope(payload)
    if (!envelope.valid) return result('invalid_response')
    if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })
    if (!isPlainObject(payload?.data)) return result('invalid_response')
    return result('success')
  }

  return Object.freeze({
    loadRecommendedProducts,
    preApply,
    apply,
    loadOrders,
    getReviewPromptEnabled,
    saveReview,
  })
}

export const loanSuccessProtocolPaths = Object.freeze({
  PRODUCT_PATH,
  PRE_APPLICATION_PATH,
  APPLICATION_PATH,
  ORDER_LIST_PATH,
  REVIEW_PROMPT_PATH,
  SAVE_REVIEW_PATH,
})
