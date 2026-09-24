import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createMultiPushResultServices,
  multiPushResultProtocolPaths,
} from './multiPushResultServices.js'

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

function envelope(returnCode, extra = {}) {
  return {
    cyiUgNvO2EPltj: { atY3WWbXIN: returnCode },
    pl9xRlV: '',
    ...extra,
  }
}

test('loads the multi push product list from its own path and raw field', async () => {
  const client = createClient({
    'API-001': envelope(2000, {
      boxeqivkXywlXvshygxTmwx: [
        { id: 'p1', productName: 'Product One', minAmount: '1500.00', icon: 'https://cdn.example.com/p1.png' },
        { id: 'p2', productName: 'Product Two', minAmount: '2500', icon: 'https://cdn.example.com/p2.png' },
      ],
    }),
  })
  const services = createMultiPushResultServices({ client, getGlobalState: () => globalState })
  const result = await services.loadRecommendedProducts({ signal: 'signal' })

  assert.equal(result.type, 'success')
  assert.deepEqual(result.products.map((product) => product.id), ['p1', 'p2'])
  assert.equal(result.products[0].minAmount, '1500.00')
  assert.equal(client.calls[0].path, multiPushResultProtocolPaths.PRODUCT_PATH)
  assert.equal(multiPushResultProtocolPaths.PRODUCT_PATH, '/veL/SgR2X1W/P3U5HIUdGjFi/aLhW')
  assert.equal(client.calls[0].method, 'POST')
  assert.equal(client.calls[0].protocolId, 'API-001')
  assert.equal(client.calls[0].signal, 'signal')
  assert.deepEqual(client.calls[0].data, {
    cvgH: 'af',
    rsbhpZ3X: { pwtL: 'ga' },
    bgU88QMO: { eybE: 'fb' },
    amHasFw: 'DineroPro',
    mmNUCmQdMioQ2O: { ux9jYLcC8H: '1.0' },
    qkNsXozI1oC5g3: { tf69g5Spk5: '2' },
    uxzfxbBMxhB: 'com.example',
    ulG: '',
    vqfH0gehfvNYrW: { rpryc7q8rm: '' },
    yjDnG: 'token',
  })
})

test('treats a missing or empty product list as no recommendation', async () => {
  const missing = createClient({ 'API-001': envelope(2000) })
  const missingServices = createMultiPushResultServices({ client: missing, getGlobalState: () => globalState })
  assert.equal((await missingServices.loadRecommendedProducts()).type, 'empty')

  const empty = createClient({ 'API-001': envelope(2000, { boxeqivkXywlXvshygxTmwx: [] }) })
  const emptyServices = createMultiPushResultServices({ client: empty, getGlobalState: () => globalState })
  assert.equal((await emptyServices.loadRecommendedProducts()).type, 'empty')
})

test('rejects duplicate ids, invalid amounts, invalid icons, and non-array product data', async () => {
  const duplicate = createClient({
    'API-001': envelope(2000, {
      boxeqivkXywlXvshygxTmwx: [
        { id: 'p1', productName: 'One', minAmount: '1', icon: 'https://cdn.example.com/1.png' },
        { id: 'p1', productName: 'Two', minAmount: '2', icon: 'https://cdn.example.com/2.png' },
      ],
    }),
  })
  assert.equal(
    (await createMultiPushResultServices({ client: duplicate, getGlobalState: () => globalState }).loadRecommendedProducts()).type,
    'invalid_response',
  )

  const invalidAmount = createClient({
    'API-001': envelope(2000, {
      boxeqivkXywlXvshygxTmwx: [{ id: 'p1', productName: 'One', minAmount: '-1', icon: 'https://cdn.example.com/1.png' }],
    }),
  })
  assert.equal(
    (await createMultiPushResultServices({ client: invalidAmount, getGlobalState: () => globalState }).loadRecommendedProducts()).type,
    'invalid_response',
  )

  const invalidIcon = createClient({
    'API-001': envelope(2000, {
      boxeqivkXywlXvshygxTmwx: [{ id: 'p1', productName: 'One', minAmount: '1', icon: 'http://cdn.example.com/1.png' }],
    }),
  })
  assert.equal(
    (await createMultiPushResultServices({ client: invalidIcon, getGlobalState: () => globalState }).loadRecommendedProducts()).type,
    'invalid_response',
  )

  const nonArray = createClient({ 'API-001': envelope(2000, { boxeqivkXywlXvshygxTmwx: { id: 'p1' } }) })
  assert.equal(
    (await createMultiPushResultServices({ client: nonArray, getGlobalState: () => globalState }).loadRecommendedProducts()).type,
    'invalid_response',
  )
})

