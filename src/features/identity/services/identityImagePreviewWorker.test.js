import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'

const directory = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(directory, 'identityImagePreviewWorker.js'), 'utf8')

function runWorker(imageBase64) {
  let message = null
  const context = {
    atob,
    self: {
      postMessage(value) { message = value },
    },
    Uint8Array,
  }
  vm.runInNewContext(source, context)
  context.self.onmessage({ data: { id: 'preview-1', imageBase64 } })
  return message
}

test('decodes data-url and url-safe unpadded base64 payloads', () => {
  const message = runWorker('data:image/jpeg;base64,-_8')
  assert.equal(message.id, 'preview-1')
  assert.deepEqual(Array.from(new Uint8Array(message.buffer)), [251, 255])
  assert.equal(message.error, undefined)
})

test('returns a controlled error for malformed preview payloads', () => {
  const message = runWorker('not base64?')
  assert.equal(message.id, 'preview-1')
  assert.equal(message.error, 'IMAGE_PREVIEW_FAILED')
})
