import assert from 'node:assert/strict'
import test from 'node:test'
import { createNetworkError, NETWORK_ERROR_CATEGORY } from './errors.js'

test('redacts supported sensitive fields from diagnostic summaries', () => {
  const secrets = ['bearer-secret', 'token-secret', 'password-secret', 'captcha-secret', 'mobile-secret', 'identity-secret', 'card-secret', 'device-secret']
  const cause = new Error([
    `Bearer=${secrets[0]}`,
    `token=${secrets[1]}`,
    `password=${secrets[2]}`,
    `captcha=${secrets[3]}`,
    `mobile=${secrets[4]}`,
    `identity=${secrets[5]}`,
    `card=${secrets[6]}`,
    `device=${secrets[7]}`,
  ].join(', '))
  const error = createNetworkError({
    category: NETWORK_ERROR_CATEGORY.NETWORK,
    message: 'Network request failed.',
    cause,
  })

  secrets.forEach((secret) => assert.equal(error.summary.includes(secret), false))
  assert.match(error.summary, /\[REDACTED\]/)
})
