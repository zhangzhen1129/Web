import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bankProtocolPaths,
  buildAddLoanAccountPayload,
  buildBindLoanAccountPayload,
  createBankServices,
} from './bankServices.js'

const globalState = Object.freeze({
  afId: 'af-id',
  gaId: 'ga-id',
  fbId: 'fb-id',
  appName: 'DineroPro',
  appVersion: '1.0.0',
  packageName: 'com.example.app',
  token: 'token-value',
})

function createClient(handler) {
  return {
    async request(config) {
      return { data: handler(config), config }
    },
  }
}

test('uses the confirmed protocol paths and keeps common fields in the JSON body', async () => {
  const requests = []
  const services = createBankServices({
    getGlobalState: () => globalState,
    client: createClient((config) => {
      requests.push(config)
      if (config.protocolId === 'API-001') {
        return { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, pl9xRlV: '', xyF2u5qfFaFq32y6: 'Ana', sbkP9S52kXkdGPj8IPdTRAvy: { dp1JgEgUCwfPEw9A: 'Perez' } }
      }
      if (config.protocolId === 'API-002') {
        return { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, pl9xRlV: '', qrAbsjzu7WLU: { baIJ: [{ id: 'account-1', accountNumber: '12345678901234567890', bank: 'BBVA', type: 1, markLoanCard: 1 }] } }
      }
      if (config.protocolId === 'API-003') {
        return { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, pl9xRlV: '', iuwUlX3FHD: { ca: 'new-account' } }
      }
      return { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, pl9xRlV: '' }
    }),
  })

  const user = await services.getUserInfo()
  assert.deepEqual(user, { type: 'success', recipientName: 'Ana Perez' })
  const accounts = await services.getLoanAccounts()
  assert.equal(accounts.type, 'success')
  const added = await services.addLoanAccount({ accountNumber: '1', bank: 'BBVA', name: 'Ana Perez', bankCode: '1', type: 1 })
  assert.deepEqual(added, { type: 'success', id: 'new-account' })
  const bound = await services.bindLoanAccount({ remittanceAccountId: 'new-account', orderId: 'order-1' })
  assert.equal(bound.type, 'success')

  assert.deepEqual(requests.map((request) => request.path), [
    bankProtocolPaths.USER_INFO_PATH,
    bankProtocolPaths.LOAN_ACCOUNT_LIST_PATH,
    bankProtocolPaths.ADD_LOAN_ACCOUNT_PATH,
    bankProtocolPaths.BIND_LOAN_ACCOUNT_PATH,
  ])
  assert.equal(requests.every((request) => request.method === 'POST'), true)
  assert.equal(requests.every((request) => request.data.yjDnG === 'token-value'), true)
  assert.equal(requests.every((request) => !Object.hasOwn(request, 'params')), true)
})

test('builds protocol payloads without leaking sensitive values into the URL', () => {
  const addPayload = buildAddLoanAccountPayload(globalState, {
    accountNumber: '123',
    bank: 'BBVA',
    name: 'Ana',
    bankCode: '1',
    type: 1,
  })
  const bindPayload = buildBindLoanAccountPayload(globalState, {
    remittanceAccountId: 'account-1',
    orderId: 'order-1',
  })

  assert.equal(addPayload.yswWOVNpOUvMLyfcd.sg4WmVlpmU3Mj, '123')
  assert.equal(addPayload.nhxt, 'BBVA')
  assert.equal(addPayload.tsMaqR4P.jyiU, 'Ana')
  assert.equal(addPayload.nxbfuj19OQsO.jrhBAF7v, '1')
  assert.equal(addPayload.fwFegVUT.ekmA, 1)
  assert.equal(bindPayload.ablZsa94bVDTb5t4stcHUlS.xhklrw8qahCfarsqrPb, 'account-1')
  assert.equal(bindPayload.sf9Qno9CRgP.nqE1SzE, 'order-1')
})

test('keeps recipient name submittable when only one identity name part is returned', async () => {
  const services = createBankServices({
    getGlobalState: () => globalState,
    client: createClient(() => ({
      cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
      pl9xRlV: '',
      xyF2u5qfFaFq32y6: 'Ana',
    })),
  })

  const result = await services.getUserInfo()
  assert.equal(result.type, 'success')
  assert.equal(result.recipientName.trim().length > 0, true)
})
