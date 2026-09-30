import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CHANGE_PASSWORD_PATH,
  CHANGE_PASSWORD_PROTOCOL_ID,
  buildChangePasswordPayload,
  createChangePasswordServices,
  mapChangePasswordResponse,
} from './changePasswordServices.js'

const globalState = Object.freeze({
  afId: 'af-id',
  gaId: 'ga-id',
  fbId: 'fb-id',
  appName: 'DineroPro',
  appVersion: '1.2.3',
  packageName: 'com.dinero.pro',
  token: 'token-value',
  mobile: '51999999999',
})

const passwords = Object.freeze({
  oldPassword: 'old-pass',
  newPassword: 'new-pass',
  confirmPassword: 'new-pass',
})

function successResponse() {
  return {
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    nl3H3VULXxvbt: { yjDnG: 'new-token' },
    hvdBeTYSwEKmok: { exMykk: 'new-user' },
  }
}

test('uses the confirmed path and protocol id', () => {
  assert.equal(CHANGE_PASSWORD_PATH, '/eRM/YUIT/OSFMH2lEUWYSTH')
  assert.equal(CHANGE_PASSWORD_PROTOCOL_ID, 'change-password')
})

test('builds the documented request fields with digest-only password values', () => {
  const payload = buildChangePasswordPayload(globalState, passwords)

  assert.deepEqual(payload, {
    cvgH: 'af-id',
    rsbhpZ3X: { pwtL: 'ga-id' },
    bgU88QMO: { eybE: 'fb-id' },
    amHasFw: 'DineroPro',
    mmNUCmQdMioQ2O: { ux9jYLcC8H: '1.2.3' },
    qkNsXozI1oC5g3: { tf69g5Spk5: '2' },
    uxzfxbBMxhB: 'com.dinero.pro',
    ulG: '',
    vqfH0gehfvNYrW: { rpryc7q8rm: '' },
    yjDnG: 'token-value',
    ldkraVqq7in: '51999999999',
    srbF8eqimdb: 'a69d4ab8c9a2c32d3732eba8c96a8d30',
    ls4dIM0QWLLktYr: { btaUOt6x2sR: 'e4eb7ce5037ea04fb9748d52ada1c2d5' },
    xvEGCllUDYzTo: 'e4eb7ce5037ea04fb9748d52ada1c2d5',
  })
  assert.equal(JSON.stringify(payload).includes('old-pass'), false)
  assert.equal(JSON.stringify(payload).includes('new-pass'), false)
})

test('sends one POST through the injected client with the caller signal', async () => {
  const calls = []
  const signal = new AbortController().signal
  const services = createChangePasswordServices({
    getGlobalState: () => globalState,
    client: {
      async request(config) {
        calls.push(config)
        return { data: successResponse() }
      },
    },
  })

  const response = await services.updatePassword({ ...passwords, signal })

  assert.deepEqual(response, { type: 'success', token: 'new-token', userId: 'new-user' })
  assert.equal(Object.isFrozen(response), true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    method: 'POST',
    path: CHANGE_PASSWORD_PATH,
    data: buildChangePasswordPayload(globalState, passwords),
    signal,
    protocolId: CHANGE_PASSWORD_PROTOCOL_ID,
  })
})

test('classifies integer non-2000 codes as business failures with safe messages', () => {
  assert.deepEqual(mapChangePasswordResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 4001 },
    pl9xRlV: 'Try again.',
  }), { type: 'business_failure', message: 'Try again.' })
  assert.deepEqual(mapChangePasswordResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 4002 },
    pl9xRlV: '   ',
  }), { type: 'business_failure', message: '' })
  assert.deepEqual(mapChangePasswordResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 4003 },
    pl9xRlV: '<b>unsafe</b>',
  }), { type: 'business_failure', message: '' })
  assert.deepEqual(mapChangePasswordResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 4004 },
  }), { type: 'business_failure', message: '' })
})

test('rejects malformed response envelopes, codes, and success payloads', () => {
  const malformed = [
    null,
    {},
    { cyiUgNvO2EPltj: {} },
    { cyiUgNvO2EPltj: { atY3WWbXIN: '2000' } },
    { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, nl3H3VULXxvbt: { yjDnG: '' }, hvdBeTYSwEKmok: { exMykk: 'new-user' } },
    { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, nl3H3VULXxvbt: { yjDnG: 'new-token' } },
    { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, nl3H3VULXxvbt: { yjDnG: 'new-token' }, hvdBeTYSwEKmok: { exMykk: '   ' } },
  ]

  for (const data of malformed) {
    const response = mapChangePasswordResponse(data)
    assert.deepEqual(response, { type: 'invalid_response' })
    assert.equal(Object.isFrozen(response), true)
  }
})