import assert from 'node:assert/strict'
import test from 'node:test'
import {
  openPrivacyAgreementExternalNat,
  openPrivacyAgreementInAppNat,
} from './nativePrivacyAgreement.js'

const VALID_URL = 'https://pay.example.com/repayment/start?token=masked'

function installBridge({ handler } = {}) {
  const calls = []
  globalThis.window = {
    plahub: {
      openPrivacyAgreementPage(payload) {
        const request = JSON.parse(payload)
        calls.push(request)
        if (handler) return handler(request)
        return JSON.stringify({
          action: 'openPrivacyAgreementPage',
          requestId: request.requestId,
          status: 'accepted',
          message: 'accepted',
        })
      },
    },
    dispatchEvent() {},
  }
  return calls
}

test.afterEach(() => {
  delete globalThis.window
})

test('opens a payment URL in the native container with a fresh request id', () => {
  const calls = installBridge()

  assert.equal(openPrivacyAgreementInAppNat(VALID_URL), true)
  assert.equal(openPrivacyAgreementInAppNat(VALID_URL), true)
  assert.equal(calls.length, 2)
  assert.deepEqual(Object.keys(calls[0]).sort(), ['requestId', 'type', 'url'])
  assert.equal(calls[0].url, VALID_URL)
  assert.equal(calls[0].type, 2)
  assert.notEqual(calls[0].requestId, calls[1].requestId)
})

test('opens a payment URL in the external browser without a title', () => {
  const calls = installBridge()

  assert.equal(openPrivacyAgreementExternalNat(VALID_URL), true)
  assert.equal(calls.length, 1)
  assert.deepEqual(Object.keys(calls[0]).sort(), ['requestId', 'type', 'url'])
  assert.equal(calls[0].url, VALID_URL)
  assert.equal(calls[0].type, 1)
  assert.equal('title' in calls[0], false)
})

test('passes an optional non-empty title only for the native container', () => {
  const calls = installBridge()

  assert.equal(openPrivacyAgreementInAppNat(VALID_URL, 'Payment'), true)
  assert.equal(openPrivacyAgreementInAppNat(VALID_URL, ''), true)
  assert.equal(openPrivacyAgreementExternalNat(VALID_URL, 'Payment'), true)
  assert.equal(calls.length, 3)
  assert.equal(calls[0].title, 'Payment')
  assert.equal('title' in calls[1], false)
  assert.equal('title' in calls[2], false)
})

test('rejects an invalid native-container title before calling Android', () => {
  const calls = installBridge()

  assert.equal(openPrivacyAgreementInAppNat(VALID_URL, 1), false)
  assert.equal(openPrivacyAgreementInAppNat(VALID_URL, 'bad\u0000title'), false)
  assert.equal(calls.length, 0)
})

test('accepts HTTP and HTTPS absolute URLs without credentials', () => {
  const calls = installBridge()

  assert.equal(openPrivacyAgreementInAppNat('http://pay.example.com/start'), true)
  assert.equal(openPrivacyAgreementExternalNat('https://pay.example.com/start'), true)
  assert.equal(calls.length, 2)
})

test('rejects invalid or unsafe URLs before calling Android', () => {
  const calls = installBridge()
  const invalidUrls = [
    '',
    ' https://pay.example.com/start',
    'https://pay.example.com/start ',
    'not-a-url',
    'javascript:alert(1)',
    'file:///tmp/payment',
    'https://user:secret@pay.example.com/start',
    'https://pay.example.com\\start',
  ]

  for (const url of invalidUrls) {
    assert.equal(openPrivacyAgreementInAppNat(url), false)
    assert.equal(openPrivacyAgreementExternalNat(url), false)
  }
  assert.equal(calls.length, 0)
})

test('isolates missing bridge and throwing bridge methods', () => {
  globalThis.window = {}
  assert.equal(openPrivacyAgreementInAppNat(VALID_URL), false)
  assert.equal(openPrivacyAgreementExternalNat(VALID_URL), false)

  installBridge({
    handler() {
      throw new Error('host failure')
    },
  })
  assert.equal(openPrivacyAgreementInAppNat(VALID_URL), false)
  assert.equal(openPrivacyAgreementExternalNat(VALID_URL), false)
})

test('returns false for non-accepted, malformed, mismatched, and non-string responses', () => {
  const scenarios = [
    {
      handler: (request) => JSON.stringify({
        action: 'openPrivacyAgreementPage',
        requestId: request.requestId,
        status: 'invalid_param',
        message: 'invalid',
      }),
    },
    {
      handler: (request) => JSON.stringify({
        action: 'openPrivacyAgreementPage',
        requestId: request.requestId,
        status: 'unsupported_type',
        message: 'unsupported',
      }),
    },
    {
      handler: (request) => JSON.stringify({
        action: 'openPrivacyAgreementPage',
        requestId: request.requestId,
        status: 'error',
        message: 'error',
      }),
    },
    { handler: () => 'not-json' },
    { handler: () => JSON.stringify({ status: 'accepted' }) },
    {
      handler: (request) => JSON.stringify({
        action: 'openPrivacyAgreementPage',
        requestId: `${request.requestId}-other`,
        status: 'accepted',
        message: 'accepted',
      }),
    },
  ]

  for (const scenario of scenarios) {
    installBridge(scenario)
    assert.equal(openPrivacyAgreementInAppNat(VALID_URL), false)
    assert.equal(openPrivacyAgreementExternalNat(VALID_URL), false)
  }
})
