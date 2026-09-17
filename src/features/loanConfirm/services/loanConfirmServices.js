import { networkClient } from '../../../shared/network/index.js'

const ORDER_CONFIRM_PATH = '/a1C/I3xQL/u1JXSiIZzULYu5C0H'
const APPLICATION_PATH = '/s5U/07PU3/M511a'

function stringValue(value) {
  return typeof value === 'string' ? value : ''
}

function commonPayload(globalState) {
  return {
    cvgH: stringValue(globalState?.afId),
    rsbhpZ3X: { pwtL: stringValue(globalState?.gaId) },
    bgU88QMO: { eybE: stringValue(globalState?.fbId) },
    amHasFw: stringValue(globalState?.appName),
    mmNUCmQdMioQ2O: { ux9jYLcC8H: stringValue(globalState?.appVersion) },
    qkNsXozI1oC5g3: { tf69g5Spk5: '2' },
    uxzfxbBMxhB: stringValue(globalState?.packageName),
    ulG: '',
    vqfH0gehfvNYrW: { rpryc7q8rm: '' },
    yjDnG: stringValue(globalState?.token),
  }
}

function readEnvelope(data) {
  const returnCode = data?.cyiUgNvO2EPltj?.atY3WWbXIN
  return {
    valid: Number.isInteger(returnCode),
    returnCode,
    message: stringValue(data?.pl9xRlV),
  }
}

function result(type, extra = {}) {
  return Object.freeze({ type, ...extra })
}

async function post(client, path, protocolId, data, signal) {
  const response = await client.request({ method: 'POST', path, data, signal, protocolId })
  if (!response || typeof response !== 'object' || !response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
    return result('invalid_response')
  }
  return response.data
}

export function buildOrderConfirmPayload(globalState, { orderId } = {}) {
  return {
    ...commonPayload(globalState),
    sf9Qno9CRgP: { nqE1SzE: stringValue(orderId) },
  }
}

export function buildApplicationPayload(globalState, { orderId } = {}) {
  return {
    ...commonPayload(globalState),
    sf9Qno9CRgP: { nqE1SzE: stringValue(orderId) },
  }
}

export function mapOrderConfirmDisplayModel(data) {
  return Object.freeze({
    loanAmount: stringValue(data?.trNtuIJKIOuEYFINHM),
    receivedAmount: stringValue(data?.nthhYjhBYsstcBbAO2s0?.xj2JJAdBXJWI),
    repaymentAmount: stringValue(data?.ymcCXUcK5CcGWnXRT05G6VnO7W6V),
    applicationDate: stringValue(data?.kwou5JkFthdG9),
    repaymentDate: stringValue(data?.msKyvVGCtRvBcCGyPKvLKlzKvoc2a?.bdis5H7rOsiorA7BmbbA7),
    bankName: stringValue(data?.qyaiSi4sni8lyi3m),
    bankAccount: stringValue(data?.au0YIYU8dYY1ocxJbH?.ovuPNFyIYT),
  })
}

export function createLoanConfirmServices({ client = networkClient, getGlobalState } = {}) {
  if (typeof getGlobalState !== 'function') throw new TypeError('getGlobalState is required.')

  return Object.freeze({
    async loadConfirmInfo({ orderId, signal } = {}) {
      const data = await post(
        client,
        ORDER_CONFIRM_PATH,
        'API-001',
        buildOrderConfirmPayload(getGlobalState(), { orderId }),
        signal,
      )
      if (data?.type === 'invalid_response') return data
      const envelope = readEnvelope(data)
      if (!envelope.valid) return result('invalid_response')
      if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })
      return result('success', { displayModel: mapOrderConfirmDisplayModel(data) })
    },

    async submitApplication({ orderId, signal } = {}) {
      const data = await post(
        client,
        APPLICATION_PATH,
        'API-002',
        buildApplicationPayload(getGlobalState(), { orderId }),
        signal,
      )
      if (data?.type === 'invalid_response') return data
      const envelope = readEnvelope(data)
      if (!envelope.valid) return result('invalid_response')
      if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })
      return result('success')
    },
  })
}

export const loanConfirmProtocolPaths = Object.freeze({
  ORDER_CONFIRM_PATH,
  APPLICATION_PATH,
})
