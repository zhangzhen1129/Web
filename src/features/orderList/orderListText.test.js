import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ORDER_LIST_TEXT,
  getOrderCardAmountLabel,
  getOrderCardDateLabel,
  getOrderStatusText,
} from './orderListText.js'

test('maps every confirmed order status to the project message for the active language', () => {
  const expected = {
    10: 'Pendiente de aplicar',
    20: 'Revisando',
    21: 'Revisando',
    30: 'Aprobado',
    40: 'Rechazado',
    70: 'Desembolsando',
    80: 'Reembolsando',
    90: 'Atrasado',
    100: 'Completado',
    101: 'Completado',
    110: 'Fracaso',
  }

  for (const [status, text] of Object.entries(expected)) {
    assert.equal(getOrderStatusText(Number(status)), text, `status ${status}`)
  }
})

test('selects the order status label by language', () => {
  assert.equal(getOrderStatusText(30, 'en'), 'Approved')
  assert.equal(getOrderStatusText(30, 'es'), 'Aprobado')
  assert.equal(getOrderStatusText(30, 'sw'), '')
})

test('does not map unknown order statuses to a label', () => {
  assert.equal(getOrderStatusText(55), '')
  assert.equal(getOrderStatusText('80'), '')
  assert.equal(getOrderStatusText(null), '')
})

test('maps amount and date labels from the card mode', () => {
  assert.equal(getOrderCardAmountLabel('application'), 'Importe de préstamo')
  assert.equal(getOrderCardDateLabel('application'), 'Fecha de aplicación')
  assert.equal(getOrderCardAmountLabel('repayment'), 'Monto a pagar')
  assert.equal(getOrderCardDateLabel('repayment'), 'Fecha de vencimiento')
  assert.equal(getOrderCardAmountLabel('completed'), 'Monto a pagar')
  assert.equal(getOrderCardDateLabel('completed'), 'Fecha de vencimiento')
  assert.equal(getOrderCardAmountLabel('unknown'), '')
  assert.equal(getOrderCardDateLabel('unknown'), '')
})

test('keeps the fixed controlled error text', () => {
  assert.equal(ORDER_LIST_TEXT.error.message, 'error')
})
