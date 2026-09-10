export const CONTACT_KEYS = Object.freeze(['contact1', 'contact2'])

export const RELATIONSHIPS = Object.freeze([
  'Padre/Madre',
  'sposo/ Esposa',
  'Hijo/ Hija',
  'Amigo',
  'Hermanos',
])

export function createEmptyContacts() {
  return Object.freeze({
    contact1: Object.freeze({ relationship: '', phoneNumber: '', name: '' }),
    contact2: Object.freeze({ relationship: '', phoneNumber: '', name: '' }),
  })
}

export function isContactKey(value) {
  return CONTACT_KEYS.includes(value)
}

export function isValidRelationship(value) {
  return RELATIONSHIPS.includes(value)
}

export function normalizePhoneNumber(value) {
  return typeof value === 'string' ? value.replaceAll(' ', '') : ''
}

export function isValidPhoneNumber(value) {
  return typeof value === 'string' && value.length >= 9 && value.length <= 12
}

export function normalizeContactName(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function isCompleteContactsForm(contacts) {
  return CONTACT_KEYS.every((key) => {
    const contact = contacts?.[key]
    return isValidRelationship(contact?.relationship)
      && isValidPhoneNumber(contact?.phoneNumber)
      && normalizeContactName(contact?.name).length > 0
  }) && contacts.contact1.phoneNumber !== contacts.contact2.phoneNumber
}

export function isDuplicatePhoneNumber(contacts, candidate) {
  return CONTACT_KEYS.some((key) => contacts?.[key]?.phoneNumber === candidate)
}

export function buildContactsPayload(contacts) {
  if (!isCompleteContactsForm(contacts)) return null
  return CONTACT_KEYS.map((key) => Object.freeze({
    relation: contacts[key].relationship,
    mobile: contacts[key].phoneNumber,
    name: normalizeContactName(contacts[key].name),
  }))
}
