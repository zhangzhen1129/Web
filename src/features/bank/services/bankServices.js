import { networkClient } from '../../../shared/network/index.js'

const USER_INFO_PATH = '/d6Z/b9V8/Z4W5'
const LOAN_ACCOUNT_LIST_PATH = '/dGd/mvhzoK5E7v/I9DdKorit9V7tjLiKKznK'
const ADD_LOAN_ACCOUNT_PATH = '/cd4/d286fhWbY2/YZ1H286fhWbY2q0Ycgbf'
const BIND_LOAN_ACCOUNT_PATH = '/mFg/mHbup/9yltTukyrJ8DauCsaEsDr'

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

export function buildUserInfoPayload(globalState) {
  return commonPayload(globalState)
}

export function buildLoanAccountListPayload(globalState) {
  return commonPayload(globalState)
}

export function buildAddLoanAccountPayload(globalState, { accountNumber, bank, name, bankCode, type } = {}) {
  return {
    ...commonPayload(globalState),
    yswWOVNpOUvMLyfcd: { sg4WmVlpmU3Mj: stringValue(accountNumber) },
    nhxt: stringValue(bank),
    tsMaqR4P: { jyiU: stringValue(name) },
    nxbfuj19OQsO: { jrhBAF7v: stringValue(bankCode) },
    fwFegVUT: { ekmA: type },
  }
}

export function buildBindLoanAccountPayload(globalState, { remittanceAccountId, orderId } = {}) {
  return {
    ...commonPayload(globalState),
    ablZsa94bVDTb5t4stcHUlS: { xhklrw8qahCfarsqrPb: stringValue(remittanceAccountId) },
    sf9Qno9CRgP: { nqE1SzE: stringValue(orderId) },
  }
}

export function createBankServices({ client = networkClient, getGlobalState } = {}) {
  if (typeof getGlobalState !== 'function') throw new TypeError('getGlobalState is required.')

  return Object.freeze({
    async getUserInfo({ signal } = {}) {
      const data = await post(client, USER_INFO_PATH, 'API-001', buildUserInfoPayload(getGlobalState()), signal)
      if (data?.type === 'invalid_response') return data
      const envelope = readEnvelope(data)
      if (!envelope.valid) return result('invalid_response')
      if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })

      const firstName = data?.xyF2u5qfFaFq32y6
      const lastName = data?.sbkP9S52kXkdGPj8IPdTRAvy?.dp1JgEgUCwfPEw9A
      return result('success', {
        recipientName: `${typeof firstName === 'string' ? firstName : ''} ${typeof lastName === 'string' ? lastName : ''}`,
      })
    },

    async getLoanAccounts({ signal } = {}) {
      const data = await post(client, LOAN_ACCOUNT_LIST_PATH, 'API-002', buildLoanAccountListPayload(getGlobalState()), signal)
      if (data?.type === 'invalid_response') return data
      const envelope = readEnvelope(data)
      if (!envelope.valid) return result('invalid_response')
      if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })

      const list = data?.qrAbsjzu7WLU?.baIJ
      if (!Array.isArray(list)) return result('business_failure', { message: envelope.message })
      return result('success', { list })
    },

    async addLoanAccount({ accountNumber, bank, name, bankCode, type, signal } = {}) {
      const data = await post(client, ADD_LOAN_ACCOUNT_PATH, 'API-003', buildAddLoanAccountPayload(getGlobalState(), {
        accountNumber,
        bank,
        name,
        bankCode,
        type,
      }), signal)
      if (data?.type === 'invalid_response') return data
      const envelope = readEnvelope(data)
      if (!envelope.valid) return result('invalid_response')
      if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })

      const id = data?.iuwUlX3FHD?.ca
      if (typeof id !== 'string' || id.length === 0) return result('business_failure', { message: envelope.message })
      return result('success', { id })
    },

    async bindLoanAccount({ remittanceAccountId, orderId, signal } = {}) {
      const data = await post(client, BIND_LOAN_ACCOUNT_PATH, 'API-004', buildBindLoanAccountPayload(getGlobalState(), {
        remittanceAccountId,
        orderId,
      }), signal)
      if (data?.type === 'invalid_response') return data
      const envelope = readEnvelope(data)
      if (!envelope.valid) return result('invalid_response')
      if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })
      return result('success')
    },
  })
}

export const bankProtocolPaths = Object.freeze({
  USER_INFO_PATH,
  LOAN_ACCOUNT_LIST_PATH,
  ADD_LOAN_ACCOUNT_PATH,
  BIND_LOAN_ACCOUNT_PATH,
})
