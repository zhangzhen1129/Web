import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSettingsProfilePayload,
  createSettingsServices,
  mapSettingsProfileResponse,
  settingsProtocolPaths,
} from './settingsServices.js'

const globalState = Object.freeze({
  afId: 'af-fixture',
  gaId: 'ga-fixture',
  fbId: 'fb-fixture',
  appName: 'FixtureApp',
  appVersion: '1.2.3',
  packageName: 'fixture.package',
  token: 'token-fixture',
})

function profileResponse(returnCode = 2000, hasPassword = 0) {
  return {
    cyiUgNvO2EPltj: { atY3WWbXIN: returnCode },
    mgIYwYHHpgHkDfsOas8: { ray1gAyEuzj: hasPassword },
  }
}

test('builds only the documented settings profile request fields', () => {
  assert.deepEqual(buildSettingsProfilePayload(globalState), {
    cvgH: 'af-fixture',
    rsbhpZ3X: { pwtL: 'ga-fixture' },
    bgU88QMO: { eybE: 'fb-fixture' },
    amHasFw: 'FixtureApp',
    mmNUCmQdMioQ2O: { ux9jYLcC8H: '1.2.3' },
    qkNsXozI1oC5g3: { tf69g5Spk5: '2' },
    uxzfxbBMxhB: 'fixture.package',
    ulG: '',
    vqfH0gehfvNYrW: { rpryc7q8rm: '' },
    yjDnG: 'token-fixture',
  })
})

test('maps only the return code and password field', () => {
  assert.deepEqual(mapSettingsProfileResponse(profileResponse(2000, 0)), {
    type: 'success',
    hasPassword: false,
  })
  assert.deepEqual(mapSettingsProfileResponse(profileResponse(2000, 7)), {
    type: 'success',
    hasPassword: true,
  })
  assert.deepEqual(mapSettingsProfileResponse(profileResponse(2001, 0)), {
    type: 'business_failure',
  })
  assert.deepEqual(mapSettingsProfileResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
  }), { type: 'business_failure' })
  assert.deepEqual(mapSettingsProfileResponse(profileResponse(2001, '0')), {
    type: 'business_failure',
  })
  assert.deepEqual(mapSettingsProfileResponse(profileResponse('2000', 0)), {
    type: 'invalid_response',
  })
  assert.deepEqual(mapSettingsProfileResponse(profileResponse(2000, '0')), {
    type: 'invalid_response',
  })
  assert.deepEqual(mapSettingsProfileResponse(null), { type: 'invalid_response' })
})

test('uses the unique path, public client, protocol id, and caller signal', async () => {
  const calls = []
  const client = {
    async request(config) {
      calls.push(config)
      return { data: profileResponse() }
    },
  }
  const services = createSettingsServices({
    client,
    getGlobalState: () => globalState,
  })
  const signal = new AbortController().signal

  const response = await services.loadProfile({ signal })

  assert.deepEqual(response, { type: 'success', hasPassword: false })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].path, settingsProtocolPaths.SETTINGS_PROFILE_PATH)
  assert.equal(calls[0].path, '/eBw/IEsD/ywzs')
  assert.equal(calls[0].protocolId, 'settings-profile')
  assert.equal(calls[0].signal, signal)
  assert.deepEqual(calls[0].data, buildSettingsProfilePayload(globalState))
  assert.equal(Object.hasOwn(calls[0], 'timeoutMs'), false)
  assert.equal(Object.hasOwn(calls[0], 'retry'), false)
})
