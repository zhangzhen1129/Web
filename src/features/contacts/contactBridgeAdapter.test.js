import assert from 'node:assert/strict'
import test from 'node:test'
import { createContactBridgeAdapter } from './contactBridgeAdapter.js'

test('maps Android terminal replies to stable contact business results', () => {
  const replies = []
  const results = []
  const adapter = createContactBridgeAdapter({
    selectNative(consumer) { replies.push(consumer); return `request-${replies.length}` },
    cancelNativeConsumer() { return true },
  })

  adapter.select((result) => results.push(result))
  replies[0]({ status: 'SUCCESS', contactResult: { name: 'Ana', phoneNumber: '123456789' } })
  adapter.select((result) => results.push(result))
  replies[1]({ status: 'ERR_USER_CANCELLED', contactResult: {} })
  adapter.select((result) => results.push(result))
  replies[2]({ status: 'ERR_NO_PHONE_NUMBER', contactResult: {} })
  adapter.select((result) => results.push(result))
  replies[3]({ status: 'ERR_PICK_FAILED', contactResult: {} })
  adapter.select((result) => results.push(result))
  replies[4]({ status: 'ERR_PICKER_UNAVAILABLE', contactResult: {} })

  assert.deepEqual(results, [
    { type: 'selected', name: 'Ana', phoneNumber: '123456789' },
    { type: 'canceled' },
    { type: 'no_phone' },
    { type: 'not_completed' },
    { type: 'unavailable' },
  ])
})

test('cancels replaced consumers and ignores late, duplicate, failed, and disposed delivery', () => {
  const consumers = []
  const failures = []
  const canceled = []
  const results = []
  const adapter = createContactBridgeAdapter({
    selectNative(consumer, options) {
      consumers.push(consumer)
      failures.push(options.onFailure)
      return `request-${consumers.length}`
    },
    cancelNativeConsumer(requestId) { canceled.push(requestId); return true },
  })

  adapter.select((result) => results.push(result))
  adapter.select((result) => results.push(result))
  consumers[0]({ status: 'SUCCESS', contactResult: { name: 'Old', phoneNumber: '111111111' } })
  failures[1]({ code: 'BRIDGE_UNAVAILABLE' })
  failures[1]({ code: 'BRIDGE_UNAVAILABLE' })
  adapter.select((result) => results.push(result))
  adapter.dispose()
  consumers[2]({ status: 'SUCCESS', contactResult: { name: 'Late', phoneNumber: '222222222' } })

  assert.deepEqual(canceled, ['request-1', 'request-3'])
  assert.deepEqual(results, [{ type: 'unavailable' }])
})
