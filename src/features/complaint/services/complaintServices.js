import { networkClient } from '../../../shared/network/index.js'

const COMPLAINT_RED_DOT_PATH = '/n5V/78R7/S1221NY09yUP44TB34UNT'
const COMPLAINT_RED_DOT_PROTOCOL_ID = 'complaint-red-dot'
const SUCCESS_CODE = 2000

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value) {
  return typeof value === 'string' ? value : ''
}

function safeMessage(value) {
  if (typeof value !== 'string') return null
  const message = value.trim()
  return message && !/[<>]/.test(message) ? message : null
}

function result(type, extra = {}) {
  return Object.freeze({ type, ...extra })
}

export function buildComplaintRequestBody(globalState) {
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

export function mapComplaintRedDotResponse(data) {
  if (!isRecord(data) || !isRecord(data.cyiUgNvO2EPltj)) {
    return result('invalid_response')
  }

  const returnCode = data.cyiUgNvO2EPltj.atY3WWbXIN
  if (!Number.isInteger(returnCode)) return result('invalid_response')

  if (returnCode !== SUCCESS_CODE) {
    return result('business_failure', { message: safeMessage(data.pl9xRlV) })
  }

  return result('success', { showRedDot: data.aewM === true })
}

async function post(client, path, protocolId, data, signal) {
  const response = await client.request({
    method: 'POST',
    path,
    data,
    signal,
    protocolId,
  })
  return response?.data
}

export function createComplaintServices({ client = networkClient, getGlobalState } = {}) {
  if (typeof getGlobalState !== 'function') {
    throw new TypeError('getGlobalState is required.')
  }

  return Object.freeze({
    async loadComplaintRedDot({ signal } = {}) {
      const data = await post(
        client,
        COMPLAINT_RED_DOT_PATH,
        COMPLAINT_RED_DOT_PROTOCOL_ID,
        buildComplaintRequestBody(getGlobalState()),
        signal,
      )
      return mapComplaintRedDotResponse(data)
    },
  })
}

export const complaintProtocolPaths = Object.freeze({
  COMPLAINT_RED_DOT_PATH,
})