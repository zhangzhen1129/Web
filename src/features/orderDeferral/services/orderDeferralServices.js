import { networkClient } from '../../../shared/network/index.js'

const DEFERRAL_DETAIL_PATH = '/wHA/wPLwFKAGF/vwLsAD'
const DEFERRAL_SUBMIT_PATH = '/woe/awpdjrenj/lqao6x'

const DEFERRAL_FIELDS = Object.freeze({
  returnCode: ['cyiUgNvO2EPltj', 'atY3WWbXIN'],
  message: ['pl9xRlV'],
  exceptionMessage: ['oi'],
  billId: ['vh9d4uTh7IYo1PT'],
  applicationDate: ['qmYkXDFBY7NwJ'],
  dueDate: ['tvBFCUlFBJlcCJPFBJ'],
  extensionDays: ['kmeYZle281Z1I2caLJpH', 'yc3NXMOMxN1V'],
  paymentAmount: ['vgDMkYy6x5'],
  serviceFee: ['rkRqBuDuPCCDRZCuob29', 'wso6AenfCBn6'],
  overdueFee: ['ej21XmNiglNAN5zMdK', 'upWLpOW3Wy'],
  paymentUrl: ['aewM'],
})

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readPath(source, path) {
  let current = source
  for (const key of path) {
    if (!isPlainObject(current) && !Array.isArray(current)) return undefined
    current = current[key]
  }
  return current
}

function stringValue(value) {
  return typeof value === 'string' ? value : ''
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function displayValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  return null
}

function result(type, extra = {}) {
  return Object.freeze({ type, ...extra })
}

function readEnvelope(data) {
  const returnCode = readPath(data, DEFERRAL_FIELDS.returnCode)
  return {
    valid: Number.isInteger(returnCode),
    returnCode,
    message: stringValue(readPath(data, DEFERRAL_FIELDS.message)),
  }
}

function isSafeAbsoluteHttpUrl(value) {
  const url = nonEmptyString(value)
  if (!url || url !== url.trim()) return false
  if (/[\u0000-\u001F\u007F]/.test(url) || url.includes('\\')) return false

  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol)
      && parsed.hostname.length > 0
      && parsed.username.length === 0
      && parsed.password.length === 0
      && parsed.pathname.startsWith('/')
  } catch {
    return false
  }
}

function commonPayload(globalState) {
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

export function buildDeferralDetailPayload(globalState, { orderId } = {}) {
  return {
    ...commonPayload(globalState),
    ca: stringValue(orderId),
  }
}

export function buildDeferralSubmitPayload({ billId } = {}) {
  return {
    ca: stringValue(billId),
  }
}

export function mapDeferralDetailResponse(data) {
  if (!isPlainObject(data)) return result('invalid_response')

  const envelope = readEnvelope(data)
  if (!envelope.valid) return result('invalid_response')
  if (envelope.returnCode !== 2000) {
    return result('business_failure', { message: envelope.message })
  }

  const detail = {
    billId: nonEmptyString(readPath(data, DEFERRAL_FIELDS.billId)) ?? '',
    applicationDate: nonEmptyString(readPath(data, DEFERRAL_FIELDS.applicationDate)),
    dueDate: nonEmptyString(readPath(data, DEFERRAL_FIELDS.dueDate)),
    extensionDays: displayValue(readPath(data, DEFERRAL_FIELDS.extensionDays)),
    paymentAmount: displayValue(readPath(data, DEFERRAL_FIELDS.paymentAmount)),
    serviceFee: displayValue(readPath(data, DEFERRAL_FIELDS.serviceFee)),
    overdueFee: displayValue(readPath(data, DEFERRAL_FIELDS.overdueFee)),
  }

  return result('success', { detail })
}

export function mapDeferralSubmitResponse(data) {
  if (!isPlainObject(data)) return result('invalid_response')

  const envelope = readEnvelope(data)
  if (!envelope.valid) return result('invalid_response')
  if (envelope.returnCode !== 2000) {
    return result('business_failure', { message: envelope.message })
  }

  const paymentUrl = readPath(data, DEFERRAL_FIELDS.paymentUrl)
  if (nonEmptyString(paymentUrl) === null) {
    return result('business_failure', { message: envelope.message })
  }
  if (!isSafeAbsoluteHttpUrl(paymentUrl)) {
    return result('unsafe_url')
  }

  return result('success', { paymentUrl })
}

async function post(client, path, protocolId, data, signal) {
  const response = await client.request({ method: 'POST', path, protocolId, data, signal })
  return response?.data
}

export function createOrderDeferralServices({ client = networkClient, getGlobalState } = {}) {
  if (typeof getGlobalState !== 'function') throw new TypeError('getGlobalState is required.')

  return Object.freeze({
    async loadDeferralDetail({ orderId, signal } = {}) {
      const data = await post(
        client,
        DEFERRAL_DETAIL_PATH,
        'API-001',
        buildDeferralDetailPayload(getGlobalState(), { orderId }),
        signal,
      )
      return mapDeferralDetailResponse(data)
    },

    async submitDeferral({ billId, signal } = {}) {
      const data = await post(
        client,
        DEFERRAL_SUBMIT_PATH,
        'API-002',
        buildDeferralSubmitPayload({ billId }),
        signal,
      )
      return mapDeferralSubmitResponse(data)
    },
  })
}

export const orderDeferralProtocolPaths = Object.freeze({
  DEFERRAL_DETAIL_PATH,
  DEFERRAL_SUBMIT_PATH,
})
