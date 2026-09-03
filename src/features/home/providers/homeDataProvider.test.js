import assert from 'node:assert/strict'
import test from 'node:test'

import { createHomeController } from '../index.js'
import { createHomeDataProvider } from './homeDataProvider.js'

function appData(overrides = {}) {
  return {
    maskModel: 0,
    identityAuth: 1,
    addInfoAuth: 1,
    basicInfoAuth: 1,
    remittanceAccountAuth: 1,
    amount: '500',
    repaymentTime: '',
    applyTime: '',
    button: 'Continue',
    statusDescription: 'Status',
    orderId: 'order-1',
    orderStatus: 10,
    totalCredit: '1000',
    usedCredit: '500',
    locked: 0,
    ...overrides,
  }
}

function response(data) {
  const envelope = {
    vaOsuw7s: 0,
    bgCAmh0f: { dlWr: 0 },
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    oi: '',
  }
  if (Object.hasOwn(data, 'maskModel')) {
    return { data: {
      ...envelope,
      ff1xUx0HoLLBT: data.maskModel,
      sdev3yZIeDeTpPeCLgpe: { zzNz2u2KdG2t: data.identityAuth },
      kquKbNemoPpev3iAWeU: { nxUg4J58bXY: data.addInfoAuth },
      uxevWvdDX78A9ZfO2: data.basicInfoAuth,
      lsnKlOgSn34X6OyM6YoXneo3b: data.remittanceAccountAuth,
      kuYUF6TeSdvF9D: { ehE3D2: data.amount },
      ujAfyjwfFrlsA2prl52J0: { wjU33fJgYQNfJ: data.repaymentTime },
      kwou5JkFthdG9: data.applyTime,
      jex8fsxrsl: data.button,
      umwAvTdTxSKEvCuIsTlOqqY4W: { xdbJvIIutssyqJjEo: data.statusDescription },
      kteZ9gY3cBY: data.orderId,
      kxCNx4mRAzCNC7B: data.orderStatus,
      zbp3php3hzn79bp: data.totalCredit,
      bjNBOTyE0SyECUkmYk: { dtbUD8bUfa: data.usedCredit },
      mem6ek5g79TRxP: { uiRcT5: data.locked },
      zgXKK4MNIx2ZI: 0,
      frhj0xbo6Aa6my2: '',
    } }
  }
  return { data: {
    ...envelope,
    zk9qaIUtAK4JQ: data.usedQuota,
    wzKtJNDdLHKt: data.sumQuota,
    hb9P7T2PY2Y2W: data.remaining,
    mem6ek5g79TRxP: { uiRcT5: data.locked },
    byrspwnswEcFr9sEYdCb: { xgxcGompBTCo: data.repaymentNum },
    jex8fsxrsl: data.button,
    boxeqivkXywlXvshygxTmwx: data.mergPushProductList,
  } }
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve))
}

function createStore() {
  return {
    afId: null,
    gaId: null,
    fbId: null,
    appName: 'DineroPro',
    appVersion: '1.0.0',
    packageName: 'com.example.app',
    gps: null,
    gpsAddress: null,
    token: 'controlled-token',
  }
}

test('serializes the confirmed request body and calls API-002 only for multi-push mode', async () => {
  const calls = []
  const client = {
    request(request) {
      calls.push(request)
      if (request.path.includes('YudVYx8Vci2q')) return Promise.resolve(response(appData({ maskModel: 1 })))
      return Promise.resolve(response({
        usedQuota: '10', sumQuota: '100', remaining: '90', locked: 0, repaymentNum: 0,
        button: 'Aplicar ahora', mergPushProductList: [],
      }))
    },
  }
  const controller = createHomeController()
  const provider = createHomeDataProvider(controller, createStore(), { client, now: () => Date.UTC(2026, 8, 2) })

  provider.start()
  await flush()
  await flush()

  assert.equal(calls.length, 2)
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].data.qkNsXozI1oC5g3.tf69g5Spk5, '2')
  assert.equal(calls[0].data.cvgH, '')
  assert.equal(calls[0].data.ulG, '')
  assert.equal(calls[0].data.yjDnG, 'controlled-token')
  assert.equal(calls[0].signal, calls[1].signal)
  assert.equal(controller.getState().homeMode, 'multi_push')
  provider.destroy()
  controller.destroy()
})

test('uses the authorized temporary token fallback only when the store token is empty', async () => {
  const calls = []
  const client = { request(request) { calls.push(request); return Promise.resolve(response(appData())) } }
  const store = createStore()
  store.token = null
  const controller = createHomeController()
  const provider = createHomeDataProvider(controller, store, { client })

  provider.start()
  await flush()

  assert.equal(calls[0].data.yjDnG, '6a97ba16e4b0d92c4ed9ad76')
  provider.destroy()
  controller.destroy()
})

test('replaces an old loading cycle and ignores its late result', async () => {
  const pending = []
  const client = { request(request) { return new Promise((resolve) => pending.push({ request, resolve })) } }
  let provider
  const controller = createHomeController({ onOperation(operation) { provider.handleOperation(operation) } })
  provider = createHomeDataProvider(controller, createStore(), { client })

  provider.start()
  provider.reload()
  assert.equal(pending.length, 2)
  pending[0].resolve(response(appData({ button: 'Old' })))
  pending[1].resolve(response(appData({ button: 'New' })))
  await flush()
  await flush()

  assert.equal(controller.getState().sourceOperationId, null)
  assert.equal(controller.getState().viewData.primaryAction.text, 'New')
  provider.destroy()
  controller.destroy()
})

test('shows the empty-products toast only after the primary action', async () => {
  const client = {
    request(request) {
      if (request.path.includes('YudVYx8Vci2q')) return Promise.resolve(response(appData({ maskModel: 1 })))
      return Promise.resolve(response({
        usedQuota: '10', sumQuota: '100', remaining: '90', locked: 0, repaymentNum: 0,
        button: 'Aplicar ahora', mergPushProductList: [],
      }))
    },
  }
  let provider
  const controller = createHomeController({ onOperation(operation) { provider.handleOperation(operation) } })
  provider = createHomeDataProvider(controller, createStore(), { client })

  provider.start()
  await flush()
  await flush()
  assert.equal(controller.getState().toastNotice, null)
  controller.primaryAction()
  assert.equal(controller.getState().toastNotice.messageId, '10')
  provider.destroy()
  controller.destroy()
})
