import { networkClient } from '../../../shared/network/index.js'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { createHomeRequestBody } from '../providers/homeDataProvider.js'

const PRE_APPLICATION_PATH = '/nYL/R0GNU/PNUPHsX1K/S0HdSYO7'
const APPLICATION_PATH = '/iyA/GAvnJ/EnJpw2MBz/syHuQ'
const SUCCESS_CODE = 2000

function validStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.length > 0)
}

function businessCode(response) {
  const code = response?.data?.cyiUgNvO2EPltj?.atY3WWbXIN
  return Number.isInteger(code) ? code : null
}

function failure(code) {
  return Object.freeze({ status: 'failed', code })
}

export function createMultiPushApplicationService(options = {}) {
  const client = options.client ?? networkClient
  const store = options.store ?? (() => {
    try { return useGlobalStore() } catch { return null }
  })()

  async function preApply({ productIds, signal } = {}) {
    if (!validStringArray(productIds)) return failure('PRE_APPLICATION_INPUT_INVALID')
    try {
      const response = await client.request({
        method: 'POST',
        path: PRE_APPLICATION_PATH,
        data: { ...createHomeRequestBody(store), npwxCwB9qMB: [...productIds] },
        signal,
        protocolId: 'multi-push-pre-application',
      })
      if (businessCode(response) !== SUCCESS_CODE) return failure('PRE_APPLICATION_BUSINESS_FAILED')
      const orderIds = response?.data?.ik803hS46CSFXi8
      if (!validStringArray(orderIds)) return failure('PRE_APPLICATION_ORDER_IDS_INVALID')
      return Object.freeze({ status: 'success', orderIds: Object.freeze([...orderIds]) })
    } catch (error) {
      return error?.category === 'canceled' || signal?.aborted
        ? Object.freeze({ status: 'canceled' })
        : failure('PRE_APPLICATION_REQUEST_FAILED')
    }
  }

  async function apply({ orderIds, signal } = {}) {
    if (!validStringArray(orderIds)) return failure('APPLICATION_INPUT_INVALID')
    try {
      const response = await client.request({
        method: 'POST',
        path: APPLICATION_PATH,
        data: { ...createHomeRequestBody(store), iiFpTXF0KDV: [...orderIds] },
        signal,
        protocolId: 'multi-push-application',
      })
      if (businessCode(response) !== SUCCESS_CODE) return failure('APPLICATION_BUSINESS_FAILED')
      const appliedOrderIds = response?.data?.aewM
      if (!validStringArray(appliedOrderIds)) return failure('APPLICATION_ORDER_IDS_INVALID')
      return Object.freeze({ status: 'success' })
    } catch (error) {
      return error?.category === 'canceled' || signal?.aborted
        ? Object.freeze({ status: 'canceled' })
        : failure('APPLICATION_REQUEST_FAILED')
    }
  }

  return Object.freeze({ preApply, apply })
}
