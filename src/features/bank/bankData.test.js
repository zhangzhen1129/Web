import assert from 'node:assert/strict'
import test from 'node:test'
import { ACCOUNT_TYPE, BANK_OPTIONS } from './bankData.js'
import { getAllowedDigits, getBankByName } from './bankForm.js'

test('keeps the confirmed bank catalog in one controlled data module', () => {
  assert.equal(BANK_OPTIONS.length, 22)
  assert.equal(new Set(BANK_OPTIONS.map((bank) => bank.code)).size, 22)
  assert.deepEqual(BANK_OPTIONS.filter((bank) => bank.recommended).map((bank) => bank.name), ['BBVA', 'Interbank', 'BCP', 'Scotiabank'])
})

test('derives account digit rules from the controlled bank data', () => {
  assert.deepEqual(getAllowedDigits(getBankByName('BBVA'), ACCOUNT_TYPE.SAVINGS), [18, 20])
  assert.deepEqual(getAllowedDigits(getBankByName('Interbank'), ACCOUNT_TYPE.CHECKING), [13])
  assert.deepEqual(getAllowedDigits(getBankByName('BCP'), ACCOUNT_TYPE.CHECKING), [13])
  assert.deepEqual(getAllowedDigits(getBankByName('BCP'), ACCOUNT_TYPE.SAVINGS), [14])
  assert.deepEqual(getAllowedDigits(getBankByName('Scotiabank'), ACCOUNT_TYPE.SAVINGS), [10])
  assert.deepEqual(getAllowedDigits(getBankByName('Banco de la Nacion'), ACCOUNT_TYPE.SAVINGS), [20])
})
