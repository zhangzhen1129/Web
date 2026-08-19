import assert from 'node:assert/strict'
import test from 'node:test'
import axios from 'axios'
import { createNetworkClient } from './client.js'
import { createCredentialHeaderProvider } from './credentials.js'
import { NETWORK_ERROR_CATEGORY } from './errors.js'

const settings = () => ({ baseUrl: 'https://api.example.test', timeoutMs: 2500 })

function responseAdapter({ status = 200, data = {}, headers = { 'content-type': 'application/json' } } = {}) {
  return async (config) => ({ config, data, headers, request: {}, status, statusText: 'OK' })
}

function failingAdapter(error) {
  return async (config) => {
    error.config = config
    throw error
  }
}

function createTestClient(options = {}) {
  return createNetworkClient({ resolveSettings: settings, adapter: responseAdapter(), ...options })
}

async function expectCategory(operation, category) {
  await assert.rejects(operation, (error) => error.category === category)
}

test('uses one interceptor pair, propagates service request fields, and never decides a business result', async () => {
  let receivedConfig
  const client = createTestClient({
    adapter: async (config) => {
      receivedConfig = config
      return { config, data: { businessCode: 'DECLINED' }, headers: { 'content-type': 'application/json' }, request: {}, status: 200, statusText: 'OK' }
    },
    credentialHeaderProvider: createCredentialHeaderProvider(() => ({ Authorization: 'Bearer test-token' })),
  })

  const response = await client.request({
    method: 'post',
    path: '/loan/application',
    params: { page: 1 },
    data: { amount: 100 },
    headers: { 'content-type': 'application/json' },
    protocolId: 'loan.application.submit',
  })

  assert.deepEqual(client.getInterceptorCounts(), { request: 1, response: 1 })
  assert.equal(receivedConfig.baseURL, 'https://api.example.test')
  assert.equal(receivedConfig.timeout, 2500)
  assert.equal(receivedConfig.headers.get('authorization'), 'Bearer test-token')
  assert.deepEqual(response.data, { businessCode: 'DECLINED' })
  assert.deepEqual(client.diagnostics.read(), [
    { type: 'request', protocolId: 'loan.application.submit', method: 'POST', path: '/loan/application' },
    { type: 'response', protocolId: 'loan.application.submit', status: 200 },
  ])
})

test('rejects missing controlled configuration, unsafe paths, sensitive query parameters, and zero timeout', async () => {
  const noSettingsClient = createNetworkClient({ adapter: responseAdapter(), resolveSettings: () => ({ baseUrl: '', timeoutMs: 0 }) })
  await expectCategory(() => noSettingsClient.request({ method: 'get', path: '/health', protocolId: 'health.read' }), NETWORK_ERROR_CATEGORY.CONFIGURATION)

  const client = createTestClient()
  await expectCategory(() => client.request({ method: 'get', path: 'https://example.test/health', protocolId: 'health.read' }), NETWORK_ERROR_CATEGORY.CONFIGURATION)
  await expectCategory(() => client.request({ method: 'get', path: '/health', params: { token: 'secret' }, protocolId: 'health.read' }), NETWORK_ERROR_CATEGORY.CONFIGURATION)
  await expectCategory(() => client.request({ method: 'get', path: '/health', timeoutMs: 0, protocolId: 'health.read' }), NETWORK_ERROR_CATEGORY.CONFIGURATION)
})

test('classifies HTTP and authentication failures without automatic retry', async () => {
  let callCount = 0
  const httpClient = createTestClient({
    adapter: async (config) => {
      callCount += 1
      return { config, data: { failure: true }, headers: { 'content-type': 'application/json' }, request: {}, status: 500, statusText: 'Server Error' }
    },
  })
  await expectCategory(() => httpClient.request({ method: 'get', path: '/health', protocolId: 'health.read' }), NETWORK_ERROR_CATEGORY.HTTP)
  assert.equal(callCount, 1)

  const authClient = createTestClient({ adapter: responseAdapter({ status: 401, data: { error: 'expired' } }) })
  await expectCategory(() => authClient.request({ method: 'get', path: '/account', protocolId: 'account.read' }), NETWORK_ERROR_CATEGORY.AUTHENTICATION)
})

test('classifies timeout, cancellation, and unreachable network errors', async () => {
  const timeoutError = Object.assign(new Error('timeout'), { code: 'ECONNABORTED' })
  await expectCategory(() => createTestClient({ adapter: failingAdapter(timeoutError) }).request({ method: 'get', path: '/health', protocolId: 'health.read' }), NETWORK_ERROR_CATEGORY.TIMEOUT)

  const controller = new AbortController()
  controller.abort()
  const canceledClient = createTestClient({ adapter: failingAdapter(new axios.CanceledError('request canceled')) })
  await expectCategory(() => canceledClient.request({ method: 'get', path: '/health', signal: controller.signal, protocolId: 'health.read' }), NETWORK_ERROR_CATEGORY.CANCELED)

  await expectCategory(() => createTestClient({ adapter: failingAdapter(new Error('socket unavailable')) }).request({ method: 'get', path: '/health', protocolId: 'health.read' }), NETWORK_ERROR_CATEGORY.NETWORK)
})

test('classifies empty, non-JSON, and structurally invalid response bodies', async () => {
  await expectCategory(() => createTestClient({ adapter: responseAdapter({ data: null }) }).request({ method: 'get', path: '/empty', protocolId: 'empty.read' }), NETWORK_ERROR_CATEGORY.EMPTY_RESPONSE)
  await expectCategory(() => createTestClient({ adapter: responseAdapter({ data: '<html>', headers: { 'content-type': 'text/html' } }) }).request({ method: 'get', path: '/html', protocolId: 'html.read' }), NETWORK_ERROR_CATEGORY.NON_JSON_RESPONSE)
  await expectCategory(() => createTestClient({ adapter: responseAdapter({ data: 42 }) }).request({ method: 'get', path: '/number', protocolId: 'number.read' }), NETWORK_ERROR_CATEGORY.INVALID_RESPONSE)
})
