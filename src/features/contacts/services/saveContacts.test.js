import assert from 'node:assert/strict'
import test from 'node:test'
import { RELATIONSHIPS } from '../contactForm.js'
import { buildSaveContactsPayload, createSaveContactsService } from './saveContacts.js'

const contacts = Object.freeze({
  contact1: Object.freeze({ relationship: RELATIONSHIPS[0], phoneNumber: '123456789', name: 'Ana' }),
  contact2: Object.freeze({ relationship: RELATIONSHIPS[1], phoneNumber: '987654321', name: 'Luis' }),
})

const globalState = Object.freeze({
  afId: 'af-id', gaId: 'ga-id', fbId: 'fb-id', appName: 'DineroPro', appVersion: '1.2.3', packageName: 'com.dinero.pro', token: 'token-value',
})

test('builds the documented body and preserves contacts as an ordered array', () => {
  const payload = buildSaveContactsPayload(contacts, globalState)
  assert.deepEqual(payload, {
    cvgH: 'af-id', rsbhpZ3X: { pwtL: 'ga-id' }, bgU88QMO: { eybE: 'fb-id' }, amHasFw: 'DineroPro',
    mmNUCmQdMioQ2O: { ux9jYLcC8H: '1.2.3' }, qkNsXozI1oC5g3: { tf69g5Spk5: '2' }, uxzfxbBMxhB: 'com.dinero.pro',
    ulG: '', vqfH0gehfvNYrW: { rpryc7q8rm: '' }, yjDnG: 'token-value',
    jaIvveOulXZV: { lrMwzfSv: [
      { relation: 'Padre/Madre', mobile: '123456789', name: 'Ana' },
      { relation: 'sposo/ Esposa', mobile: '987654321', name: 'Luis' },
    ] },
  })
  assert.equal(Array.isArray(payload.jaIvveOulXZV.lrMwzfSv), true)
  assert.equal(buildSaveContactsPayload({ ...contacts, contact2: { ...contacts.contact2, name: ' ' } }, globalState), null)
})

test('submits through the common client and classifies success and business failure', async () => {
  const requests = []
  const replies = [
    { data: { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 } } },
    { data: { cyiUgNvO2EPltj: { atY3WWbXIN: 4001 }, pl9xRlV: 'Try again.' } },
  ]
  const service = createSaveContactsService({
    getGlobalState: () => globalState,
    client: { request: async (request) => { requests.push(request); return replies.shift() } },
  })
  const abortController = new AbortController()

  assert.deepEqual(await service.submit(contacts, { signal: abortController.signal }), { type: 'success' })
  assert.deepEqual(await service.submit(contacts), { type: 'business_failure', message: 'Try again.' })
  assert.deepEqual(requests[0], {
    method: 'POST', path: '/zLz/LOvN/wuz3JwK/OrRv', data: buildSaveContactsPayload(contacts, globalState), signal: abortController.signal, protocolId: 'API-001',
  })
})

test('rejects malformed and incomplete response bodies', async () => {
  const bodies = [
    undefined,
    'not-json',
    {},
    { cyiUgNvO2EPltj: { atY3WWbXIN: '2000' } },
    { cyiUgNvO2EPltj: { atY3WWbXIN: 4001 } },
  ]
  for (const data of bodies) {
    const service = createSaveContactsService({
      getGlobalState: () => globalState,
      client: { request: async () => ({ data }) },
    })
    await assert.rejects(() => service.submit(contacts), /Invalid response/)
  }
})

test('passes the abort signal and propagates transport failures unchanged', async () => {
  const transportError = Object.assign(new Error('Timed out.'), { category: 'timeout' })
  const abortController = new AbortController()
  let receivedSignal
  const service = createSaveContactsService({
    getGlobalState: () => globalState,
    client: { request: async ({ signal }) => { receivedSignal = signal; throw transportError } },
  })

  await assert.rejects(() => service.submit(contacts, { signal: abortController.signal }), (error) => error === transportError)
  assert.equal(receivedSignal, abortController.signal)
})
