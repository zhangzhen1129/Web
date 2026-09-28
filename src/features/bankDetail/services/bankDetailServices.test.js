import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bankDetailProtocolPaths,
  createBankDetailServices,
} from './bankDetailServices.js'

const globalState = Object.freeze({
  afId: 'af-fixture',
  gaId: 'ga-fixture',
  fbId: 'fb-fixture',
  appName: 'FixtureApp',
  appVersion: '1.2.3',
  packageName: 'fixture.package',
  token: 'token-fixture',
})

const commonPayload = Object.freeze({
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

function successEnvelope(extra = {}) {
  return {
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    ...extra,
  }
}

function accountFixture(overrides = {}) {
  return {
    id: 'account-fixture-1',
    accountNumber: '0000111122226789',
    bank: 'Fixture Bank',
    name: 'Private Name',
    type: 9,
    markLoanCard: 1,
    createTime: '2026-01-01T00:00:00Z',
    updateTime: '2026-01-02T00:00:00Z',
    ...overrides,
  }
}

test('loads API-001, sends the controlled payload, and maps only the four page account fields', async () => {
  const fullAccountNumber = '0000111122226789'
  const client = createClient(() => successEnvelope({
    qrAbsjzu7WLU: {
      baIJ: [
        accountFixture({ accountNumber: fullAccountNumber }),
        accountFixture({
          id: 'account-fixture-2',
          accountNumber: '9999888877774321',
          bank: 'Second Bank',
          markLoanCard: 0,
        }),
        accountFixture({
          id: 'account-fixture-3',
          accountNumber: '21',
          bank: 'Third Bank',
          markLoanCard: 7,
        }),
      ],
    },
  }))
  const services = createBankDetailServices({ client, getGlobalState: () => globalState })
  const signal = new AbortController().signal

  const response = await services.loadBankAccounts({ signal })

  assert.deepEqual(response, {
    type: 'success',
    accounts: [
      { id: 'account-fixture-1', bank: 'Fixture Bank', accountLast4: '6789', markLoanCard: 1 },
      { id: 'account-fixture-2', bank: 'Second Bank', accountLast4: '4321', markLoanCard: 0 },
      { id: 'account-fixture-3', bank: 'Third Bank', accountLast4: '21', markLoanCard: 7 },
    ],
  })
  assert.deepEqual(Object.keys(response.accounts[0]).sort(), [
    'accountLast4',
    'bank',
    'id',
    'markLoanCard',
  ])
  assert.equal(JSON.stringify(response).includes(fullAccountNumber), false)
  assert.equal(client.calls.length, 1)
  assert.equal(client.calls[0].method, 'POST')
  assert.equal(client.calls[0].path, bankDetailProtocolPaths.BANK_ACCOUNT_LIST_PATH)
  assert.equal(bankDetailProtocolPaths.BANK_ACCOUNT_LIST_PATH, '/dGd/mvhzoK5E7v/I9DdKorit9V7tjLiKKznK')
  assert.equal(client.calls[0].protocolId, 'API-001')
  assert.equal(client.calls[0].signal, signal)
  assert.deepEqual(client.calls[0].data, commonPayload)
  assert.equal(Object.hasOwn(client.calls[0], 'params'), false)
  assert.equal(Object.hasOwn(client.calls[0], 'timeoutMs'), false)
  assert.equal(JSON.stringify(client.calls[0]).includes(fullAccountNumber), false)
})

test('classifies API-001 business, envelope, non-JSON, structure, and list-field anomalies', async (t) => {
  const scenarios = [
    {
      name: 'business failure',
      data: {
        cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
        pl9xRlV: 'Controlled business message',
      },
      expected: { type: 'business_failure', message: 'Controlled business message' },
    },
    {
      name: 'string return code',
      data: {
        cyiUgNvO2EPltj: { atY3WWbXIN: '2000' },
        pl9xRlV: '',
      },
      expected: { type: 'invalid_response' },
    },
    {
      name: 'non JSON payload',
      data: '{"cyiUgNvO2EPltj":{"atY3WWbXIN":2000}}',
      expected: { type: 'invalid_response' },
    },
    {
      name: 'missing response structure',
      data: null,
      expected: { type: 'invalid_response' },
    },
    {
      name: 'invalid list container',
      data: {
        ...successEnvelope({ qrAbsjzu7WLU: { baIJ: {} } }),
        pl9xRlV: 'Invalid account list',
      },
      expected: { type: 'business_failure', message: 'Invalid account list' },
    },
    {
      name: 'invalid account field',
      data: successEnvelope({
        qrAbsjzu7WLU: {
          baIJ: [accountFixture({ accountNumber: 123456789 })],
        },
      }),
      expected: { type: 'invalid_response' },
    },
  ]

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const client = createClient(() => scenario.data)
      const services = createBankDetailServices({ client, getGlobalState: () => globalState })
      assert.deepEqual(await services.loadBankAccounts(), scenario.expected)
      assert.equal(client.calls.length, 1)
    })
  }

  const emptyClient = createClient(() => successEnvelope({ qrAbsjzu7WLU: { baIJ: [] } }))
  const emptyServices = createBankDetailServices({ client: emptyClient, getGlobalState: () => globalState })
  assert.deepEqual(await emptyServices.loadBankAccounts(), { type: 'success', accounts: [] })
})

