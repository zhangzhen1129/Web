import { digestPassword } from '../../changePassword/services/changePasswordDigest.js'
import { networkClient } from '../../../shared/network/index.js'

export const CREATE_PASSWORD_PATH = '/jJt/FMpL/wCylNpdlMDQzLo'
export const CREATE_PASSWORD_PROTOCOL_ID = 'create-password'

const SUCCESS_CODE = 2000

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value) {
  return typeof value === 'string' ? value : ''
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function safeMessage(value) {
  if (typeof value !== 'string') return ''
  const message = value.trim()
  return message && !/[<>]/.test(message) ? message : ''
}

function result(type, extra) {
  return Object.freeze(extra === undefined ? { type } : { type, ...extra })
}

export function buildCreatePasswordPayload(globalState, { newPassword } = {}) {
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
    ja8CcnG5k3: { pgIcMX: digestPassword(newPassword) },
  }
}

export function mapCreatePasswordResponse(data) {
  if (!isRecord(data) || !isRecord(data.cyiUgNvO2EPltj)) {
    return result('invalid_response')
  }

  const returnCode = data.cyiUgNvO2EPltj.atY3WWbXIN
  if (!Number.isInteger(returnCode)) return result('invalid_response')
  if (returnCode !== SUCCESS_CODE) {
    return result('business_failure', { message: safeMessage(data.pl9xRlV) })
  }

  const token = data.nl3H3VULXxvbt?.yjDnG
  const userId = data.hvdBeTYSwEKmok?.exMykk
  if (!isNonEmptyString(token) || !isNonEmptyString(userId)) {
    return result('invalid_response')
  }

  return result('success', { token, userId })
}

export function createCreatePasswordServices({ client = networkClient, getGlobalState } = {}) {
  if (typeof getGlobalState !== 'function') {
    throw new TypeError('getGlobalState is required.')
  }

  return Object.freeze({
    async createPassword({ newPassword, signal } = {}) {
      const response = await client.request({
        method: 'POST',
        path: CREATE_PASSWORD_PATH,
        data: buildCreatePasswordPayload(getGlobalState(), { newPassword }),
        signal,
        protocolId: CREATE_PASSWORD_PROTOCOL_ID,
      })

      return mapCreatePasswordResponse(response?.data)
    },
  })
}
