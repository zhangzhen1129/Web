import { networkClient } from '../../../shared/network/index.js'
import {
  bankProtocolPaths,
  buildAddLoanAccountPayload,
  buildUserInfoPayload,
} from '../../bank/services/bankServices.js'

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function result(type, extra) {
  return Object.freeze(extra === undefined ? { type } : { type, ...extra })
}

function readReturnCode(data) {
  const returnCode = data?.cyiUgNvO2EPltj?.atY3WWbXIN
  return Number.isInteger(returnCode) ? returnCode : null
}

function readBusinessMessage(data) {
  const message = data?.pl9xRlV
  if (typeof message !== 'string' || message.trim().length === 0) return null
  return message
}

export function createAddPaymentMethodServices({ client = networkClient, getGlobalState } = {}) {
  if (typeof getGlobalState !== 'function') throw new TypeError('getGlobalState is required.')

  return Object.freeze({
    async getUserInfo({ signal } = {}) {
      const response = await client.request({
        method: 'POST',
        path: bankProtocolPaths.USER_INFO_PATH,
        data: buildUserInfoPayload(getGlobalState()),
        signal,
        protocolId: 'API-002',
      })

      if (!isPlainObject(response) || !isPlainObject(response.data)) {
        return result('invalid_response')
      }

      const returnCode = readReturnCode(response.data)
      if (returnCode === null) return result('invalid_response')
      if (returnCode !== 2000) {
        return result('business_failure', { message: readBusinessMessage(response.data) ?? '' })
      }

      const firstName = response.data.xyF2u5qfFaFq32y6
      const lastName = response.data.sbkP9S52kXkdGPj8IPdTRAvy?.dp1JgEgUCwfPEw9A
      return result('success', {
        recipientName: `${typeof firstName === 'string' ? firstName : ''} ${typeof lastName === 'string' ? lastName : ''}`,
      })
    },

    async addLoanAccount({ accountNumber, bank, name, bankCode, type, signal } = {}) {
      const response = await client.request({
        method: 'POST',
        path: bankProtocolPaths.ADD_LOAN_ACCOUNT_PATH,
        data: buildAddLoanAccountPayload(getGlobalState(), {
          accountNumber,
          bank,
          name,
          bankCode,
          type,
        }),
        signal,
        protocolId: 'API-001',
      })

      if (!isPlainObject(response) || !isPlainObject(response.data)) {
        return result('invalid_response')
      }

      const returnCode = readReturnCode(response.data)
      if (returnCode === null) return result('invalid_response')
      if (returnCode === 2000) return result('success')

      const message = readBusinessMessage(response.data)
      if (message === null) return result('invalid_response')
      return result('business_failure', { message })
    },
  })
}