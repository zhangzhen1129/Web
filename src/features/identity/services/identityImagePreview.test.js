import assert from 'node:assert/strict'
import test from 'node:test'
import { createIdentityImagePreview, revokeIdentityImagePreview } from './identityImagePreview.js'

test('creates and revokes an opaque blob preview without placing raw image data in the DOM', async () => {
  let terminated = false
  const previewUrl = await createIdentityImagePreview({
    imageBase64: 'AQID',
    mimeType: 'image/jpeg',
    workerFactory: () => ({
      onmessage: null,
      onerror: null,
      postMessage({ id }) {
        this.onmessage({ data: { id, buffer: Uint8Array.from([1, 2, 3]).buffer } })
      },
      terminate() { terminated = true },
    }),
  })
  assert.match(previewUrl, /^blob:/)
  assert.equal(terminated, true)
  revokeIdentityImagePreview(previewUrl)
})


test('forwards data-url and url-safe base64 input to the worker unchanged', async () => {
  let payload = null
  const previewUrl = await createIdentityImagePreview({
    imageBase64: 'data:image/jpeg;base64,ab-c_',
    workerFactory: () => ({
      onmessage: null,
      onmessageerror: null,
      onerror: null,
      postMessage(message) {
        payload = message.imageBase64
        this.onmessage({ data: { id: message.id, buffer: Uint8Array.from([1]).buffer } })
      },
      terminate() {},
    }),
  })
  assert.equal(payload, 'data:image/jpeg;base64,ab-c_')
  assert.match(previewUrl, /^blob:/)
  revokeIdentityImagePreview(previewUrl)
})
