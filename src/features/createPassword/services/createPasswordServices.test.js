import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CREATE_PASSWORD_PATH,
  CREATE_PASSWORD_PROTOCOL_ID,
  buildCreatePasswordPayload,
  createCreatePasswordServices,
  mapCreatePasswordResponse,
} from './createPasswordServices.js'

const globalState = Object.freeze({
  afId: 'af-id',
  gaId: 'ga-id',
  fbId: 'fb-id',
  appName: 'DineroPro',
  appVersion: '1.2.3',
  packageName: 'com.dinero.pro',
  token: 'token-value',
  mobile: 'redacted-mobile',
})

const passwords = Object.freeze({
  newPassword: 'new-pass',
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
  assert.equal(CREATE_PASSWORD_PATH, '/jJt/FMpL/wCylNpdlMDQzLo')
  assert.equal(CREATE_PASSWORD_PROTOCOL_ID, 'create-password')
})

test('builds the documented request fields with a digest-only new password', () => {
  const payload = buildCreatePasswordPayload(globalState, passwords)

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
    ja8CcnG5k3: { pgIcMX: 'e4eb7ce5037ea04fb9748d52ada1c2d5' },
  })
  assert.equal(JSON.stringify(payload).includes('new-pass'), false)
  assert.equal(Object.hasOwn(payload, 'ldkraVqq7in'), false)
  assert.equal(Object.hasOwn(payload, 'srbF8eqimdb'), false)
  assert.equal(Object.hasOwn(payload, 'xvEGCllUDYzTo'), false)
})

test('sends one POST through the injected client with the caller signal', async () => {
  const calls = []
  const signal = new AbortController().signal
  const services = createCreatePasswordServices({
    getGlobalState: () => globalState,
    client: {
      async request(config) {
        calls.push(config)
        return { data: successResponse() }
      },
    },
  })

  const response = await services.createPassword({ ...passwords, signal })

  assert.deepEqual(response, { type: 'success', token: 'new-token', userId: 'new-user' })
  assert.equal(Object.isFrozen(response), true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    method: 'POST',
    path: CREATE_PASSWORD_PATH,
    data: buildCreatePasswordPayload(globalState, passwords),
    signal,
    protocolId: CREATE_PASSWORD_PROTOCOL_ID,
  })
})

test('classifies integer non-2000 codes as business failures with safe messages', () => {
  assert.deepEqual(mapCreatePasswordResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 4001 },
    pl9xRlV: 'Try again.',
  }), { type: 'business_failure', message: 'Try again.' })
  assert.deepEqual(mapCreatePasswordResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 4002 },
    pl9xRlV: '   ',
  }), { type: 'business_failure', message: '' })
  assert.deepEqual(mapCreatePasswordResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 4003 },
    pl9xRlV: '<b>unsafe</b>',
  }), { type: 'business_failure', message: '' })
  assert.deepEqual(mapCreatePasswordResponse({
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
    const response = mapCreatePasswordResponse(data)
    assert.deepEqual(response, { type: 'invalid_response' })
    assert.equal(Object.isFrozen(response), true)
  }
})