test('surfaces the business message when the product list request fails business validation', async () => {
  const client = createClient({
    'API-001': {
      cyiUgNvO2EPltj: { atY3WWbXIN: 3001 },
      pl9xRlV: 'No disponible',
      boxeqivkXywlXvshygxTmwx: [],
    },
  })
  const services = createMultiPushResultServices({ client, getGlobalState: () => globalState })
  const result = await services.loadRecommendedProducts()
  assert.equal(result.type, 'business_failure')
  assert.equal(result.message, 'No disponible')
})

test('runs the multi push pre-application and application payloads', async () => {
  const client = createClient({
    'API-002': envelope(2000, { ik803hS46CSFXi8: ['o1', 'o2'] }),
    'API-003': envelope(2000, { aewM: { successList: ['o1', 'o2'] } }),
  })
  const services = createMultiPushResultServices({ client, getGlobalState: () => globalState })

  const pre = await services.preApply({ productIds: ['p1', 'p2'] })
  assert.equal(pre.type, 'success')
  assert.deepEqual(pre.orderIds, ['o1', 'o2'])
  assert.equal(client.calls[0].path, multiPushResultProtocolPaths.PRE_APPLICATION_PATH)
  assert.equal(multiPushResultProtocolPaths.PRE_APPLICATION_PATH, '/nYL/R0GNU/PNUPHsX1K/S0HdSYO7')
  assert.deepEqual(client.calls[0].data.npwxCwB9qMB, ['p1', 'p2'])
  assert.equal(client.calls[0].data.productList, undefined)

  const applied = await services.apply({ orderIds: pre.orderIds })
  assert.equal(applied.type, 'success')
  assert.deepEqual(applied.orderIds, ['o1', 'o2'])
  assert.equal(client.calls[1].path, multiPushResultProtocolPaths.APPLICATION_PATH)
  assert.equal(multiPushResultProtocolPaths.APPLICATION_PATH, '/iyA/GAvnJ/EnJpw2MBz/syHuQ')
  assert.deepEqual(client.calls[1].data.iiFpTXF0KDV, ['o1', 'o2'])
  assert.equal(client.calls[1].data.orderIdList, undefined)
})

test('rejects empty or malformed order id lists on the write chain', async () => {
  const emptyPre = createClient({ 'API-002': envelope(2000, { ik803hS46CSFXi8: [] }) })
  assert.equal(
    (await createMultiPushResultServices({ client: emptyPre, getGlobalState: () => globalState }).preApply({ productIds: ['p1'] })).type,
    'business_failure',
  )

  const malformedApply = createClient({ 'API-003': envelope(2000, { aewM: { successList: ['o1', 2] } }) })
  assert.equal(
    (await createMultiPushResultServices({ client: malformedApply, getGlobalState: () => globalState }).apply({ orderIds: ['o1'] })).type,
    'business_failure',
  )

  const missingApply = createClient({ 'API-003': envelope(2000, { aewM: {} }) })
  assert.equal(
    (await createMultiPushResultServices({ client: missingApply, getGlobalState: () => globalState }).apply({ orderIds: ['o1'] })).type,
    'business_failure',
  )

  const services = createMultiPushResultServices({ client: createClient({}), getGlobalState: () => globalState })
  assert.equal((await services.preApply({ productIds: [] })).type, 'invalid_response')
  assert.equal((await services.apply({ orderIds: [''] })).type, 'invalid_response')
})

