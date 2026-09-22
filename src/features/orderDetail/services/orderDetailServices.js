import { networkClient } from '../../../shared/network/index.js'
import {
  ORDER_DETAIL_ROOT_STATE,
  isRepaymentRootState,
  mapOrderStatusToRootState,
} from '../orderDetailState.js'

const ORDER_DETAIL_PATH = '/bf3/9hY4c/Y4e03b'
const EXTENSION_HISTORY_PATH = '/nzH/DHSoMCHyM/GsRDNBX1Tw'
const REPAYMENT_LINK_PATH = '/sZK/TORK0WGXV/R1GZC8'

const ORDER_DETAIL_FIELDS = Object.freeze({
  returnCode: ['cyiUgNvO2EPltj', 'atY3WWbXIN'],
  message: ['pl9xRlV'],
  exceptionMessage: ['oi'],
  orderNo: ['lcjueL3yhbe'],
  billId: ['vh9d4uTh7IYo1PT'],
  productId: ['rkXATRSDYCXcHqp4n', 'yu1k7j6TQ'],
  productName: ['chaP665SbRawR1V'],
  companyName: ['gj6xPLZMNKbeNJRny1w', 're9nXllPXk1'],
  orderStatus: ['kxCNx4mRAzCNC7B'],
  loanAmount: ['trNtuIJKIOuEYFINHM'],
  serviceFee: ['belQa34Y5Uf921w2gaf9'],
  receivedAmount: ['nthhYjhBYsstcBbAO2s0', 'xj2JJAdBXJWI'],
  interest: ['jwXcMpXgVgWvuX8V', 'rncMaMb1'],
  penaltyFee: ['vgtkponklDyWnDeBeCtaVOT', 'vstkrDEWtDkBkCz'],
  repaymentAmount: ['ymcCXUcK5CcGWnXRT05G6VnO7W6V'],
  actualRepaymentAmount: ['aqckTmcETvEo8khwXxcO5ydxc'],
  remainingRepaymentAmount: ['stmxkBfxbKbK9i7M3VfBgQxJhRgQTixg', 'byEMAZAZyxw1saEQF5WYG6F5'],
  bankName: ['qyaiSi4sni8lyi3m'],
  bankAccount: ['au0YIYU8dYY1ocxJbH', 'ovuPNFyIYT'],
  applicationDate: ['kwou5JkFthdG9'],
  disbursementDate: ['ft9v1JQIDD2zGgke', 'xeIpvkUg'],
  dueDate: ['msKyvVGCtRvBcCGyPKvLKlzKvoc2a', 'bdis5H7rOsiorA7BmbbA7'],
  repaymentDate: ['lndnUpdHUyFr9nizYAda2zY'],
  arrivalDate: ['nvbvSM9Ddv3i0HWlDZB', 'azjcn4dRag6'],
  lastUpdatedAt: ['xu3O43NO3SxWWSAzex', 'swFVVZp3OZ'],
  extensionFlag: ['fd9J8Q45o69N31YX3'],
  historyCount: ['tkB0vkuQ3u1', 'zwQ'],
  repaymentUrl: ['aewM'],
})

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

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function result(type, extra = {}) {
  return Object.freeze({ type, ...extra })
}

