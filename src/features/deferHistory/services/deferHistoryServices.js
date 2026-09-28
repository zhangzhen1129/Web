import { networkClient } from '../../../shared/network/index.js'
import {
  DEFER_HISTORY_PATH,
  DEFER_HISTORY_PROTOCOL_ID,
  DEFER_HISTORY_RESPONSE_FIELDS,
} from '../deferHistoryConstants.js'

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

function validMessage(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
}

function result(type, extra = {}) {
  return Object.freeze({ type, ...extra })
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

export function buildDeferHistoryPayload(globalState, { orderId } = {}) {
  return {
    ...commonPayload(globalState),
    ca: stringValue(orderId),
  }
}

export function mapDeferHistoryResponse(data) {
  if (!isPlainObject(data)) return result('invalid_response')

  const returnCode = readPath(data, DEFER_HISTORY_RESPONSE_FIELDS.returnCode)
  if (!Number.isInteger(returnCode)) return result('invalid_response')

  if (returnCode !== 2000) {
    const message = validMessage(readPath(data, DEFER_HISTORY_RESPONSE_FIELDS.message))
    return message
      ? result('business_failure', { message })
      : result('business_failure')
  }

  const rawRecords = readPath(data, DEFER_HISTORY_RESPONSE_FIELDS.records)
  if (!Array.isArray(rawRecords)) return result('invalid_response')

  const records = []
  for (const rawRecord of rawRecords) {
    if (!isPlainObject(rawRecord)) return result('invalid_response')

    const { approvalDate, amount, extendedTerm, updatedDueDate } = rawRecord
    if (
      typeof approvalDate !== 'string'
      || typeof amount !== 'number'
      || !Number.isFinite(amount)
      || !Number.isInteger(extendedTerm)
      || typeof updatedDueDate !== 'string'
    ) return result('invalid_response')

    records.push(Object.freeze({
      approvalDate,
      amount,
      extendedTerm,
      updatedDueDate,
    }))
  }

  return result('success', { records: Object.freeze(records) })
}

export function createDeferHistoryServices({ client = networkClient, getGlobalState } = {}) {
  if (typeof getGlobalState !== 'function') throw new TypeError('getGlobalState is required.')

  return Object.freeze({
    async loadDeferHistory({ orderId, signal } = {}) {
      const response = await client.request({
        method: 'POST',
        path: DEFER_HISTORY_PATH,
        protocolId: DEFER_HISTORY_PROTOCOL_ID,
        data: buildDeferHistoryPayload(getGlobalState(), { orderId }),
        signal,
      })
      return mapDeferHistoryResponse(response?.data)
    },
  })
}
