import { networkClient } from '../../../shared/network/index.js'

const BANK_ACCOUNT_LIST_PATH = '/dGd/mvhzoK5E7v/I9DdKorit9V7tjLiKKznK'
const UPDATE_LOAN_CARD_PATH = '/x3L/USPWW7D1FS/0RRLT1tROQkD5G'

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value) {
  return typeof value === 'string' ? value : ''
}

function result(type, extra) {
  return extra === undefined ? Object.freeze({ type }) : Object.freeze({ type, ...extra })
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

function buildBankAccountListPayload(globalState) {
  return commonPayload(globalState)
}

function buildUpdateLoanCardPayload(globalState, accountId) {
  return {
    ...commonPayload(globalState),
    ablZsa94bVDTb5t4stcHUlS: {
      xhklrw8qahCfarsqrPb: stringValue(accountId),
    },
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

function mapAccount(item) {
  if (!isPlainObject(item)) return null

  const { id, accountNumber, bank, markLoanCard } = item
  if (
    typeof id !== 'string'
    || id.trim().length === 0
    || typeof accountNumber !== 'string'
    || typeof bank !== 'string'
    || bank.trim().length === 0
    || !Number.isInteger(markLoanCard)
  ) {
    return null
  }

  return Object.freeze({
    id,
    bank,
    accountLast4: accountNumber.slice(-4),
    markLoanCard,
  })
}

async function post(client, path, protocolId, data, signal) {
  const response = await client.request({ method: 'POST', path, data, signal, protocolId })
  return isPlainObject(response?.data) ? response.data : null
}

export function createBankDetailServices({ client = networkClient, getGlobalState } = {}) {
  if (typeof getGlobalState !== 'function') throw new TypeError('getGlobalState is required.')

  return Object.freeze({
    async loadBankAccounts({ signal } = {}) {
      const data = await post(
        client,
        BANK_ACCOUNT_LIST_PATH,
        'API-001',
        buildBankAccountListPayload(getGlobalState()),
        signal,
      )
      if (!isPlainObject(data)) return result('invalid_response')

      const envelope = readEnvelope(data)
      if (!envelope.valid) return result('invalid_response')
      if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })

      const sourceList = data?.qrAbsjzu7WLU?.baIJ
      if (!Array.isArray(sourceList)) return result('business_failure', { message: envelope.message })

      const accounts = []
      for (const item of sourceList) {
        const account = mapAccount(item)
        if (!account) return result('invalid_response')
        accounts.push(account)
      }

      return result('success', { accounts: Object.freeze(accounts) })
    },

    async updateLoanCard({ accountId, signal } = {}) {
      if (typeof accountId !== 'string' || accountId.trim().length === 0) {
        return result('invalid_response')
      }

      const data = await post(
        client,
        UPDATE_LOAN_CARD_PATH,
        'API-002',
        buildUpdateLoanCardPayload(getGlobalState(), accountId),
        signal,
      )
      if (!isPlainObject(data)) return result('invalid_response')

      const envelope = readEnvelope(data)
      if (!envelope.valid) return result('invalid_response')
      if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })

      return result('success')
    },
  })
}

export const bankDetailProtocolPaths = Object.freeze({
  BANK_ACCOUNT_LIST_PATH,
  UPDATE_LOAN_CARD_PATH,
})
