import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bankProtocolPaths,
  buildAddLoanAccountPayload,
  buildUserInfoPayload,
} from '../../bank/services/bankServices.js'
import { createAddPaymentMethodServices } from './addPaymentMethodServices.js'

const globalState = Object.freeze({
  afId: 'af-fixture',
  gaId: 'ga-fixture',
  fbId: 'fb-fixture',
  appName: 'FixtureApp',
  appVersion: '1.2.3',
  packageName: 'fixture.package',
  token: 'token-fixture',
})

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

function successResponse(extra = {}) {
  return {
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    ...extra,
  }
}

test('posts API-001 with the reusable payload builder and accepts success without an id', async () => {
  const client = createClient(() => successResponse({
    iuwUlX3FHD: { ca: 12345 },
  }))
  const services = createAddPaymentMethodServices({
    client,
    getGlobalState: () => globalState,
  })
  const signal = new AbortController().signal

  const response = await services.addLoanAccount({
    accountNumber: '0000111122226789',
    bank: 'Fixture Bank',
    name: 'Caller supplied name',
    bankCode: 'BANK-001',
    type: 1,
    signal,
  })

  assert.deepEqual(response, { type: 'success' })
  assert.equal(Object.isFrozen(response), true)
  assert.equal(Object.hasOwn(response, 'id'), false)
  assert.equal(client.calls.length, 1)

  const request = client.calls[0]
  assert.equal(request.method, 'POST')
  assert.equal(request.path, bankProtocolPaths.ADD_LOAN_ACCOUNT_PATH)
  assert.equal(request.path.startsWith('/'), true)
  assert.equal(request.path.includes('://'), false)
  assert.equal(request.protocolId, 'API-001')
  assert.equal(request.signal, signal)
  assert.equal(Object.hasOwn(request, 'params'), false)
  assert.equal(Object.hasOwn(request, 'timeoutMs'), false)
  assert.deepEqual(request.data, buildAddLoanAccountPayload(globalState, {
    accountNumber: '0000111122226789',
    bank: 'Fixture Bank',
    name: 'Caller supplied name',
    bankCode: 'BANK-001',
    type: 1,
  }))
  assert.equal(request.data.yswWOVNpOUvMLyfcd.sg4WmVlpmU3Mj, '0000111122226789')
  assert.equal(request.data.nhxt, 'Fixture Bank')
  assert.equal(request.data.tsMaqR4P.jyiU, 'Caller supplied name')
  assert.equal(request.data.nxbfuj19OQsO.jrhBAF7v, 'BANK-001')
  assert.equal(request.data.fwFegVUT.ekmA, 1)
  assert.equal(request.data.qkNsXozI1oC5g3.tf69g5Spk5, '2')
  assert.equal(request.data.ulG, '')
  assert.equal(request.data.vqfH0gehfvNYrW.rpryc7q8rm, '')
})

test('loads API-002 user information and builds the recipient name without trimming or extra validation', async () => {
  const client = createClient(() => successResponse({
    xyF2u5qfFaFq32y6: ' Ana ',
    sbkP9S52kXkdGPj8IPdTRAvy: { dp1JgEgUCwfPEw9A: ' Perez ' },
  }))
  const services = createAddPaymentMethodServices({
    client,
    getGlobalState: () => globalState,
  })
  const signal = new AbortController().signal

  const response = await services.getUserInfo({ signal })

  assert.deepEqual(response, { type: 'success', recipientName: ' Ana   Perez ' })
  assert.equal(Object.isFrozen(response), true)
  const request = client.calls[0]
  assert.equal(request.method, 'POST')
  assert.equal(request.path, bankProtocolPaths.USER_INFO_PATH)
  assert.equal(request.protocolId, 'API-002')
  assert.equal(request.signal, signal)
  assert.equal(Object.hasOwn(request, 'timeoutMs'), false)
  assert.deepEqual(request.data, buildUserInfoPayload(globalState))
})