test('updates API-002 with only the selected account id and keeps GPS empty', async () => {
  const client = createClient(() => successEnvelope())
  const services = createBankDetailServices({ client, getGlobalState: () => globalState })
  const signal = new AbortController().signal

  const response = await services.updateLoanCard({ accountId: 'account-selected', signal })

  assert.deepEqual(response, { type: 'success' })
  assert.equal(client.calls.length, 1)
  assert.equal(client.calls[0].method, 'POST')
  assert.equal(client.calls[0].path, bankDetailProtocolPaths.UPDATE_LOAN_CARD_PATH)
  assert.equal(bankDetailProtocolPaths.UPDATE_LOAN_CARD_PATH, '/x3L/USPWW7D1FS/0RRLT1tROQkD5G')
  assert.equal(client.calls[0].protocolId, 'API-002')
  assert.equal(client.calls[0].signal, signal)
  assert.deepEqual(client.calls[0].data, {
    ...commonPayload,
    ablZsa94bVDTb5t4stcHUlS: {
      xhklrw8qahCfarsqrPb: 'account-selected',
    },
  })
  assert.equal(Object.hasOwn(client.calls[0].data, 'orderId'), false)
  assert.equal(client.calls[0].data.sf9Qno9CRgP, undefined)
  assert.equal(client.calls[0].data.ulG, '')
  assert.equal(client.calls[0].data.vqfH0gehfvNYrW.rpryc7q8rm, '')
  assert.equal(Object.hasOwn(client.calls[0], 'params'), false)
  assert.equal(Object.hasOwn(client.calls[0], 'timeoutMs'), false)
  assert.equal(client.calls[0].path.startsWith('/'), true)
  assert.equal(client.calls[0].path.includes('://'), false)
})

test('classifies API-002 business and invalid responses without sending an empty account id', async () => {
  const businessClient = createClient(() => ({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2002 },
    pl9xRlV: 'Controlled update failure',
  }))
  const businessServices = createBankDetailServices({
    client: businessClient,
    getGlobalState: () => globalState,
  })
  assert.deepEqual(await businessServices.updateLoanCard({ accountId: 'account-fixture' }), {
    type: 'business_failure',
    message: 'Controlled update failure',
  })

  const invalidCodeClient = createClient(() => ({
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000.5 },
    pl9xRlV: '',
  }))
  const invalidCodeServices = createBankDetailServices({
    client: invalidCodeClient,
    getGlobalState: () => globalState,
  })
  assert.deepEqual(
    await invalidCodeServices.updateLoanCard({ accountId: 'account-fixture' }),
    { type: 'invalid_response' },
  )

  const malformedClient = createClient(() => [])
  const malformedServices = createBankDetailServices({
    client: malformedClient,
    getGlobalState: () => globalState,
  })
  assert.deepEqual(
    await malformedServices.updateLoanCard({ accountId: 'account-fixture' }),
    { type: 'invalid_response' },
  )

  const emptyClient = createClient(() => successEnvelope())
  const emptyServices = createBankDetailServices({ client: emptyClient, getGlobalState: () => globalState })
  assert.deepEqual(await emptyServices.updateLoanCard({ accountId: '   ' }), { type: 'invalid_response' })
  assert.equal(emptyClient.calls.length, 0)
})

test('requires getGlobalState and keeps the public service object to the controller contract', () => {
  assert.throws(
    () => createBankDetailServices({ client: createClient(() => successEnvelope()) }),
    /getGlobalState is required/,
  )
  const services = createBankDetailServices({
    client: createClient(() => successEnvelope()),
    getGlobalState: () => globalState,
  })
  assert.deepEqual(Object.keys(services).sort(), ['loadBankAccounts', 'updateLoanCard'])
})