test('loads the order list with the page system time and degrades optional card fields', async () => {
  const client = createClient({
    'API-004': envelope(2000, {
      qrAbsjzu7WLU: {
        baIJ: [
          {
            productIconImageUrl: 'http://unsafe.example.com/icon.png',
            orderNo: 'order-1',
            productName: 'Product',
            approvalAmount: '1500',
            orderStatusStr: 'Evaluando',
          },
          {
            productIconImageUrl: 'https://cdn.example.com/icon.png',
            orderNo: '',
            productName: 'Product Two',
            approvalAmount: 'not-a-number',
            orderStatusStr: 'Aprobado',
          },
        ],
      },
    }),
  })
  const services = createMultiPushResultServices({ client, getGlobalState: () => globalState })
  const result = await services.loadOrders({ startApplyTime: '123' })

  assert.equal(result.type, 'success')
  assert.equal(result.orders.length, 2)
  assert.equal(result.orders[0].orderId, 'order-1')
  assert.equal(result.orders[0].productIcon, '')
  assert.equal(result.orders[1].orderId, '')
  assert.equal(result.orders[1].approvalAmount, '')
  assert.equal(client.calls[0].path, multiPushResultProtocolPaths.ORDER_LIST_PATH)
  assert.equal(multiPushResultProtocolPaths.ORDER_LIST_PATH, '/p7R/X9MW0/J7Y37DNa332A0VN9o01b')
  assert.equal(client.calls[0].data.pyV8ela66fIZ7VLCpA.vrjJCWyHuQ6Avw, '123')
  assert.equal(client.calls[0].data.startApplyTime, undefined)
})

test('treats an empty order list as an empty result', async () => {
  const client = createClient({ 'API-004': envelope(2000, { qrAbsjzu7WLU: { baIJ: [] } }) })
  const services = createMultiPushResultServices({ client, getGlobalState: () => globalState })
  assert.equal((await services.loadOrders({ startApplyTime: '123' })).type, 'empty')
})

test('reads the review prompt flag and saves the review with raw fields', async () => {
  const client = createClient({
    'API-005': envelope(2000, { aewM: true }),
    'API-006': envelope(2000, { data: {} }),
  })
  const services = createMultiPushResultServices({ client, getGlobalState: () => globalState })

  assert.deepEqual(await services.getReviewPromptEnabled(), { type: 'success', enabled: true })
  assert.equal(client.calls[0].path, multiPushResultProtocolPaths.REVIEW_PROMPT_PATH)
  assert.equal(multiPushResultProtocolPaths.REVIEW_PROMPT_PATH, '/dQz/GSFELDK/wBMPLSrCCFXPDNvOK')

  assert.equal((await services.saveReview({ grade: 5, content: 'ok' })).type, 'success')
  assert.equal(client.calls[1].path, multiPushResultProtocolPaths.SAVE_REVIEW_PATH)
  assert.equal(multiPushResultProtocolPaths.SAVE_REVIEW_PATH, '/ox8/fzelkkj/iilmzilwkz0jbmwwcu4vj')
  assert.equal(client.calls[1].data.zhNZR, 5)
  assert.equal(client.calls[1].data.kqnBevt8VMT.il940Yf, 'ok')
  assert.equal(client.calls[1].data.grade, undefined)
  assert.equal(client.calls[1].data.content, undefined)
})

test('accepts a review save success without a business data payload and rejects a non boolean flag', async () => {
  const saveClient = createClient({ 'API-006': envelope(2000) })
  const saveServices = createMultiPushResultServices({ client: saveClient, getGlobalState: () => globalState })
  assert.equal((await saveServices.saveReview({ grade: 4, content: 'ok' })).type, 'success')

  const flagClient = createClient({ 'API-005': envelope(2000, { aewM: 'true' }) })
  const flagServices = createMultiPushResultServices({ client: flagClient, getGlobalState: () => globalState })
  assert.equal((await flagServices.getReviewPromptEnabled()).type, 'invalid_response')

  assert.equal((await saveServices.saveReview({ grade: 0, content: 'ok' })).type, 'invalid_response')
  assert.equal((await saveServices.saveReview({ grade: 5, content: 1 })).type, 'invalid_response')
})

test('treats a non object response body as an invalid response', async () => {
  const client = {
    calls: [],
    async request(config) {
      this.calls.push(config)
      return { data: 'not-json' }
    },
  }
  const services = createMultiPushResultServices({ client, getGlobalState: () => globalState })
  assert.equal((await services.loadRecommendedProducts()).type, 'invalid_response')
  assert.equal((await services.loadOrders({ startApplyTime: '1' })).type, 'invalid_response')
  assert.equal((await services.getReviewPromptEnabled()).type, 'invalid_response')
})
