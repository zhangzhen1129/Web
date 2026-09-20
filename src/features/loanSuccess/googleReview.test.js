import assert from 'node:assert/strict'
import test from 'node:test'
import googleReviewComments from './googleReview.js'

test('loads a non-empty Google review comment file without fixing its size', () => {
  assert.ok(Array.isArray(googleReviewComments))
  assert.ok(googleReviewComments.length > 0)
  assert.equal(
    googleReviewComments.every((comment) => typeof comment === 'string' && comment.trim().length > 0),
    true,
  )
})
