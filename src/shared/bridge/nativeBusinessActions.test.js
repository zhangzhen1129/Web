import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getNativeBusinessActionRegistrySize,
  logoutToOtpLoginNative,
  openGooglePlayNative,
} from './nativeBusinessActions.js'

function installWindow(bridge) {
  globalThis.window = {
    ...bridge,
    dispatchEvent() {},
  }
}

test('openGooglePlayNative sends the documented request and cleans the terminal registration', () => {
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
  assert.equal(getNativeBusinessActionRegistrySize(), 0)
  assert.equal(window.__dineroProGooglePlayReply, undefined)
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
  assert.equal(getNativeBusinessActionRegistrySize(), 0)
})
