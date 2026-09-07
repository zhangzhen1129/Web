import assert from 'node:assert/strict'
import test from 'node:test'
import { createBusinessHandledError } from '../../../shared/businessError/index.js'
import { createHomeDataProvider } from './homeDataProvider.js'

const appResponse = (mode = 0) => ({ data: { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, ff1xUx0HoLLBT: mode, sdev3yZIeDeTpPeCLgpe: { zzNz2u2KdG2t: 1 }, kquKbNemoPpev3iAWeU: { nxUg4J58bXY: 1 }, uxevWvdDX78A9ZfO2: 1, lsnKlOgSn34X6OyM6YoXneo3b: 1, jex8fsxrsl: 'Apply now', kxCNx4mRAzCNC7B: 10, kteZ9gY3cBY: 'order', kuYUF6TeSdvF9D: { ehE3D2: '1' }, zbp3php3hzn79bp: '2', bjNBOTyE0SyECUkmYk: { dtbUD8bUfa: '1' }, mem6ek5g79TRxP: { uiRcT5: 0 } } })

test('assembles protocol body with empty gps and no token fallback', async () => { const calls = []; const provider = createHomeDataProvider({ store: { isMultiPush: false, appName: 'A', appVersion: '1', packageName: 'p', token: '', afId: 'af', gaId: null, fbId: null }, client: { request: async (request) => { calls.push(request); return appResponse() } } }); const result = await provider.loadHomeData({ loadCycleId: 'cycle-a', viewRevision: 0, trigger: 'initial' }); assert.equal(result.status, 'content'); assert.equal(calls[0].data.ulG, ''); assert.equal(calls[0].data.vqfH0gehfvNYrW.rpryc7q8rm, ''); assert.equal(calls[0].data.yjDnG, '') })
test('keeps the loading skeleton and displays a toast for a non-2000 business response', async () => { const provider = createHomeDataProvider({ store: { isMultiPush: false }, client: { request: async () => ({ data: { cyiUgNvO2EPltj: { atY3WWbXIN: 3000 }, pl9xRlV: 'Service unavailable' } }) } }); const result = await provider.loadHomeData({ loadCycleId: 'cycle-business', viewRevision: 0, trigger: 'initial' }); assert.equal(result.status, 'business_failure'); assert.equal(result.viewPayload.pageStatus, 'loading'); assert.equal(result.viewPayload.toastNotice.text, 'Service unavailable'); assert.equal(Object.hasOwn(result.viewPayload, 'errorData'), false) })
test('keeps globally handled business errors free of a second page toast', async () => {
  const provider = createHomeDataProvider({
    store: { isMultiPush: false },
    client: { request: async () => { throw createBusinessHandledError({ code: 4005, message: 'Session expired.' }) } },
  })
  const result = await provider.loadHomeData({ loadCycleId: 'cycle-handled', viewRevision: 0, trigger: 'initial' })
  assert.equal(result.status, 'handled')
  assert.equal(result.viewPayload.pageStatus, 'error')
  assert.equal(Object.hasOwn(result.viewPayload, 'toastNotice'), false)
})
test('cached multi-push skips app-mode request', async () => { let count = 0; const provider = createHomeDataProvider({ store: { isMultiPush: true }, client: { request: async () => { count += 1; return { data: { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, zk9qaIUtAK4JQ: '0', wzKtJNDdLHKt: '1', hb9P7T2PY2Y2W: '1', mem6ek5g79TRxP: { uiRcT5: 0 }, byrspwnswEcFr9sEYdCb: { xgxcGompBTCo: 0 }, jex8fsxrsl: 'Aplicar ahora', boxeqivkXywlXvshygxTmwx: [] } } } } }); const result = await provider.loadHomeData({ loadCycleId: 'cycle-b', viewRevision: 1, trigger: 'refresh', sourceOperationId: 'operation-b' }); assert.equal(result.status, 'content'); assert.equal(count, 1) })
