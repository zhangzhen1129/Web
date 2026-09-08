import { networkClient } from '../../../shared/network/index.js'
import { getInformationServerValue, isCompleteInformationForm } from '../informationOptions.js'

const PATH = '/p4R/37N6/QJ7RRl2O3/7JaN'
const PROTOCOL_ID = 'API-001'

function readString(value) {
  return typeof value === 'string' ? value : ''
}

export function buildSaveBasicInformationPayload(values, globalState) {
  if (!isCompleteInformationForm(values)) return null

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
    vvN70N4VZ0Byfw: { tsd2qIuQpV: getInformationServerValue('occupation', values.occupation) },
    xrYESw9XYnZxPbwPu: { fssrmjDKsatkj: getInformationServerValue('monthlyIncome', values.monthlyIncome) },
    bnUHWzOpo3m: { hlYv0nS: getInformationServerValue('marital', values.marital) },
    nkZFFWNRStq7o: { crwkcBkwp: getInformationServerValue('education', values.education) },
    crx8gfOaLdBLipg: { cgj72eA9xcn: getInformationServerValue('loanPurpose', values.loanPurpose) },
    lr2bMG68MJtnr: { gptZduxWd: getInformationServerValue('houseType', values.houseType) },
    ifIbDHUcqL4J: { znhvc1tw: '' },
    ruvtFjjfR: '',
  }
}

function parseResponse(data) {
  const returnCode = data?.cyiUgNvO2EPltj?.atY3WWbXIN
  if (!Number.isInteger(returnCode)) return null
  return Object.freeze({ returnCode, message: typeof data.pl9xRlV === 'string' ? data.pl9xRlV : '' })
}

export function createSaveBasicInformationService({ client = networkClient, getGlobalState } = {}) {
  if (typeof getGlobalState !== 'function') throw new TypeError('getGlobalState is required.')

  return Object.freeze({
    async submit(values, { signal } = {}) {
      const data = buildSaveBasicInformationPayload(values, getGlobalState())
      if (!data) return Object.freeze({ type: 'invalid' })
      const response = await client.request({ method: 'POST', path: PATH, data, signal, protocolId: PROTOCOL_ID })
      const parsed = parseResponse(response?.data)
      if (!parsed) return Object.freeze({ type: 'invalid_response' })
      return parsed.returnCode === 2000
        ? Object.freeze({ type: 'success' })
        : Object.freeze({ type: 'business_failure', message: parsed.message })
    },
  })
}
