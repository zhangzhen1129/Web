import { networkClient } from '../../../shared/network/index.js'

const MINE_PROFILE_PATH = '/eBw/IEsD/ywzs'
const COMPLAINT_RED_DOT_PATH = '/n5V/78R7/S1221NY09yUP44TB34UNT'
const ACCOUNT_DELETION_PATH = '/tEH/THDG/ANvNJS'
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

function readEnvelope(data) {
  const returnCode = data?.cyiUgNvO2EPltj?.atY3WWbXIN
  return {
    valid: Number.isInteger(returnCode),
    returnCode,
    message: safeMessage(data?.pl9xRlV),
  }
}

export function buildMineRequestBody(globalState) {
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

export function mapMineProfileResponse(data) {
  if (!isRecord(data)) return result('invalid_response')
  const envelope = readEnvelope(data)
  if (!envelope.valid) return result('invalid_response')
  if (envelope.returnCode !== SUCCESS_CODE) {
    return result('business_failure', { message: envelope.message })
  }

  const maskedMobile = data.mwQMMTLZBtRYyQO
  return result('success', {
    maskedMobile: typeof maskedMobile === 'string' && maskedMobile.trim()
      ? maskedMobile.trim()
      : null,
  })
}

export function mapComplaintRedDotResponse(data) {
  if (!isRecord(data)) return result('invalid_response')
  const envelope = readEnvelope(data)
  if (!envelope.valid) return result('invalid_response')
  if (envelope.returnCode !== SUCCESS_CODE) {
    return result('business_failure', { message: envelope.message })
  }
  return result('success', { showRedDot: data.aewM === true })
}

export function mapAccountDeletionResponse(data) {
  if (!isRecord(data)) return result('invalid_response')
  const envelope = readEnvelope(data)
  if (!envelope.valid) return result('invalid_response')
  if (envelope.returnCode !== SUCCESS_CODE) {
    return result('business_failure', { message: envelope.message })
  }
  return result('success')
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

export function createMineServices({ client = networkClient, getGlobalState } = {}) {
  if (typeof getGlobalState !== 'function') throw new TypeError('getGlobalState is required.')

  return Object.freeze({
    async loadProfile({ signal } = {}) {
      const data = await post(
        client,
        MINE_PROFILE_PATH,
        'mine-profile',
        buildMineRequestBody(getGlobalState()),
        signal,
      )
      return mapMineProfileResponse(data)
    },

    async loadComplaintRedDot({ signal } = {}) {
      const data = await post(
        client,
        COMPLAINT_RED_DOT_PATH,
        'complaint-red-dot',
        buildMineRequestBody(getGlobalState()),
        signal,
      )
      return mapComplaintRedDotResponse(data)
    },

    async deleteAccount() {
      const data = await post(
        client,
        ACCOUNT_DELETION_PATH,
        'account-deletion',
        buildMineRequestBody(getGlobalState()),
      )
      return mapAccountDeletionResponse(data)
    },
  })
}

export const mineProtocolPaths = Object.freeze({
  MINE_PROFILE_PATH,
  COMPLAINT_RED_DOT_PATH,
  ACCOUNT_DELETION_PATH,
})
