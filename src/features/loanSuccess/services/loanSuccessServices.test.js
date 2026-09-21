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
      cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
      pl9xRlV: '',
      qrAbsjzu7WLU: {
        baIJ: [
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
  assert.equal(loanSuccessProtocolPaths.PRODUCT_PATH, '/pQj/qSpEvDu/nBtLWFdPnNfOegjTu')
  assert.equal(client.calls[0].protocolId, 'API-001')
  assert.equal(client.calls[0].data.cvgH, 'af')
  assert.equal(client.calls[0].data.rsbhpZ3X.pwtL, 'ga')
  assert.equal(client.calls[0].data.bgU88QMO.eybE, 'fb')
  assert.equal(client.calls[0].data.amHasFw, 'DineroPro')
  assert.equal(client.calls[0].data.mmNUCmQdMioQ2O.ux9jYLcC8H, '1.0')
  assert.equal(client.calls[0].data.qkNsXozI1oC5g3.tf69g5Spk5, '2')
  assert.equal(client.calls[0].data.uxzfxbBMxhB, 'com.example')
  assert.equal(client.calls[0].data.ulG, '')
  assert.equal(client.calls[0].data.vqfH0gehfvNYrW.rpryc7q8rm, '')
  assert.equal(client.calls[0].data.yjDnG, 'token')
  assert.equal(client.calls[0].data.afId, undefined)
  assert.equal(client.calls[0].signal, 'signal')

  const duplicate = createLoanSuccessServices({
    client: createClient({
      'API-001': {
        cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
        qrAbsjzu7WLU: {
          baIJ: [
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

test('builds pre-application and application payloads with the returned order IDs from successList', async () => {
  const client = createClient({
    'API-002': {
      cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
      pl9xRlV: '',
      ik803hS46CSFXi8: ['o1', 'o2'],
    },
    'API-003': {
      cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
      pl9xRlV: '',
      aewM: { successList: ['o1', 'o2'] },
    },
  })
  const services = createLoanSuccessServices({ client, getGlobalState: () => globalState })
  const pre = await services.preApply({ productIds: ['p1', 'p2'] })
  assert.deepEqual(pre.orderIds, ['o1', 'o2'])
  const applied = await services.apply({ orderIds: pre.orderIds })
  assert.equal(applied.type, 'success')
  assert.equal(client.calls[0].path, loanSuccessProtocolPaths.PRE_APPLICATION_PATH)
  assert.equal(loanSuccessProtocolPaths.PRE_APPLICATION_PATH, '/yra/gt5gj/jg4qeo6p5S6t8gLwkj/rjgwrhnq')
  assert.deepEqual(client.calls[0].data.npwxCwB9qMB, ['p1', 'p2'])
  assert.equal(client.calls[0].data.productList, undefined)
  assert.equal(client.calls[1].path, loanSuccessProtocolPaths.APPLICATION_PATH)
  assert.equal(loanSuccessProtocolPaths.APPLICATION_PATH, '/iyA/GAvnJ/EnJpw2MBz/syHuQ')
  assert.deepEqual(client.calls[1].data.iiFpTXF0KDV, ['o1', 'o2'])
  assert.equal(client.calls[1].data.orderIdList, undefined)
  assert.equal(client.calls[1].data.cvgH, 'af')
  assert.equal(client.calls[1].data.yjDnG, 'token')
})

test('maps order list fields and keeps invalid optional display values empty', async () => {
  const client = createClient({
    'API-004': {
      cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
      pl9xRlV: '',
      qrAbsjzu7WLU: {
        baIJ: [
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
  assert.equal(client.calls[0].data.cvgH, 'af')
  assert.equal(client.calls[0].data.rsbhpZ3X.pwtL, 'ga')
  assert.equal(client.calls[0].data.bgU88QMO.eybE, 'fb')
  assert.equal(client.calls[0].data.amHasFw, 'DineroPro')
  assert.equal(client.calls[0].data.mmNUCmQdMioQ2O.ux9jYLcC8H, '1.0')
  assert.equal(client.calls[0].data.qkNsXozI1oC5g3.tf69g5Spk5, '2')
  assert.equal(client.calls[0].data.uxzfxbBMxhB, 'com.example')
  assert.equal(client.calls[0].data.ulG, '')
  assert.equal(client.calls[0].data.vqfH0gehfvNYrW.rpryc7q8rm, '')
  assert.equal(client.calls[0].data.yjDnG, 'token')
  assert.equal(client.calls[0].data.pyV8ela66fIZ7VLCpA.vrjJCWyHuQ6Avw, '123')
  assert.equal(client.calls[0].data.startApplyTime, undefined)
  assert.equal(client.calls[0].path, loanSuccessProtocolPaths.ORDER_LIST_PATH)
  assert.equal(loanSuccessProtocolPaths.ORDER_LIST_PATH, '/p7R/X9MW0/J7Y37DNa332A0VN9o01b')
})

test('validates review prompt and review save response structures', async () => {
  const client = createClient({
    'API-005': {
      cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
      pl9xRlV: '',
      aewM: true,
    },
    'API-006': {
      cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
      pl9xRlV: '',
      data: {},
    },
  })
  const services = createLoanSuccessServices({ client, getGlobalState: () => globalState })
  assert.deepEqual(await services.getReviewPromptEnabled(), { type: 'success', enabled: true })
  assert.equal((await services.saveReview({ grade: 5, content: 'ok' })).type, 'success')
  assert.equal(client.calls[0].path, loanSuccessProtocolPaths.REVIEW_PROMPT_PATH)
  assert.equal(loanSuccessProtocolPaths.REVIEW_PROMPT_PATH, '/dQz/GSFELDK/wBMPLSrCCFXPDNvOK')
  assert.equal(client.calls[0].data.cvgH, 'af')
  assert.equal(client.calls[0].data.rsbhpZ3X.pwtL, 'ga')
  assert.equal(client.calls[1].path, loanSuccessProtocolPaths.SAVE_REVIEW_PATH)
  assert.equal(loanSuccessProtocolPaths.SAVE_REVIEW_PATH, '/ox8/fzelkkj/iilmzilwkz0jbmwwcu4vj')
  assert.equal(client.calls[1].data.zhNZR, 5)
  assert.equal(client.calls[1].data.kqnBevt8VMT.il940Yf, 'ok')
  assert.equal(client.calls[1].data.grade, undefined)
  assert.equal(client.calls[1].data.content, undefined)
})

test('accepts a successful review save without consuming the business data field', async () => {
  const client = createClient({
    'API-006': {
      cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
      pl9xRlV: '',
    },
  })
  const services = createLoanSuccessServices({ client, getGlobalState: () => globalState })
  assert.equal((await services.saveReview({ grade: 5, content: 'ok' })).type, 'success')
})
