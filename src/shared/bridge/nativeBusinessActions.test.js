import assert from 'node:assert/strict'
import test from 'node:test'
import {
  logoutToOtpLoginNative,
  openGooglePlayNative,
} from './nativeBusinessActions.js'

function installWindow(bridge) {
  globalThis.window = {
    ...bridge,
    dispatchEvent() {},
  }
}

test('openGooglePlayNative sends the documented request without consuming a failure callback', () => {
  let payload
  installWindow({
    plahub: {
      openGooglePlay(value) {
        payload = JSON.parse(value)
        return JSON.stringify({
          action: 'google_play_open',
          status: 'accepted',
          requestId: payload.requestId,
          message: 'accepted',
        })
      },
    },
  })

  assert.equal(openGooglePlayNative(), true)
  assert.equal(payload.replyHandler, 'window.__dineroProGooglePlayReply')
  assert.equal(typeof window.__dineroProGooglePlayReply, 'function')
  assert.doesNotThrow(() => window.__dineroProGooglePlayReply({ status: 'ERR_OPEN_FAILED' }))
})

test('business actions isolate missing and throwing Bridge methods', () => {
  installWindow({ plahub: {} })
  assert.equal(logoutToOtpLoginNative(), false)
  assert.equal(openGooglePlayNative(), false)

  installWindow({
    plahub: {
      logoutToOtpLogin() {
        throw new Error('host failure')
      },
      openGooglePlay() {
        throw new Error('host failure')
      },
    },
  })
  assert.equal(logoutToOtpLoginNative(), false)
  assert.equal(openGooglePlayNative(), false)
})
