import assert from 'node:assert/strict'
import test from 'node:test'

import { getProjectMessage } from '../../shared/config/projectLanguage.js'
import { CHANGE_PASSWORD_TEXT } from './changePasswordText.js'

test('uses the configured message ids for the change-password toasts', () => {
  assert.equal(CHANGE_PASSWORD_TEXT.mismatch, getProjectMessage('61'))
  assert.equal(CHANGE_PASSWORD_TEXT.success, getProjectMessage('62'))
})

test('provides change-password toast text for every configured language', () => {
  assert.deepEqual([
    getProjectMessage('61', 'en'),
    getProjectMessage('61', 'es'),
    getProjectMessage('61', 'sw'),
  ], [
    'The passwords do not match.',
    'Las dos contraseñas son incoherentes',
    'Nenosiri hazifanani.',
  ])

  assert.deepEqual([
    getProjectMessage('62', 'en'),
    getProjectMessage('62', 'es'),
    getProjectMessage('62', 'sw'),
  ], [
    'Success',
    'Éxito',
    'Mafanikio',
  ])
})
