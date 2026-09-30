import { getProjectMessage } from '../../shared/config/projectLanguage.js'

export const CHANGE_PASSWORD_TEXT = Object.freeze({
  title: 'Cambiar contraseña',
  prefix: '+51',
  submit: 'Enviar',
  success: getProjectMessage('62'),
  mismatch: getProjectMessage('61'),
  labels: Object.freeze({
    mobile: 'Número de teléfono',
    oldPassword: 'Contraseña original',
    newPassword: 'Nueva contraseña',
    confirmPassword: 'Confirmar contraseña',
  }),
  placeholders: Object.freeze({
    mobile: 'Ingrese su número',
    oldPassword: 'Introduzca la contraseña original',
    newPassword: 'Introduzca una nueva contraseña',
    confirmPassword: 'Introduzca de nuevo la contraseña',
  }),
  accessibility: Object.freeze({
    back: 'Volver a la página anterior',
    showNewPassword: 'Mostrar nueva contraseña',
    hideNewPassword: 'Ocultar nueva contraseña',
    showConfirmPassword: 'Mostrar confirmación de contraseña',
    hideConfirmPassword: 'Ocultar confirmación de contraseña',
  }),
})
