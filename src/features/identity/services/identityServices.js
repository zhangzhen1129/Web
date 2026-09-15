import { networkClient } from '../../../shared/network/index.js'

const OCR_CHANNEL_PATH = '/mAw/CnF/upHRvlBysw'
const ADVANCE_LIVE_PATH = '/crW/2e5/Vutk9g1g6u'
const SAVE_IDENTITY_PATH = '/bW3/9Jc/dHgLGLd160'
const APP_MODE_PATH = '/iu6/dwciihh/YudVYx8Vci2q'

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

function isSuccessfulStageStatus(value) {
  return value === '1' || value === 1
}

function isValidStagePayload({ mark, cardFrontBase64Src, livingBase64Src, h5LivenessId, identityNo }) {
  const front = stringValue(cardFrontBase64Src)
  const face = stringValue(livingBase64Src)
  const advance = stringValue(h5LivenessId)
  const dni = stringValue(identityNo).trim()
  if (mark === 1) return Boolean(front) && !face && !advance && !dni
  if (mark === 4) return !front && Boolean(face) !== Boolean(advance) && !dni
  if (mark === 5) return !front && !face && !advance && Boolean(dni)
  return false
}

async function post(client, path, protocolId, data, signal) {
  const response = await client.request({ method: 'POST', path, data, signal, protocolId })
  if (!response || typeof response !== 'object' || !response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
    return result('invalid_response')
  }
  return response.data
}

export function buildIdentityPayload(globalState, { mark, cardFrontBase64Src = '', livingBase64Src = '', h5LivenessId = '', identityNo = '' } = {}) {
  return {
    ...commonPayload(globalState),
    grDxc8Q6: { hfoF: mark },
    ghLu3IIENWuJyKLdLt: stringValue(cardFrontBase64Src),
    lcshGedoGetiuvXvd: '',
    lyhG9EryeCfPIPY: stringValue(livingBase64Src),
    ldT3zZrZwdQY: stringValue(h5LivenessId),
    rbT5808gw6: stringValue(identityNo),
  }
}

export function createIdentityServices({ client = networkClient, getGlobalState } = {}) {
  if (typeof getGlobalState !== 'function') throw new TypeError('getGlobalState is required.')

  return Object.freeze({
    async getOcrChannel({ signal } = {}) {
      const data = await post(client, OCR_CHANNEL_PATH, 'API-001', commonPayload(getGlobalState()), signal)
      if (data?.type === 'invalid_response') return data
      const envelope = readEnvelope(data)
      const channel = data?.aewM
      if (!envelope.valid) return result('invalid_response')
      if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })
      if (typeof channel !== 'string') return result('business_failure', { message: envelope.message })
      return result('success', { channel })
    },

    async saveIdentity({ mark, cardFrontBase64Src, livingBase64Src, h5LivenessId, identityNo, signal } = {}) {
      if (!isValidStagePayload({ mark, cardFrontBase64Src, livingBase64Src, h5LivenessId, identityNo })) return result('invalid')
      const data = await post(client, SAVE_IDENTITY_PATH, 'API-003', buildIdentityPayload(getGlobalState(), {
        mark, cardFrontBase64Src, livingBase64Src, h5LivenessId, identityNo,
      }), signal)
      if (data?.type === 'invalid_response') return data
      const envelope = readEnvelope(data)
      if (!envelope.valid) return result('invalid_response')
      if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })
      const frontStatus = data?.yrIRrRGUY8D4Izr8bapaJ9
      const livingStatus = data?.yxObGjQjIhhuvuPtlWZU?.tih694IhWhgg
      const comparisonStatus = data?.umMAyAvEZOFPtRBSHNfTtTNS
      const idNumber = data?.lejY81HicZ4f
      const status = mark === 1 ? frontStatus : mark === 4 ? livingStatus : comparisonStatus
      const normalizedIdNumber = stringValue(idNumber).trim()
      if (!isSuccessfulStageStatus(status) || (mark === 1 && !normalizedIdNumber)) {
        return result('business_failure', { message: envelope.message })
      }
      return result('success', { status, idNumber: normalizedIdNumber })
    },

    async createAdvanceSession({ signal } = {}) {
      const data = await post(client, ADVANCE_LIVE_PATH, 'API-002', commonPayload(getGlobalState()), signal)
      if (data?.type === 'invalid_response') return data
      const envelope = readEnvelope(data)
      const requestHandle = data?.alEnDvrAlGFEpZod6R4?.gcWlQrapUKT
      const url = data?.kdiFjWa
      if (!envelope.valid) return result('invalid_response')
      if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })
      if (typeof requestHandle !== 'string' || typeof url !== 'string' || !requestHandle.trim() || !url.trim()) {
        return result('business_failure', { message: envelope.message })
      }
      return result('success', { requestHandle, url })
    },

    async refreshAppMode({ signal } = {}) {
      const data = await post(client, APP_MODE_PATH, 'API-004', commonPayload(getGlobalState()), signal)
      if (data?.type === 'invalid_response') return data
      const envelope = readEnvelope(data)
      const orderId = data?.kteZ9gY3cBY
      if (!envelope.valid) return result('invalid_response')
      if (envelope.returnCode !== 2000) return result('business_failure', { message: envelope.message })
      if (typeof orderId !== 'string' || !orderId.trim()) return result('business_failure', { message: envelope.message })
      return result('success', { orderId: orderId.trim() })
    },
  })
}

export const identityProtocolPaths = Object.freeze({
  OCR_CHANNEL_PATH,
  ADVANCE_LIVE_PATH,
  SAVE_IDENTITY_PATH,
  APP_MODE_PATH,
})

