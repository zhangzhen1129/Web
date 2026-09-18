import assert from 'node:assert/strict'
import test from 'node:test'
import { createLoanSuccessServices, loanSuccessProtocolPaths } from './loanSuccessServices.js'

function createClient(responses) {
  const calls = []
  return {
    calls,
    async request(config) {
      calls.push(config)
      const response = responses[config.protocolId]
      if (response instanceof Error) throw response
      return { data: response }
    },
  }
}

const globalState = Object.freeze({
  afId: 'af',
  gaId: 'ga',
  fbId: 'fb',
  appName: 'DineroPro',
  appVersion: '1.0',
  packageName: 'com.example',
  token: 'token',
})

test('uses original product fields and rejects duplicate or invalid products', async () => {
  const client = createClient({
    'API-001': {
      returnCode: 2000,
      message: '',
      data: {
        list: [
          {
            id: 'p1',
            productName: 'Product One',
            minAmount: '1500.00',
            icon: 'https://cdn.example.com/p1.png',
          },
        ],
      },
    },
  })
  const services = createLoanSuccessServices({ client, getGlobalState: () => globalState })
  const result = await services.loadRecommendedProducts({ signal: 'signal' })
  assert.equal(result.type, 'success')
  assert.equal(result.products[0].minAmount, '1500.00')
  assert.equal(client.calls[0].path, loanSuccessProtocolPaths.PRODUCT_PATH)
  assert.equal(client.calls[0].protocolId, 'API-001')
  assert.equal(client.calls[0].data.mobileType, '2')
  assert.equal(client.calls[0].data.gps, '')
  assert.equal(client.calls[0].signal, 'signal')

  const duplicate = createLoanSuccessServices({
    client: createClient({
      'API-001': {
        returnCode: 2000,
        data: {
          list: [
            { id: 'p1', productName: 'One', minAmount: '1', icon: 'https://cdn.example.com/1.png' },
            { id: 'p1', productName: 'Two', minAmount: '2', icon: 'https://cdn.example.com/2.png' },
          ],
        },
      },
    }),
    getGlobalState: () => globalState,
  })
  assert.equal((await duplicate.loadRecommendedProducts()).type, 'invalid_response')
})

test('builds pre-application and application payloads with the returned order IDs', async () => {
  const client = createClient({
    'API-002': { returnCode: 2000, data: { orderIdList: ['o1', 'o2'] } },
    'API-003': { returnCode: 2000, data: ['o1', 'o2'] },
  })
  const services = createLoanSuccessServices({ client, getGlobalState: () => globalState })
  const pre = await services.preApply({ productIds: ['p1', 'p2'] })
  assert.deepEqual(pre.orderIds, ['o1', 'o2'])
  const applied = await services.apply({ orderIds: pre.orderIds })
  assert.equal(applied.type, 'success')
  assert.deepEqual(client.calls[0].data.productList, ['p1', 'p2'])
  assert.deepEqual(client.calls[1].data.orderIdList, ['o1', 'o2'])
})

test('maps order list fields and keeps invalid optional display values empty', async () => {
  const client = createClient({
    'API-004': {
      returnCode: 2000,
      data: {
        list: [
          {
            productIconImageUrl: 'http://unsafe.example.com/icon.png',
            orderNo: 'order-1',
            productName: 'Product',
            approvalAmount: '1500',
            orderStatusStr: 'Evaluando',
          },
        ],
      },
    },
  })
  const services = createLoanSuccessServices({ client, getGlobalState: () => globalState })
  const result = await services.loadOrders({ startApplyTime: '123' })
  assert.equal(result.type, 'success')
  assert.equal(result.orders[0].orderId, 'order-1')
  assert.equal(result.orders[0].productIcon, '')
  assert.equal(client.calls[0].data.startApplyTime, '123')
})

test('validates review prompt and review save response structures', async () => {
  const client = createClient({
    'API-005': { returnCode: 2000, data: true },
    'API-006': { returnCode: 2000, data: {} },
  })
  const services = createLoanSuccessServices({ client, getGlobalState: () => globalState })
  assert.deepEqual(await services.getReviewPromptEnabled(), { type: 'success', enabled: true })
  assert.equal((await services.saveReview({ grade: 5, content: 'ok' })).type, 'success')
})
