import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSaveBasicInformationPayload,
  createSaveBasicInformationService,
} from './saveBasicInformation.js'

const validValues = Object.freeze({
  marital: 'single', education: 'master', occupation: 'retired', monthlyIncome: 'over_5001', loanPurpose: 'family', houseType: 'rented',
})

const globalState = Object.freeze({
  afId: 'af-id', gaId: 'ga-id', fbId: 'fb-id', appName: 'DineroPro', appVersion: '1.2.3', packageName: 'com.dinero.pro', token: 'token-value',
})

test('builds the documented payload only from stable option keys', () => {
  assert.deepEqual(buildSaveBasicInformationPayload(validValues, globalState), {
    cvgH: 'af-id', rsbhpZ3X: { pwtL: 'ga-id' }, bgU88QMO: { eybE: 'fb-id' }, amHasFw: 'DineroPro',
    mmNUCmQdMioQ2O: { ux9jYLcC8H: '1.2.3' }, qkNsXozI1oC5g3: { tf69g5Spk5: '2' }, uxzfxbBMxhB: 'com.dinero.pro',
    ulG: '', vqfH0gehfvNYrW: { rpryc7q8rm: '' }, yjDnG: 'token-value',
    vvN70N4VZ0Byfw: { tsd2qIuQpV: 'Jubilación' }, xrYESw9XYnZxPbwPu: { fssrmjDKsatkj: 'Más de S/5,001' },
    bnUHWzOpo3m: { hlYv0nS: 'Soltero' }, nkZFFWNRStq7o: { crwkcBkwp: 'Másters' },
    crx8gfOaLdBLipg: { cgj72eA9xcn: 'Función familiar' }, lr2bMG68MJtnr: { gptZduxWd: 'Alquilado' },
    ifIbDHUcqL4J: { znhvc1tw: '' }, ruvtFjjfR: '',
  })
  assert.equal(buildSaveBasicInformationPayload({ ...validValues, marital: 'Soltero' }, globalState), null)
})

test('submits with the API contract and classifies business and invalid responses', async () => {
  const requests = []
  const replies = [
    { data: { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 } } },
    { data: { cyiUgNvO2EPltj: { atY3WWbXIN: 4001 }, pl9xRlV: 'Try again.' } },
    { data: {} },
  ]
  const service = createSaveBasicInformationService({
    getGlobalState: () => globalState,
    client: { request: async (request) => { requests.push(request); return replies.shift() } },
  })

  assert.deepEqual(await service.submit(validValues), { type: 'success' })
  assert.deepEqual(await service.submit(validValues), { type: 'business_failure', message: 'Try again.' })
  assert.deepEqual(await service.submit(validValues), { type: 'invalid_response' })
  assert.deepEqual(await service.submit({ marital: 'single' }), { type: 'invalid' })
  assert.equal(requests.length, 3)
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].path, '/p4R/37N6/QJ7RRl2O3/7JaN')
  assert.equal(requests[0].protocolId, 'API-001')
  assert.deepEqual(requests[0].data, buildSaveBasicInformationPayload(validValues, globalState))
})
