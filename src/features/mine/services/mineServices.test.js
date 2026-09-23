import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMineRequestBody,
  createMineServices,
  mapAccountDeletionResponse,
  mapComplaintRedDotResponse,
  mapMineProfileResponse,
  mineProtocolPaths,
} from './mineServices.js'

function envelope(returnCode = 2000, extra = {}) {
  return {
    cyiUgNvO2EPltj: { atY3WWbXIN: returnCode },
    pl9xRlV: '',
    oi: '',
    ...extra,
  }
}

test('builds only the protocol request fields with an empty GPS payload', () => {
  assert.deepEqual(buildMineRequestBody({
    afId: 'af',
    gaId: 'ga',
    fbId: 'fb',
    appName: 'DineroPro',
    appVersion: '1.2.3',
    packageName: 'com.example.app',
    token: 'token-value',
    gps: 'ignored',
    gpsAddress: 'ignored',
  }), {
    cvgH: 'af',
    rsbhpZ3X: { pwtL: 'ga' },
    bgU88QMO: { eybE: 'fb' },
    amHasFw: 'DineroPro',
    mmNUCmQdMioQ2O: { ux9jYLcC8H: '1.2.3' },
    qkNsXozI1oC5g3: { tf69g5Spk5: '2' },
    uxzfxbBMxhB: 'com.example.app',
    ulG: '',
    vqfH0gehfvNYrW: { rpryc7q8rm: '' },
    yjDnG: 'token-value',
  })
})

test('maps profile success, missing mask, business failure, and invalid code type', () => {
  assert.deepEqual(mapMineProfileResponse(envelope(2000, {
    mwQMMTLZBtRYyQO: '678****989',
  })), { type: 'success', maskedMobile: '678****989' })

  assert.deepEqual(mapMineProfileResponse(envelope(2000, {
    mwQMMTLZBtRYyQO: '',
  })), { type: 'success', maskedMobile: null })

  assert.deepEqual(mapMineProfileResponse(envelope(2001, {
    pl9xRlV: 'Try again',
  })), { type: 'business_failure', message: 'Try again' })

  assert.deepEqual(mapMineProfileResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: '2000' },
  }), { type: 'invalid_response' })
})

test('maps only a strict true red-dot value as visible', () => {
  assert.deepEqual(mapComplaintRedDotResponse(envelope(2000, { aewM: true })), {
    type: 'success',
    showRedDot: true,
  })
  assert.deepEqual(mapComplaintRedDotResponse(envelope(2000, { aewM: 'true' })), {
    type: 'success',
    showRedDot: false,
  })
  assert.deepEqual(mapComplaintRedDotResponse(envelope(2000)), {
    type: 'success',
    showRedDot: false,
  })
})

test('maps account deletion success and failures without exposing the response body', () => {
  assert.deepEqual(mapAccountDeletionResponse(envelope()), { type: 'success' })
  assert.deepEqual(mapAccountDeletionResponse(envelope(2001, { pl9xRlV: 'Denied' })), {
    type: 'business_failure',
    message: 'Denied',
  })
  assert.deepEqual(mapAccountDeletionResponse(envelope(2001, { pl9xRlV: '<unsafe>' })), {
    type: 'business_failure',
    message: null,
  })
  assert.deepEqual(mapAccountDeletionResponse(null), { type: 'invalid_response' })
})

test('services use the documented paths, JSON body, and abort signal', async () => {
  const calls = []
  const client = {
    async request(request) {
      calls.push(request)
      return { data: envelope() }
    },
  }
  const services = createMineServices({
    client,
    getGlobalState: () => ({ token: 'token-value' }),
  })

  await services.loadProfile({ signal: 'profile-signal' })
  await services.loadComplaintRedDot({ signal: 'red-dot-signal' })
  await services.deleteAccount()

  assert.deepEqual(calls.map((call) => [call.method, call.path, call.protocolId, call.signal]), [
    ['POST', mineProtocolPaths.MINE_PROFILE_PATH, 'mine-profile', 'profile-signal'],
    ['POST', mineProtocolPaths.COMPLAINT_RED_DOT_PATH, 'complaint-red-dot', 'red-dot-signal'],
    ['POST', mineProtocolPaths.ACCOUNT_DELETION_PATH, 'account-deletion', undefined],
  ])
  assert.equal(calls[0].data.yjDnG, 'token-value')
})
