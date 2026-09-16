import assert from 'node:assert/strict'
import test from 'node:test'
import { ACCOUNT_TYPE } from './bankData.js'
import {
  canReusePrefilledAccount,
  getAccountNumberError,
  getAccountNumberLabel,
  getAccountNumberPlaceholder,
  getBankByName,
  isAccountNumberValid,
  isSubmitEnabled,
  normalizeAccountNumber,
} from './bankForm.js'

test('normalizes account input to digits and validates the selected bank rule', () => {
  assert.equal(normalizeAccountNumber('12 34-ab'), '1234')
  assert.equal(isAccountNumberValid(getBankByName('Interbank'), ACCOUNT_TYPE.SAVINGS, '1234567890123'), true)
  assert.equal(isAccountNumberValid(getBankByName('Interbank'), ACCOUNT_TYPE.SAVINGS, '123'), false)
  assert.equal(isAccountNumberValid(getBankByName('BCP'), ACCOUNT_TYPE.CHECKING, '1234567890123'), true)
  assert.equal(isAccountNumberValid(getBankByName('BCP'), ACCOUNT_TYPE.SAVINGS, '12345678901234'), true)
})

test('derives visible account labels and format hints without duplicating the bank table', () => {
  assert.equal(getAccountNumberLabel(getBankByName('BBVA')), 'Número de cuenta')
  assert.equal(getAccountNumberLabel(getBankByName('Banco de la Nacion')), 'Número de cuenta CCI')
  assert.equal(getAccountNumberPlaceholder(getBankByName('BBVA'), ACCOUNT_TYPE.SAVINGS), 'Ingrese 18 o 20 dígitos')
  assert.equal(getAccountNumberError(getBankByName('Scotiabank'), ACCOUNT_TYPE.SAVINGS), 'Ingrese 10 dígitos.')
})

test('enables submit from visible fields and reuses only an exact prefilled bank and account', () => {
  const bank = getBankByName('BBVA')
  assert.equal(isSubmitEnabled({ bank, accountNumber: '123', recipientName: 'Ana' }), true)
  assert.equal(isSubmitEnabled({ bank, accountNumber: '', recipientName: 'Ana' }), false)
  assert.equal(isSubmitEnabled({ bank, accountNumber: '123', recipientName: ' ' }), false)

  const snapshot = Object.freeze({ id: 'account-1', bankName: 'BBVA', accountNumber: '123' })
  assert.equal(canReusePrefilledAccount({ prefillSnapshot: snapshot, bank, accountNumber: '123' }), true)
  assert.equal(canReusePrefilledAccount({ prefillSnapshot: snapshot, bank, accountNumber: '124' }), false)
  assert.equal(canReusePrefilledAccount({ prefillSnapshot: snapshot, bank: getBankByName('Interbank'), accountNumber: '123' }), false)
})
