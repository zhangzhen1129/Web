import assert from 'node:assert/strict'
import test from 'node:test'

import { digestPassword } from './changePasswordDigest.js'

const RFC_1321_VECTORS = Object.freeze([
  ['', 'd41d8cd98f00b204e9800998ecf8427e'],
  ['a', '0cc175b9c0f1b6a831c399e269772661'],
  ['abc', '900150983cd24fb0d6963f7d28e17f72'],
  ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
  ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
])

test('matches published MD5 vectors', () => {
  for (const [input, expected] of RFC_1321_VECTORS) {
    assert.equal(digestPassword(input), expected)
  }
})

test('rejects non-string password values', () => {
  assert.throws(() => digestPassword(null), {
    name: 'TypeError',
    message: 'Password value must be a string.',
  })
})