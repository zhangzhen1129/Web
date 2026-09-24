import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ORDER_STATUS,
  getOrderListBadgeColor,
} from './orderListConstants.js'

test('maps the updated Figma badge colors for approved and disbursement-failed orders', () => {
  assert.equal(getOrderListBadgeColor(ORDER_STATUS.EXAMINE_PASS), '#04caa2')
  assert.equal(getOrderListBadgeColor(ORDER_STATUS.ABANDONED), '#ca0404')
})