function readEnvelope(data) {
  const returnCode = readPath(data, ORDER_DETAIL_FIELDS.returnCode)
  return {
    valid: Number.isInteger(returnCode),
    returnCode,
    message: stringValue(readPath(data, ORDER_DETAIL_FIELDS.message)),
  }
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

function mapOrderDetailDisplayModel(data, rootState, orderStatus) {
  return Object.freeze({
    orderNo: stringValue(readPath(data, ORDER_DETAIL_FIELDS.orderNo)),
    billId: stringValue(readPath(data, ORDER_DETAIL_FIELDS.billId)),
    productId: stringValue(readPath(data, ORDER_DETAIL_FIELDS.productId)),
    productName: stringValue(readPath(data, ORDER_DETAIL_FIELDS.productName)),
    companyName: stringValue(readPath(data, ORDER_DETAIL_FIELDS.companyName)),
    orderStatus,
    rootState,
    loanAmount: stringValue(readPath(data, ORDER_DETAIL_FIELDS.loanAmount)),
    serviceFee: stringValue(readPath(data, ORDER_DETAIL_FIELDS.serviceFee)),
    receivedAmount: stringValue(readPath(data, ORDER_DETAIL_FIELDS.receivedAmount)),
    interest: stringValue(readPath(data, ORDER_DETAIL_FIELDS.interest)),
    penaltyFee: finiteNumber(readPath(data, ORDER_DETAIL_FIELDS.penaltyFee)),
    repaymentAmount: stringValue(readPath(data, ORDER_DETAIL_FIELDS.repaymentAmount)),
    actualRepaymentAmount: finiteNumber(readPath(data, ORDER_DETAIL_FIELDS.actualRepaymentAmount)),
    remainingRepaymentAmount: finiteNumber(readPath(data, ORDER_DETAIL_FIELDS.remainingRepaymentAmount)),
    bankName: stringValue(readPath(data, ORDER_DETAIL_FIELDS.bankName)),
    bankAccount: stringValue(readPath(data, ORDER_DETAIL_FIELDS.bankAccount)),
    applicationDate: stringValue(readPath(data, ORDER_DETAIL_FIELDS.applicationDate)),
    disbursementDate: stringValue(readPath(data, ORDER_DETAIL_FIELDS.disbursementDate)),
    dueDate: stringValue(readPath(data, ORDER_DETAIL_FIELDS.dueDate)),
    repaymentDate: stringValue(readPath(data, ORDER_DETAIL_FIELDS.repaymentDate)),
    arrivalDate: stringValue(readPath(data, ORDER_DETAIL_FIELDS.arrivalDate)),
    lastUpdatedAt: stringValue(readPath(data, ORDER_DETAIL_FIELDS.lastUpdatedAt)),
    extensionFlag: Number.isInteger(readPath(data, ORDER_DETAIL_FIELDS.extensionFlag))
      ? readPath(data, ORDER_DETAIL_FIELDS.extensionFlag)
      : null,
  })
}

function hasRequiredCommonFields(displayModel) {
  return nonEmptyString(displayModel.orderNo) !== null
    && nonEmptyString(displayModel.loanAmount) !== null
    && nonEmptyString(displayModel.applicationDate) !== null
    && nonEmptyString(displayModel.bankName) !== null
    && nonEmptyString(displayModel.bankAccount) !== null
}

function hasRequiredRepaymentFields(displayModel) {
  return nonEmptyString(displayModel.repaymentAmount) !== null
    && nonEmptyString(displayModel.dueDate) !== null
    && nonEmptyString(displayModel.receivedAmount) !== null
    && nonEmptyString(displayModel.serviceFee) !== null
    && nonEmptyString(displayModel.arrivalDate) !== null
    && finiteNumber(displayModel.penaltyFee) !== null
    && (displayModel.extensionFlag === 0 || displayModel.extensionFlag === 1)
}

function hasRequiredPaymentFields(displayModel) {
  return nonEmptyString(displayModel.billId) !== null
}

export function buildOrderDetailPayload(globalState, { orderId } = {}) {
  return {
    ...commonPayload(globalState),
    sf9Qno9CRgP: {
      nqE1SzE: stringValue(orderId),
    },
  }
}

export function buildExtensionHistoryPayload(globalState, { orderId } = {}) {
  return {
    ...commonPayload(globalState),
    ca: stringValue(orderId),
  }
}

export function buildRepaymentPayload({ billId } = {}) {
  return {
    ca: stringValue(billId),
  }
}

export function mapOrderDetailResponse(data) {
  if (!isPlainObject(data)) return result('invalid_response')

  const envelope = readEnvelope(data)
  if (!envelope.valid) return result('invalid_response')
  if (envelope.returnCode !== 2000) {
    return result('business_failure', { message: envelope.message })
  }

  const orderStatus = readPath(data, ORDER_DETAIL_FIELDS.orderStatus)
  const rootState = mapOrderStatusToRootState(orderStatus)
  if (!rootState) return result('invalid_response')

  const displayModel = mapOrderDetailDisplayModel(data, rootState, orderStatus)
  if (!hasRequiredCommonFields(displayModel)) return result('invalid_response')
  if (isRepaymentRootState(rootState) && !hasRequiredRepaymentFields(displayModel)) {
    return result('invalid_response')
  }
  if (
    (rootState === ORDER_DETAIL_ROOT_STATE.REPAYING || rootState === ORDER_DETAIL_ROOT_STATE.OVERDUE)
    && !hasRequiredPaymentFields(displayModel)
  ) {
    return result('invalid_response')
  }

  return result('success', { rootState, displayModel })
}

export function mapExtensionHistoryResponse(data) {
  if (!isPlainObject(data)) return result('invalid_response')
  const envelope = readEnvelope(data)
  if (!envelope.valid) return result('invalid_response')
  if (envelope.returnCode !== 2000) {
    return result('business_failure', { message: envelope.message })
  }

  const historyCount = readPath(data, ORDER_DETAIL_FIELDS.historyCount)
  if (!Number.isInteger(historyCount) || historyCount < 0) {
    return result('business_failure', { message: envelope.message })
  }
  return result('success', { historyCount })
}

export function mapRepaymentResponse(data) {
  if (!isPlainObject(data)) return result('invalid_response')
  const envelope = readEnvelope(data)
  if (!envelope.valid) return result('invalid_response')
  if (envelope.returnCode !== 2000) {
    return result('business_failure', { message: envelope.message })
  }

  const repaymentUrl = readPath(data, ORDER_DETAIL_FIELDS.repaymentUrl)
  if (nonEmptyString(repaymentUrl) === null) {
    return result('business_failure', { message: envelope.message })
  }
  return result('success', { repaymentUrl })
}

async function post(client, path, protocolId, data, signal) {
  const response = await client.request({ method: 'POST', path, protocolId, data, signal })
  return response?.data
}

export function createOrderDetailServices({ client = networkClient, getGlobalState } = {}) {
  if (typeof getGlobalState !== 'function') throw new TypeError('getGlobalState is required.')

  return Object.freeze({
    async loadOrderDetail({ orderId, signal } = {}) {
      const data = await post(
        client,
        ORDER_DETAIL_PATH,
        'API-001',
        buildOrderDetailPayload(getGlobalState(), { orderId }),
        signal,
      )
      return mapOrderDetailResponse(data)
    },

    async loadExtensionHistory({ orderId, signal } = {}) {
      const data = await post(
        client,
        EXTENSION_HISTORY_PATH,
        'API-002',
        buildExtensionHistoryPayload(getGlobalState(), { orderId }),
        signal,
      )
      return mapExtensionHistoryResponse(data)
    },

    async requestRepayment({ billId, signal } = {}) {
      const data = await post(
        client,
        REPAYMENT_LINK_PATH,
        'API-003',
        buildRepaymentPayload({ billId }),
        signal,
      )
      return mapRepaymentResponse(data)
    },
  })
}

export const orderDetailProtocolPaths = Object.freeze({
  ORDER_DETAIL_PATH,
  EXTENSION_HISTORY_PATH,
  REPAYMENT_LINK_PATH,
})
