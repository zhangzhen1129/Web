import { networkClient } from '../../../shared/network/index.js'
import { digestPassword } from './changePasswordDigest.js'

export const CHANGE_PASSWORD_PATH = '/eRM/YUIT/OSFMH2lEUWYSTH'
export const CHANGE_PASSWORD_PROTOCOL_ID = 'change-password'

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

export function buildChangePasswordPayload(globalState, {
  oldPassword,
  newPassword,
  confirmPassword,
} = {}) {
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
    ldkraVqq7in: stringValue(globalState?.mobile),
    srbF8eqimdb: digestPassword(oldPassword),
    ls4dIM0QWLLktYr: { btaUOt6x2sR: digestPassword(newPassword) },
    xvEGCllUDYzTo: digestPassword(confirmPassword),
  }
}

export function mapChangePasswordResponse(data) {
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

export function createChangePasswordServices({ client = networkClient, getGlobalState } = {}) {
  if (typeof getGlobalState !== 'function') {
    throw new TypeError('getGlobalState is required.')
  }

  return Object.freeze({
    async updatePassword({ oldPassword, newPassword, confirmPassword, signal } = {}) {
      const response = await client.request({
        method: 'POST',
        path: CHANGE_PASSWORD_PATH,
        data: buildChangePasswordPayload(getGlobalState(), {
          oldPassword,
          newPassword,
          confirmPassword,
        }),
        signal,
        protocolId: CHANGE_PASSWORD_PROTOCOL_ID,
      })

      return mapChangePasswordResponse(response?.data)
    },
  })
}