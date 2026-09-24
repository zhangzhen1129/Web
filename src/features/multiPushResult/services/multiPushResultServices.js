import { networkClient } from '../../../shared/network/index.js'
import { isDecimalString } from '../../loanSuccess/loanSuccessAmount.js'

const PRODUCT_PATH = '/veL/SgR2X1W/P3U5HIUdGjFi/aLhW'
const PRE_APPLICATION_PATH = '/nYL/R0GNU/PNUPHsX1K/S0HdSYO7'
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

function multiPushCommonPayload(globalState) {
  return {
    cvgH: stringValue(globalState?.afId),
    rsbhpZ3X: {
      pwtL: stringValue(globalState?.gaId),
    },
    bgU88QMO: {
      eybE: stringValue(globalState?.fbId),
    },
    amHasFw: stringValue(globalState?.appName),
    mmNUCmQdMioQ2O: {
      ux9jYLcC8H: stringValue(globalState?.appVersion),
    },
    qkNsXozI1oC5g3: {
      tf69g5Spk5: '2',
    },
    uxzfxbBMxhB: stringValue(globalState?.packageName),
    ulG: '',
    vqfH0gehfvNYrW: {
      rpryc7q8rm: '',
    },
    yjDnG: stringValue(globalState?.token),
  }
}

function readEnvelope(payload) {
  const returnCode = payload?.cyiUgNvO2EPltj?.atY3WWbXIN
  return {
    valid: Number.isInteger(returnCode),
    returnCode,
    message: stringValue(payload?.pl9xRlV),
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

export function createMultiPushResultServices({ client = networkClient, getGlobalState } = {}) {
  if (typeof getGlobalState !== 'function') throw new TypeError('getGlobalState is required.')

  async function loadRecommendedProducts({ signal } = {}) {
    const payload = await post(client, PRODUCT_PATH, 'API-001', multiPushCommonPayload(getGlobalState()), signal)
    if (payload.type === 'invalid_response') return payload
    const envelope = readEnvelope(payload)
    if (!envelope.valid) return result('invalid_response')
    if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })

    const list = payload?.boxeqivkXywlXvshygxTmwx
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
      ...multiPushCommonPayload(getGlobalState()),
      npwxCwB9qMB: [...productIds],
    }, signal)
    if (payload.type === 'invalid_response') return payload
    const envelope = readEnvelope(payload)
    if (!envelope.valid) return result('invalid_response')
    if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })
    const orderIds = payload?.ik803hS46CSFXi8
    if (!validStringArray(orderIds)) return result('business_failure', { message: envelope.message })
    return result('success', { orderIds: Object.freeze([...orderIds]) })
  }

  async function apply({ orderIds, signal } = {}) {
    if (!validStringArray(orderIds)) return result('invalid_response')
    const payload = await post(client, APPLICATION_PATH, 'API-003', {
      ...multiPushCommonPayload(getGlobalState()),
      iiFpTXF0KDV: [...orderIds],
    }, signal)
    if (payload.type === 'invalid_response') return payload
    const envelope = readEnvelope(payload)
    if (!envelope.valid) return result('invalid_response')
    if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })
    const appliedOrderIds = payload?.aewM
    if (!validStringArray(appliedOrderIds)) return result('business_failure', { message: envelope.message })
    return result('success', { orderIds: Object.freeze([...appliedOrderIds]) })
  }

  async function loadOrders({ startApplyTime, signal } = {}) {
    const payload = await post(client, ORDER_LIST_PATH, 'API-004', {
      ...multiPushCommonPayload(getGlobalState()),
      pyV8ela66fIZ7VLCpA: {
        vrjJCWyHuQ6Avw: stringValue(startApplyTime),
      },
    }, signal)
    if (payload.type === 'invalid_response') return payload
    const envelope = readEnvelope(payload)
    if (!envelope.valid) return result('invalid_response')
    if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })

    const list = payload?.qrAbsjzu7WLU?.baIJ
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
    const payload = await post(client, REVIEW_PROMPT_PATH, 'API-005', multiPushCommonPayload(getGlobalState()), signal)
    if (payload.type === 'invalid_response') return payload
    const envelope = readEnvelope(payload)
    if (!envelope.valid) return result('invalid_response')
    if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })
    if (typeof payload?.aewM !== 'boolean') return result('invalid_response')
    return result('success', { enabled: payload.aewM })
  }

  async function saveReview({ grade, content, signal } = {}) {
    if (!Number.isInteger(grade) || grade < 1 || grade > 5 || typeof content !== 'string') {
      return result('invalid_response')
    }
    const payload = await post(client, SAVE_REVIEW_PATH, 'API-006', {
      ...multiPushCommonPayload(getGlobalState()),
      zhNZR: grade,
      kqnBevt8VMT: {
        il940Yf: content,
      },
    }, signal)
    if (payload.type === 'invalid_response') return payload
    const envelope = readEnvelope(payload)
    if (!envelope.valid) return result('invalid_response')
    if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })
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

export const multiPushResultProtocolPaths = Object.freeze({
  PRODUCT_PATH,
  PRE_APPLICATION_PATH,
  APPLICATION_PATH,
  ORDER_LIST_PATH,
  REVIEW_PROMPT_PATH,
  SAVE_REVIEW_PATH,
})
