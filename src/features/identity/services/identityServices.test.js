import assert from 'node:assert/strict'
import test from 'node:test'
import { buildIdentityPayload, createIdentityServices, identityProtocolPaths } from './identityServices.js'

const successEnvelope = (extra = {}) => ({ cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, ...extra })
const globalState = Object.freeze({ token: 'secret-token', afId: 'af', gaId: 'ga', fbId: 'fb', appName: 'app', appVersion: '1', packageName: 'pkg' })

test('builds common body values and keeps stage payloads mutually exclusive', async () => {
  const payload = buildIdentityPayload(globalState, { mark: 4, livingBase64Src: 'face-data' })
  assert.equal(payload.grDxc8Q6.hfoF, 4)
  assert.equal(payload.lyhG9EryeCfPIPY, 'face-data')
  assert.equal(payload.ldT3zZrZwdQY, '')
  assert.equal(payload.rbT5808gw6, '')
  assert.equal(payload.yjDnG, 'secret-token')
  assert.equal(payload.ulG, '')
  assert.equal(payload.vqfH0gehfvNYrW.rpryc7q8rm, '')

  let requests = 0
  const services = createIdentityServices({ client: { request: async () => { requests += 1; return { data: successEnvelope() } } }, getGlobalState: () => globalState })
  assert.deepEqual(await services.saveIdentity({ mark: 4, livingBase64Src: 'face', h5LivenessId: 'advance' }), { type: 'invalid' })
  assert.deepEqual(await services.saveIdentity({ mark: 5, identityNo: '   ' }), { type: 'invalid' })
  assert.equal(requests, 0)
})

test('uses exact protocol paths, POST, body-only credentials, and the abort signal', async () => {
  const calls = []
  const signal = new AbortController().signal
  const client = { request: async (config) => { calls.push(config); return { data: successEnvelope({ aewM: 'Advance' }) } } }
  const services = createIdentityServices({ client, getGlobalState: () => globalState })
  assert.deepEqual(await services.getOcrChannel({ signal }), { type: 'success', channel: 'Advance' })
  assert.equal(calls[0].path, identityProtocolPaths.OCR_CHANNEL_PATH)
  assert.equal(calls[0].protocolId, 'API-001')
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].signal, signal)
  assert.equal(calls[0].data.yjDnG, 'secret-token')
  assert.equal(calls[0].params, undefined)
  assert.equal(calls[0].headers, undefined)
})

test('classifies return codes, missing channel, and malformed response structures', async () => {
  const responses = [
    { data: { cyiUgNvO2EPltj: { atY3WWbXIN: 2001 }, pl9xRlV: 'Try later' } },
    { data: successEnvelope({ pl9xRlV: 'Missing channel' }) },
    { data: { cyiUgNvO2EPltj: { atY3WWbXIN: '2000' }, aewM: 'Advance' } },
    { data: [] },
  ]
  const services = createIdentityServices({ client: { request: async () => responses.shift() }, getGlobalState: () => ({}) })
  assert.deepEqual(await services.getOcrChannel(), { type: 'business_failure', message: 'Try later' })
  assert.deepEqual(await services.getOcrChannel(), { type: 'business_failure', message: 'Missing channel' })
  assert.deepEqual(await services.getOcrChannel(), { type: 'invalid_response' })
  assert.deepEqual(await services.getOcrChannel(), { type: 'invalid_response' })
})

test('accepts the backend numeric OCR success status and requires a non-empty OCR DNI', async () => {
  const responses = [
    { data: successEnvelope({ yrIRrRGUY8D4Izr8bapaJ9: '1', lejY81HicZ4f: ' DNI-123 ' }) },
    { data: successEnvelope({ yrIRrRGUY8D4Izr8bapaJ9: 0, lejY81HicZ4f: 'DNI-123', pl9xRlV: 'OCR failed' }) },
    { data: successEnvelope({ yrIRrRGUY8D4Izr8bapaJ9: '1', lejY81HicZ4f: '', pl9xRlV: 'Missing DNI' }) },
    { data: successEnvelope({ yxObGjQjIhhuvuPtlWZU: { tih694IhWhgg: '1' } }) },
    { data: successEnvelope({ umMAyAvEZOFPtRBSHNfTtTNS: '1' }) },
  ]
  const services = createIdentityServices({ client: { request: async () => responses.shift() }, getGlobalState: () => ({}) })
  assert.deepEqual(await services.saveIdentity({ mark: 1, cardFrontBase64Src: 'image' }), { type: 'success', status: '1', idNumber: 'DNI-123' })
  assert.deepEqual(await services.saveIdentity({ mark: 1, cardFrontBase64Src: 'image' }), { type: 'business_failure', message: 'OCR failed' })
  assert.deepEqual(await services.saveIdentity({ mark: 1, cardFrontBase64Src: 'image' }), { type: 'business_failure', message: 'Missing DNI' })
  assert.deepEqual(await services.saveIdentity({ mark: 4, livingBase64Src: 'face' }), { type: 'success', status: '1', idNumber: '' })
  assert.deepEqual(await services.saveIdentity({ mark: 5, identityNo: 'DNI-123' }), { type: 'success', status: '1', idNumber: '' })
})

test('maps Advance and App mode results while retaining only required values', async () => {
  const calls = []
  const services = createIdentityServices({
    client: { request: async (config) => {
      calls.push(config)
      if (config.protocolId === 'API-002') return { data: successEnvelope({ alEnDvrAlGFEpZod6R4: { gcWlQrapUKT: 'opaque-id' }, kdiFjWa: 'https://trusted.example/live' }) }
      return { data: successEnvelope({ kteZ9gY3cBY: ' order-1 ' }) }
    } },
    getGlobalState: () => ({}),
  })
  assert.deepEqual(await services.createAdvanceSession(), { type: 'success', requestHandle: 'opaque-id', url: 'https://trusted.example/live' })
  assert.deepEqual(await services.refreshAppMode(), { type: 'success', orderId: 'order-1' })
  assert.equal(calls.every((call) => call.url === undefined), true)
  assert.deepEqual(calls.map((call) => call.path), [identityProtocolPaths.ADVANCE_LIVE_PATH, identityProtocolPaths.APP_MODE_PATH])
})

test('treats missing Advance data and blank order ids as business failures', async () => {
  const responses = [
    { data: successEnvelope({ pl9xRlV: 'Missing live data' }) },
    { data: successEnvelope({ kteZ9gY3cBY: ' ', pl9xRlV: 'Missing order' }) },
  ]
  const services = createIdentityServices({ client: { request: async () => responses.shift() }, getGlobalState: () => ({}) })
  assert.deepEqual(await services.createAdvanceSession(), { type: 'business_failure', message: 'Missing live data' })
  assert.deepEqual(await services.refreshAppMode(), { type: 'business_failure', message: 'Missing order' })
})
