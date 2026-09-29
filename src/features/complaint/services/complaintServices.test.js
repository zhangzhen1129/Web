import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildComplaintFeedbackRequestBody,
  buildComplaintRequestBody,
  complaintProtocolPaths,
  createComplaintServices,
  mapComplaintFeedbackResponse,
  mapComplaintRecordsResponse,
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
test('builds the exact complaint feedback body without image fields', () => {
  assert.deepEqual(buildComplaintFeedbackRequestBody({
    ...globalState,
    userId: 'user-fixture',
  }, {
    agency: 'RBI',
    question: 'Recordatorio de problemas de pago',
    details: 'Controlled details',
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
    tn10zMNurs: { exMykk: 'user-fixture' },
    vaGLDIESiMEPCVK0Oyncl: { udxCuzvJ9DvGtMBRF: 'RBI' },
    hvwxtAujGLm: 'Recordatorio de problemas de pago',
    hgCYz1AtCaH1Bg: 'Controlled details',
  })
})

test('maps complaint feedback success strictly by integer return code 2000 without extra data gates', () => {
  for (const data of [response(2000), response(2000, { data: {}, ignored: 'allowed' })]) {
    assert.deepEqual(mapComplaintFeedbackResponse(data), { type: 'success' })
  }
})

test('maps complaint feedback business failures and invalid structures', () => {
  assert.deepEqual(mapComplaintFeedbackResponse(response(2001, {
    pl9xRlV: 'Controlled failure',
  })), {
    type: 'business_failure',
    message: 'Controlled failure',
  })
  for (const message of ['', '   ', null, 42, '<unsafe>']) {
    assert.deepEqual(mapComplaintFeedbackResponse(response(2001, { pl9xRlV: message })), {
      type: 'business_failure',
      message: null,
    })
  }

  for (const data of [null, [], {}, response('2000'), response(2000.5)]) {
    assert.deepEqual(mapComplaintFeedbackResponse(data), { type: 'invalid_response' })
  }
})

test('saves complaint feedback once through the public client and omits timeout overrides', async () => {
  const client = createClient(() => response(2000))
  const services = createComplaintServices({
    client,
    getGlobalState: () => ({ ...globalState, userId: 'user-fixture' }),
  })
  const signal = new AbortController().signal

  const mapped = await services.saveComplaintFeedback({
    agency: 'RBI',
    question: 'Recordatorio de problemas de pago',
    details: 'Controlled details',
    signal,
  })

  assert.deepEqual(mapped, { type: 'success' })
  assert.equal(client.calls.length, 1)
  const request = client.calls[0]
  assert.deepEqual(request, {
    method: 'POST',
    path: complaintProtocolPaths.COMPLAINT_FEEDBACK_PATH,
    data: buildComplaintFeedbackRequestBody({
      ...globalState,
      userId: 'user-fixture',
    }, {
      agency: 'RBI',
      question: 'Recordatorio de problemas de pago',
      details: 'Controlled details',
    }),
    signal,
    protocolId: 'API-001',
  })
  assert.equal(request.path, '/ntn/zwjv/wfzjKtqupfmsx0ihswh')
  assert.equal(request.path.includes('://'), false)
  assert.equal(Object.hasOwn(request.data, 'bebcdw6U0YpUcYdbGbWKFoD'), false)
  assert.equal(Object.hasOwn(request.data, 'ibcDnsMBaveUaHeIrbrr'), false)
  assert.equal(Object.hasOwn(request.data, 'wnXdSy1WV0kW708dBdRMAqy'), false)
  assert.equal(Object.hasOwn(request, 'timeoutMs'), false)
  assert.equal(Object.hasOwn(request, 'retry'), false)
})

test('falls back safely for missing or non-string feedback request fields', () => {
  assert.deepEqual(buildComplaintFeedbackRequestBody({
    afId: 1,
    gaId: null,
    fbId: {},
    appName: [],
    appVersion: 2,
    packageName: true,
    token: undefined,
    userId: false,
  }, {
    agency: 1,
    question: {},
    details: null,
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
    tn10zMNurs: { exMykk: '' },
    vaGLDIESiMEPCVK0Oyncl: { udxCuzvJ9DvGtMBRF: '' },
    hvwxtAujGLm: '',
    hgCYz1AtCaH1Bg: '',
  })
})

test('propagates feedback transport errors without retry or conversion', async () => {
  const httpError = new Error('HTTP 500')
  const client = createClient(() => httpError)
  const services = createComplaintServices({
    client,
    getGlobalState: () => globalState,
  })

  await assert.rejects(
    () => services.saveComplaintFeedback({
      agency: 'RBI',
      question: 'Recordatorio de problemas de pago',
      details: 'Controlled details',
      signal: 'fixture-signal',
    }),
    (error) => error === httpError,
  )
  assert.equal(client.calls.length, 1)
})


function recordsResponse(records) {
  return {
    vaOsuw7s: 0,
    bgCAmh0f: { dlWr: 0 },
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    oi: '',
    qrAbsjzu7WLU: { baIJ: records },
  }
}

function record(index, submitStatus) {
  return {
    id: `id-${index}`,
    feedbackMechanism: 'RBI',
    problemType: 'Recordatorio de problemas de pago',
    problemContent: `Controlled details ${index}`,
    submitStatus,
    firstImageBase64Src: 'ignored-image-1',
    secondImageBase64Src: 'ignored-image-2',
    thirdImageBase64Src: 'ignored-image-3',
    createTime: '2025-11-20',
  }
}

test('maps strict complaint records in source order and ignores image fields', () => {
  const mapped = mapComplaintRecordsResponse(recordsResponse([
    record(1, 0),
    { ...record(2, 1), firstImageBase64Src: '' },
  ]))

  assert.deepEqual(mapped, {
    type: 'success',
    records: [
      {
        id: 'id-1',
        feedbackMechanism: 'RBI',
        problemType: 'Recordatorio de problemas de pago',
        problemContent: 'Controlled details 1',
        submitStatus: 0,
        createTime: '2025-11-20',
      },
      {
        id: 'id-2',
        feedbackMechanism: 'RBI',
        problemType: 'Recordatorio de problemas de pago',
        problemContent: 'Controlled details 2',
        submitStatus: 1,
        createTime: '2025-11-20',
      },
    ],
  })
})

test('keeps a strict success with an empty complaint record list as an empty result', () => {
  assert.deepEqual(mapComplaintRecordsResponse(recordsResponse([])), {
    type: 'success',
    records: [],
  })
})

test('maps a business failure without a business payload before validating success data', () => {
  assert.deepEqual(mapComplaintRecordsResponse({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
    pl9xRlV: 'Controlled failure',
  }), {
    type: 'business_failure',
    message: 'Controlled failure',
  })
})

test('maps complaint record business failures without converting code types', () => {
  assert.deepEqual(mapComplaintRecordsResponse({
    ...recordsResponse([]),
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
    pl9xRlV: 'Controlled failure',
  }), {
    type: 'business_failure',
    message: 'Controlled failure',
  })

  for (const code of ['2000', 2000.5, null]) {
    assert.deepEqual(mapComplaintRecordsResponse({
      ...recordsResponse([]),
      cyiUgNvO2EPltj: { atY3WWbXIN: code },
    }), { type: 'invalid_response' })
  }
})

test('rejects missing lists and invalid consumed record fields as invalid responses', () => {
  const invalidRecords = [
    null,
    { ...record(1, 0), id: 1 },
    { ...record(1, 0), feedbackMechanism: null },
    { ...record(1, 0), problemType: 1 },
    { ...record(1, 0), problemContent: null },
    { ...record(1, 0), createTime: 1 },
    { ...record(1, 2) },
    { ...record(1, '0') },
    { ...record(1, 0), submitStatus: undefined },
  ]

  for (const item of invalidRecords) {
    assert.deepEqual(mapComplaintRecordsResponse(recordsResponse([item])), {
      type: 'invalid_response',
    })
  }

  assert.deepEqual(mapComplaintRecordsResponse({
    ...recordsResponse([]),
    qrAbsjzu7WLU: {},
  }), { type: 'invalid_response' })
})

test('loads complaint records once through the public client without timeout overrides', async () => {
  const client = createClient(() => recordsResponse([record(1, 0)]))
  const services = createComplaintServices({
    client,
    getGlobalState: () => globalState,
  })
  const signal = new AbortController().signal

  const mapped = await services.loadComplaintRecords({ signal })

  assert.equal(mapped.type, 'success')
  assert.equal(mapped.records.length, 1)
  assert.equal(client.calls.length, 1)
  assert.deepEqual(client.calls[0], {
    method: 'POST',
    path: complaintProtocolPaths.COMPLAINT_RECORD_PATH,
    data: buildComplaintRequestBody(globalState),
    signal,
    protocolId: 'API-001',
  })
  assert.equal(client.calls[0].path.includes('://'), false)
  assert.equal(Object.hasOwn(client.calls[0], 'timeoutMs'), false)
  assert.equal(Object.hasOwn(client.calls[0], 'retry'), false)
})

test('propagates complaint record transport errors without retry or conversion', async () => {
  const transportError = new Error('Network unavailable')
  const client = createClient(() => transportError)
  const services = createComplaintServices({
    client,
    getGlobalState: () => globalState,
  })

  await assert.rejects(
    () => services.loadComplaintRecords({ signal: 'fixture-signal' }),
    (error) => error === transportError,
  )
  assert.equal(client.calls.length, 1)
})
