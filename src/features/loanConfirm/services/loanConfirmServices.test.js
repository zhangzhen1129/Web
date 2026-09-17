import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildApplicationPayload,
  buildOrderConfirmPayload,
  createLoanConfirmServices,
  loanConfirmProtocolPaths,
  mapOrderConfirmDisplayModel,
} from './loanConfirmServices.js'

const globalState = Object.freeze({
  afId: 'af',
  gaId: 'ga',
  fbId: 'fb',
  appName: 'DineroPro',
  appVersion: '1.0.0',
  packageName: 'com.example.app',
  token: 'token-value',
})

const confirmResponse = Object.freeze({
  cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
  pl9xRlV: '',
  trNtuIJKIOuEYFINHM: '1,000 - 5,000',
  nthhYjhBYsstcBbAO2s0: { xj2JJAdBXJWI: '900' },
  ymcCXUcK5CcGWnXRT05G6VnO7W6V: '1,100',
  kwou5JkFthdG9: '2025-11-20',
  msKyvVGCtRvBcCGyPKvLKlzKvoc2a: { bdis5H7rOsiorA7BmbbA7: '2025-12-20' },
  qyaiSi4sni8lyi3m: 'AFIRME',
  au0YIYU8dYY1ocxJbH: { ovuPNFyIYT: '1212 1212 1212 1212' },
})

test('builds the two documented request bodies with shared fields and order id', () => {
  const expectedCommon = {
    cvgH: 'af',
    rsbhpZ3X: { pwtL: 'ga' },
    bgU88QMO: { eybE: 'fb' },
    amHasFw: 'DineroPro',
    mmNUCmQdMioQ2O: { ux9jYLcC8H: '1.0.0' },
    qkNsXozI1oC5g3: { tf69g5Spk5: '2' },
    uxzfxbBMxhB: 'com.example.app',
    ulG: '',
    vqfH0gehfvNYrW: { rpryc7q8rm: '' },
    yjDnG: 'token-value',
  }
  assert.deepEqual(buildOrderConfirmPayload(globalState, { orderId: 'order-1' }), {
    ...expectedCommon,
    sf9Qno9CRgP: { nqE1SzE: 'order-1' },
  })
  assert.deepEqual(buildApplicationPayload(globalState, { orderId: 'order-1' }), {
    ...expectedCommon,
    sf9Qno9CRgP: { nqE1SzE: 'order-1' },
  })
})

test('maps only the seven declared display fields and keeps invalid values empty', () => {
  assert.deepEqual(mapOrderConfirmDisplayModel(confirmResponse), {
    loanAmount: '1,000 - 5,000',
    receivedAmount: '900',
    repaymentAmount: '1,100',
    applicationDate: '2025-11-20',
    repaymentDate: '2025-12-20',
    bankName: 'AFIRME',
    bankAccount: '1212 1212 1212 1212',
  })
  assert.deepEqual(mapOrderConfirmDisplayModel({
    trNtuIJKIOuEYFINHM: 1000,
    nthhYjhBYsstcBbAO2s0: null,
  }), {
    loanAmount: '',
    receivedAmount: '',
    repaymentAmount: '',
    applicationDate: '',
    repaymentDate: '',
    bankName: '',
    bankAccount: '',
  })
})

test('uses the controlled paths, JSON bodies, and caller abort signal', async () => {
  const requests = []
  const signal = { aborted: false }
  const services = createLoanConfirmServices({
    getGlobalState: () => globalState,
    client: {
      async request(request) {
        requests.push(request)
        return { data: request.protocolId === 'API-001' ? confirmResponse : { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 } } }
      },
    },
  })

  const confirm = await services.loadConfirmInfo({ orderId: 'order-1', signal })
  const application = await services.submitApplication({ orderId: 'order-1', signal })

  assert.equal(confirm.type, 'success')
  assert.equal(application.type, 'success')
  assert.deepEqual(requests.map(({ method, path, protocolId, signal: requestSignal }) => ({ method, path, protocolId, signal: requestSignal })), [
    { method: 'POST', path: loanConfirmProtocolPaths.ORDER_CONFIRM_PATH, protocolId: 'API-001', signal },
    { method: 'POST', path: loanConfirmProtocolPaths.APPLICATION_PATH, protocolId: 'API-002', signal },
  ])
})

test('classifies business failures and invalid response envelopes', async () => {
  const services = createLoanConfirmServices({
    getGlobalState: () => globalState,
    client: {
      async request({ protocolId }) {
        if (protocolId === 'API-001') return { data: { cyiUgNvO2EPltj: { atY3WWbXIN: 2001 }, pl9xRlV: 'Try again.' } }
        return { data: { cyiUgNvO2EPltj: { atY3WWbXIN: '2000' } } }
      },
    },
  })

  assert.deepEqual(await services.loadConfirmInfo({ orderId: 'order-1' }), {
    type: 'business_failure',
    message: 'Try again.',
  })
  assert.deepEqual(await services.submitApplication({ orderId: 'order-1' }), {
    type: 'invalid_response',
  })
})
