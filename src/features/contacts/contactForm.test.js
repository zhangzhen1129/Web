import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildContactsPayload,
  createEmptyContacts,
  isCompleteContactsForm,
  isDuplicatePhoneNumber,
  isValidPhoneNumber,
  normalizePhoneNumber,
  RELATIONSHIPS,
} from './contactForm.js'

function completeContacts() {
  return {
    contact1: { relationship: RELATIONSHIPS[0], phoneNumber: '123456789', name: '  Ana  ' },
    contact2: { relationship: RELATIONSHIPS[4], phoneNumber: '123456789012', name: 'Luis' },
  }
}

test('keeps the five documented relationship values in display and submit order', () => {
  assert.deepEqual(RELATIONSHIPS, [
    'Padre/Madre',
    'sposo/ Esposa',
    'Hijo/ Hija',
    'Amigo',
    'Hermanos',
  ])
})

test('normalizes only ordinary spaces and validates the inclusive length boundary', () => {
  assert.equal(normalizePhoneNumber('12 34\t56-789'), '1234\t56-789')
  assert.equal(isValidPhoneNumber('12345678'), false)
  assert.equal(isValidPhoneNumber('123456789'), true)
  assert.equal(isValidPhoneNumber('123456789012'), true)
  assert.equal(isValidPhoneNumber('1234567890123'), false)
  assert.equal(isValidPhoneNumber('1234-6789'), true)
})

test('keeps both contact groups independent and rejects any saved duplicate', () => {
  const contacts = completeContacts()
  assert.equal(isCompleteContactsForm(contacts), true)
  assert.equal(isDuplicatePhoneNumber(contacts, contacts.contact1.phoneNumber), true)
  assert.equal(isDuplicatePhoneNumber(contacts, contacts.contact2.phoneNumber), true)
  assert.equal(isDuplicatePhoneNumber(contacts, '999999999'), false)
  assert.equal(isCompleteContactsForm({ ...contacts, contact2: { ...contacts.contact2, phoneNumber: contacts.contact1.phoneNumber } }), false)
  assert.equal(isCompleteContactsForm(createEmptyContacts()), false)
})

test('builds exactly two ordered contact objects with direct relationship values', () => {
  assert.deepEqual(buildContactsPayload(completeContacts()), [
    { relation: 'Padre/Madre', mobile: '123456789', name: 'Ana' },
    { relation: 'Hermanos', mobile: '123456789012', name: 'Luis' },
  ])
  assert.equal(buildContactsPayload({ ...completeContacts(), contact1: { ...completeContacts().contact1, relationship: 'parent' } }), null)
})
