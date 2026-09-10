import {
  cancelNativeContactConsumer,
  selectContactNative,
} from '../../shared/bridge/nativeContact.js'

const RAW_STATUS = Object.freeze({
  selected: 'SUCCESS',
  canceled: 'ERR_USER_CANCELLED',
  noPhone: 'ERR_NO_PHONE_NUMBER',
  incomplete: 'ERR_PICK_FAILED',
  unavailable: 'ERR_PICKER_UNAVAILABLE',
})

function normalizeTerminalResult(reply) {
  if (reply?.status === RAW_STATUS.selected) {
    return Object.freeze({
      type: 'selected',
      name: reply.contactResult.name,
      phoneNumber: reply.contactResult.phoneNumber,
    })
  }
  if (reply?.status === RAW_STATUS.canceled) return Object.freeze({ type: 'canceled' })
  if (reply?.status === RAW_STATUS.noPhone) return Object.freeze({ type: 'no_phone' })
  if (reply?.status === RAW_STATUS.unavailable) return Object.freeze({ type: 'unavailable' })
  return Object.freeze({ type: 'not_completed' })
}

export function createContactBridgeAdapter({
  selectNative = selectContactNative,
  cancelNativeConsumer = cancelNativeContactConsumer,
} = {}) {
  let activeRequestId = null
  let generation = 0
  let disposed = false

  function cancel() {
    generation += 1
    if (activeRequestId !== null) cancelNativeConsumer(activeRequestId)
    activeRequestId = null
  }

  return Object.freeze({
    select(consumer) {
      if (disposed || typeof consumer !== 'function') return false
      cancel()
      const currentGeneration = generation
      const deliver = (result) => {
        if (disposed || currentGeneration !== generation) return
        activeRequestId = null
        generation += 1
        consumer(result)
      }
      const requestId = selectNative(
        (reply) => deliver(normalizeTerminalResult(reply)),
        { onFailure: () => deliver(Object.freeze({ type: 'unavailable' })) },
      )
      if (currentGeneration !== generation) return false
      activeRequestId = typeof requestId === 'string' && requestId.length > 0 ? requestId : null
      return activeRequestId !== null
    },
    cancel,
    dispose() {
      if (disposed) return
      cancel()
      disposed = true
    },
  })
}
