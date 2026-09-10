import { networkClient } from '../../../shared/network/index.js'
import { buildContactsPayload } from '../contactForm.js'

const PATH = '/zLz/LOvN/wuz3JwK/OrRv'
const PROTOCOL_ID = 'API-001'

function readString(value) {
  return typeof value === 'string' ? value : ''
}

export function buildSaveContactsPayload(contacts, globalState) {
  const contactPayload = buildContactsPayload(contacts)
  if (!contactPayload) return null

  return {
    cvgH: readString(globalState?.afId),
    rsbhpZ3X: { pwtL: readString(globalState?.gaId) },
    bgU88QMO: { eybE: readString(globalState?.fbId) },
    amHasFw: readString(globalState?.appName),
    mmNUCmQdMioQ2O: { ux9jYLcC8H: readString(globalState?.appVersion) },
    qkNsXozI1oC5g3: { tf69g5Spk5: '2' },
    uxzfxbBMxhB: readString(globalState?.packageName),
    ulG: '',
    vqfH0gehfvNYrW: { rpryc7q8rm: '' },
    yjDnG: readString(globalState?.token),
    jaIvveOulXZV: { lrMwzfSv: contactPayload },
  }
}

function parseResponse(data) {
  const returnCode = data?.cyiUgNvO2EPltj?.atY3WWbXIN
  if (!Number.isInteger(returnCode)) throw new Error('Invalid response.')
  const message = typeof data.pl9xRlV === 'string' ? data.pl9xRlV : ''
  if (returnCode !== 2000 && message.length === 0) throw new Error('Invalid response.')
  return Object.freeze({ returnCode, message })
}

export function createSaveContactsService({ client = networkClient, getGlobalState } = {}) {
  if (typeof getGlobalState !== 'function') throw new TypeError('getGlobalState is required.')

  return Object.freeze({
    async submit(contacts, { signal } = {}) {
      const data = buildSaveContactsPayload(contacts, getGlobalState())
      if (!data) return Object.freeze({ type: 'invalid' })
      const response = await client.request({ method: 'POST', path: PATH, data, signal, protocolId: PROTOCOL_ID })
      const parsed = parseResponse(response?.data)
      return parsed.returnCode === 2000
        ? Object.freeze({ type: 'success' })
        : Object.freeze({ type: 'business_failure', message: parsed.message })
    },
  })
}
