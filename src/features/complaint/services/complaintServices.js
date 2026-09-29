import { networkClient } from '../../../shared/network/index.js'

const COMPLAINT_RED_DOT_PATH = '/n5V/78R7/S1221NY09yUP44TB34UNT'
const COMPLAINT_RED_DOT_PROTOCOL_ID = 'complaint-red-dot'
const COMPLAINT_FEEDBACK_PATH = '/ntn/zwjv/wfzjKtqupfmsx0ihswh'
const COMPLAINT_RECORD_PATH = '/veF/RhBg/1LbMax7Kii3zdO2'
const COMPLAINT_FEEDBACK_PROTOCOL_ID = 'API-001'
const COMPLAINT_RECORD_PROTOCOL_ID = 'API-001'
const SUCCESS_CODE = 2000
const COMPLAINT_RECORD_STRING_FIELDS = Object.freeze([
  'id',
  'feedbackMechanism',
  'problemType',
  'problemContent',
  'createTime',
])

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

function isComplaintRecord(value) {
  if (!isRecord(value)) return false
  if (!COMPLAINT_RECORD_STRING_FIELDS.every((field) => typeof value[field] === 'string')) return false
  return value.submitStatus === 0 || value.submitStatus === 1
}

function mapComplaintRecord(value) {
  return Object.freeze({
    id: value.id,
    feedbackMechanism: value.feedbackMechanism,
    problemType: value.problemType,
    problemContent: value.problemContent,
    submitStatus: value.submitStatus,
    createTime: value.createTime,
  })
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

export function buildComplaintFeedbackRequestBody(globalState, {
  agency,
  question,
  details,
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
    tn10zMNurs: { exMykk: stringValue(globalState?.userId) },
    vaGLDIESiMEPCVK0Oyncl: { udxCuzvJ9DvGtMBRF: stringValue(agency) },
    hvwxtAujGLm: stringValue(question),
    hgCYz1AtCaH1Bg: stringValue(details),
  }
}

export function mapComplaintFeedbackResponse(data) {
  if (!isRecord(data) || !isRecord(data.cyiUgNvO2EPltj)) {
    return result('invalid_response')
  }

  const returnCode = data.cyiUgNvO2EPltj.atY3WWbXIN
  if (!Number.isInteger(returnCode)) return result('invalid_response')

  if (returnCode !== SUCCESS_CODE) {
    return result('business_failure', { message: safeMessage(data.pl9xRlV) })
  }

  return result('success')
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

export function mapComplaintRecordsResponse(data) {
  if (!isRecord(data) || !isRecord(data.cyiUgNvO2EPltj)) {
    return result('invalid_response')
  }

  const returnCode = data.cyiUgNvO2EPltj.atY3WWbXIN
  if (!Number.isInteger(returnCode)) return result('invalid_response')

  if (returnCode !== SUCCESS_CODE) {
    return result('business_failure', { message: safeMessage(data.pl9xRlV) })
  }

  if (!isRecord(data.qrAbsjzu7WLU)) return result('invalid_response')

  const records = data.qrAbsjzu7WLU.baIJ
  if (!Array.isArray(records) || !records.every(isComplaintRecord)) {
    return result('invalid_response')
  }

  return result('success', {
    records: records.map(mapComplaintRecord),
  })
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

    async loadComplaintRecords({ signal } = {}) {
      const data = await post(
        client,
        COMPLAINT_RECORD_PATH,
        COMPLAINT_RECORD_PROTOCOL_ID,
        buildComplaintRequestBody(getGlobalState()),
        signal,
      )
      return mapComplaintRecordsResponse(data)
    },

    async saveComplaintFeedback({ agency, question, details, signal } = {}) {
      const data = await post(
        client,
        COMPLAINT_FEEDBACK_PATH,
        COMPLAINT_FEEDBACK_PROTOCOL_ID,
        buildComplaintFeedbackRequestBody(getGlobalState(), {
          agency,
          question,
          details,
        }),
        signal,
      )
      return mapComplaintFeedbackResponse(data)
    },
  })
}

export const complaintProtocolPaths = Object.freeze({
  COMPLAINT_RED_DOT_PATH,
  COMPLAINT_FEEDBACK_PATH,
  COMPLAINT_RECORD_PATH,
})