test('allows missing or non-string API-002 identity fields and keeps a valid empty name', async (t) => {
  for (const data of [ {}, { xyF2u5qfFaFq32y6: null }, { sbkP9S52kXkdGPj8IPdTRAvy: {} } ]) {
    await t.test(JSON.stringify(data), async () => {
      const client = createClient(() => successResponse(data))
      const services = createAddPaymentMethodServices({ client, getGlobalState: () => globalState })
      assert.deepEqual(await services.getUserInfo(), { type: 'success', recipientName: ' ' })
    })
  }
})

test('returns API-002 business failures for any integer non-2000 code', async () => {
  const client = createClient(() => ({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
    pl9xRlV: 'User information failed',
  }))
  const services = createAddPaymentMethodServices({ client, getGlobalState: () => globalState })

  assert.deepEqual(await services.getUserInfo(), {
    type: 'business_failure',
    message: 'User information failed',
  })
})

test('returns invalid_response for invalid API-002 structures', async (t) => {
  const scenarios = [null, [], 'invalid', {}, { cyiUgNvO2EPltj: { atY3WWbXIN: '2000' } }]
  for (const data of scenarios) {
    await t.test(String(data), async () => {
      const client = createClient(() => data)
      const services = createAddPaymentMethodServices({ client, getGlobalState: () => globalState })
      assert.deepEqual(await services.getUserInfo(), { type: 'invalid_response' })
    })
  }
})
test('returns a frozen business failure only for a valid non-empty text message', async () => {
  const client = createClient(() => ({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
    pl9xRlV: 'Controlled business failure',
  }))
  const services = createAddPaymentMethodServices({
    client,
    getGlobalState: () => globalState,
  })

  const response = await services.addLoanAccount()

  assert.deepEqual(response, {
    type: 'business_failure',
    message: 'Controlled business failure',
  })
  assert.equal(Object.isFrozen(response), true)
})

test('returns invalid_response for empty or non JSON-like response structures', async (t) => {
  const scenarios = [
    { name: 'null response', data: null },
    { name: 'array response', data: [] },
    { name: 'text response', data: 'invalid' },
    { name: 'empty object response', data: {} },
    { name: 'null envelope', data: { cyiUgNvO2EPltj: null, pl9xRlV: '' } },
  ]

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const client = createClient(() => scenario.data)
      const services = createAddPaymentMethodServices({
        client,
        getGlobalState: () => globalState,
      })

      assert.deepEqual(await services.addLoanAccount(), { type: 'invalid_response' })
      assert.equal(client.calls.length, 1)
    })
  }
})

test('returns invalid_response when the return code is not an integer', async (t) => {
  const returnCodes = ['2000', 2000.5, true, null]

  for (const returnCode of returnCodes) {
    await t.test(String(returnCode), async () => {
      const client = createClient(() => ({
        cyiUgNvO2EPltj: { atY3WWbXIN: returnCode },
        pl9xRlV: 'Ignored message',
      }))
      const services = createAddPaymentMethodServices({
        client,
        getGlobalState: () => globalState,
      })

      assert.deepEqual(await services.addLoanAccount(), { type: 'invalid_response' })
    })
  }
})

test('returns invalid_response for business failures without a valid message', async (t) => {
  const messages = ['', '   ', null, 42, { text: 'Invalid message' }]

  for (const message of messages) {
    await t.test(String(message), async () => {
      const client = createClient(() => ({
        cyiUgNvO2EPltj: { atY3WWbXIN: 2002 },
        pl9xRlV: message,
      }))
      const services = createAddPaymentMethodServices({
        client,
        getGlobalState: () => globalState,
      })

      assert.deepEqual(await services.addLoanAccount(), { type: 'invalid_response' })
    })
  }
})

test('requires getGlobalState', () => {
  assert.throws(
    () => createAddPaymentMethodServices({ client: createClient(() => successResponse()) }),
    /getGlobalState is required/,
  )
})