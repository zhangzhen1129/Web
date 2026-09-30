import { networkClient } from '../../../shared/network/index.js'

export const SETTINGS_PROFILE_PATH = '/eBw/IEsD/ywzs'
export const SETTINGS_PROFILE_PROTOCOL_ID = 'settings-profile'

const SUCCESS_CODE = 2000

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value) {
  return typeof value === 'string' ? value : ''
}

function result(type, extra) {
  return Object.freeze(extra === undefined ? { type } : { type, ...extra })
}

export function buildSettingsProfilePayload(globalState) {
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

export function mapSettingsProfileResponse(data) {
  if (!isRecord(data)) return result('invalid_response')

  const returnCode = data.cyiUgNvO2EPltj?.atY3WWbXIN
  if (!Number.isInteger(returnCode)) return result('invalid_response')
  if (returnCode !== SUCCESS_CODE) return result('business_failure')

  const hasPasswordValue = data.mgIYwYHHpgHkDfsOas8?.ray1gAyEuzj
  if (!Number.isInteger(hasPasswordValue)) return result('invalid_response')

  return result('success', {
    hasPassword: hasPasswordValue !== 0,
  })
}

async function postSettingsProfile(client, data, signal) {
  const response = await client.request({
    method: 'POST',
    path: SETTINGS_PROFILE_PATH,
    data,
    signal,
    protocolId: SETTINGS_PROFILE_PROTOCOL_ID,
  })
  return response?.data
}

export function createSettingsServices({ client = networkClient, getGlobalState } = {}) {
  if (typeof getGlobalState !== 'function') throw new TypeError('getGlobalState is required.')

  return Object.freeze({
    async loadProfile({ signal } = {}) {
      const data = await postSettingsProfile(
        client,
        buildSettingsProfilePayload(getGlobalState()),
        signal,
      )
      return mapSettingsProfileResponse(data)
    },
  })
}

export const settingsProtocolPaths = Object.freeze({
  SETTINGS_PROFILE_PATH,
})
