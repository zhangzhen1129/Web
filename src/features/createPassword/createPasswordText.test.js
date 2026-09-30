import assert from 'node:assert/strict'
import test from 'node:test'

import { getProjectMessage } from '../../shared/config/projectLanguage.js'
import { CREATE_PASSWORD_TEXT } from './createPasswordText.js'

test('uses the current Spanish messages and live Figma labels', () => {
  assert.equal(CREATE_PASSWORD_TEXT.title, 'Crear una contraseña')
  assert.equal(CREATE_PASSWORD_TEXT.prefix, '+51')
  assert.equal(CREATE_PASSWORD_TEXT.submit, 'Enviar')
  assert.equal(CREATE_PASSWORD_TEXT.success, getProjectMessage('62'))
  assert.equal(CREATE_PASSWORD_TEXT.mismatch, getProjectMessage('61'))
  assert.deepEqual(CREATE_PASSWORD_TEXT.labels, {
    mobile: 'Número de teléfono',
    newPassword: 'Nueva contraseña',
    confirmPassword: 'Confirmar contraseña',
  })
  assert.deepEqual(CREATE_PASSWORD_TEXT.placeholders, {
    mobile: 'Ingrese su número',
    newPassword: 'Introduzca una nueva contraseña',
    confirmPassword: 'Introduzca de nuevo la contraseña',
  })
  assert.equal(Object.isFrozen(CREATE_PASSWORD_TEXT), true)
  assert.equal(Object.isFrozen(CREATE_PASSWORD_TEXT.labels), true)
  assert.equal(Object.isFrozen(CREATE_PASSWORD_TEXT.placeholders), true)
  assert.equal(Object.isFrozen(CREATE_PASSWORD_TEXT.accessibility), true)
})
