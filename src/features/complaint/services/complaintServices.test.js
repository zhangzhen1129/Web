import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildComplaintRequestBody,
  complaintProtocolPaths,
  createComplaintServices,
  mapComplaintRedDotResponse,
} from './complaintServices.js'

const globalState = Object.freeze({
  afId: 'af-fixture',
  gaId: 'ga-fixture',
  fbId: 'fb-fixture',
  appName: 'FixtureApp',
  appVersion: '1.2.3',
  packageName: 'fixture.package',
  token: 'token-fixture',
})

function response(returnCode = 2000, extra = {}) {
  return {
    cyiUgNvO2EPltj: { atY3WWbXIN: returnCode },
    pl9xRlV: '',
    ...extra,
  }
}

function createClient(handler) {
  const calls = []
  return {
    calls,
    async request(config) {
      calls.push(config)
      const data = handler(config)
      if (data instanceof Error) throw data
      return { data }
    },
  }
}

test('builds the exact protocol body with safe string fallbacks', () => {
  assert.deepEqual(buildComplaintRequestBody({
    ...globalState,
    gps: 'ignored',
    gpsAddress: 'ignored',
  }), {
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

  assert.deepEqual(buildComplaintRequestBody({
    afId: 1,
    gaId: null,
    fbId: {},
    appName: [],
    appVersion: 2,
    packageName: true,
    token: undefined,
  }), {
    cvgH: '',
    rsbhpZ3X: { pwtL: '' },
    bgU88QMO: { eybE: '' },
    amHasFw: '',
    mmNUCmQdMioQ2O: { ux9jYLcC8H: '' },
    qkNsXozI1oC5g3: { tf69g5Spk5: '2' },
    uxzfxbBMxhB: '',
    ulG: '',
    vqfH0gehfvNYrW: { rpryc7q8rm: '' },
    yjDnG: '',
  })
})

test('maps only a strict true red-dot value as visible after code 2000', () => {
  assert.deepEqual(mapComplaintRedDotResponse(response(2000, { aewM: true })), {
    type: 'success',
    showRedDot: true,
  })
})

test('keeps code 2000 successful with hidden red dot for false, missing, or non-boolean values', () => {
  const scenarios = [
    response(2000, { aewM: false }),
    response(2000),
    response(2000, { aewM: 'true' }),
    response(2000, { aewM: 1 }),
  ]

  for (const data of scenarios) {
    assert.deepEqual(mapComplaintRedDotResponse(data), {
      type: 'success',
      showRedDot: false,
    })
  }
})

test('returns business_failure for any integer non-2000 return code', () => {
  assert.deepEqual(mapComplaintRedDotResponse(response(2001, {
    pl9xRlV: 'Controlled failure',
  })), {
    type: 'business_failure',
    message: 'Controlled failure',
  })

  assert.deepEqual(mapComplaintRedDotResponse(response(2001, {
    pl9xRlV: '<unsafe>',
  })), {
    type: 'business_failure',
    message: null,
  })
})

test('returns invalid_response for non-integer codes and malformed envelopes', () => {
  const scenarios = [
    null,
    [],
    'invalid',
    {},
    response('2000'),
    response(2000.5),
    { cyiUgNvO2EPltj: [] },
    { cyiUgNvO2EPltj: { atY3WWbXIN: '2000' } },
  ]

  for (const data of scenarios) {
    assert.deepEqual(mapComplaintRedDotResponse(data), {
      type: 'invalid_response',
    })
  }
})

test('loads the red-dot protocol with the expected request parameters and signal', async () => {
  const client = createClient(() => response(2000, { aewM: true }))
  const services = createComplaintServices({
    client,
    getGlobalState: () => globalState,
  })
  const signal = new AbortController().signal

  const mapped = await services.loadComplaintRedDot({ signal })

  assert.deepEqual(mapped, {
    type: 'success',
    showRedDot: true,
  })
  assert.equal(client.calls.length, 1)

  const request = client.calls[0]
  assert.deepEqual(request, {
    method: 'POST',
    path: complaintProtocolPaths.COMPLAINT_RED_DOT_PATH,
    data: buildComplaintRequestBody(globalState),
    signal,
    protocolId: 'complaint-red-dot',
  })
  assert.equal(request.path, '/n5V/78R7/S1221NY09yUP44TB34UNT')
  assert.equal(request.path.includes('://'), false)
  assert.equal(Object.hasOwn(request, 'timeoutMs'), false)
  assert.equal(Object.hasOwn(request, 'retry'), false)
})

test('propagates HTTP errors without retrying or transforming them', async () => {
  const httpError = new Error('HTTP 500')
  const client = createClient(() => httpError)
  const services = createComplaintServices({
    client,
    getGlobalState: () => globalState,
  })

  await assert.rejects(
    () => services.loadComplaintRedDot({ signal: 'fixture-signal' }),
    (error) => error === httpError,
  )
  assert.equal(client.calls.length, 1)
})

test('requires getGlobalState', () => {
  assert.throws(
    () => createComplaintServices({ client: createClient(() => response()) }),
    /getGlobalState is required/,
  )
})