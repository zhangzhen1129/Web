import { showConfirmDialog } from 'vant'
import { useGlobalStore } from '../globalStore/globalStore.js'
import { logoutToOtpLoginNative, openGooglePlayNative } from '../bridge/index.js'

export const GLOBAL_BUSINESS_ERROR_CODES = Object.freeze({
  logout: 4005,
  googlePlay: 4006,
})

const HANDLED_CODES = new Set(Object.values(GLOBAL_BUSINESS_ERROR_CODES))
let activeDialogPromise = null

export function readGlobalBusinessError(data) {
  const code = data?.cyiUgNvO2EPltj?.atY3WWbXIN
  if (!Number.isInteger(code) || !HANDLED_CODES.has(code)) return null
  return Object.freeze({
    code,
    message: typeof data?.pl9xRlV === 'string' ? data.pl9xRlV : '',
  })
}

export function createBusinessHandledError({ code, message, protocolId = null }) {
  const error = new Error(message || 'Business request was handled globally.')
  error.name = 'BusinessHandledError'
  error.businessCode = code
  error.code = code
  error.protocolId = protocolId
  error.displayMessage = message || 'Business request was handled globally.'
  error.businessHandled = true
  return error
}

export function isBusinessHandledError(error) {
  return error?.businessHandled === true
}

function clearLoginState() {
  try {
    const store = useGlobalStore()
    if (typeof store.clearGlobal === 'function') store.clearGlobal()
  } catch {
    return
  }
}

function showBusinessDialog(message) {
  return showConfirmDialog({
    className: 'business-error-dialog',
    message: message || 'Unable to continue.',
    theme: 'round-button',
    confirmButtonText: 'OK',
    showCancelButton: false,
    closeOnClickOverlay: false,
    closeOnPopstate: false,
  })
}

export function createGlobalBusinessErrorHandler(options = {}) {
  const showDialog = options.showDialog ?? showBusinessDialog
  const clearState = options.clearState ?? clearLoginState
  const actions = options.actions ?? {
    [GLOBAL_BUSINESS_ERROR_CODES.logout]: logoutToOtpLoginNative,
    [GLOBAL_BUSINESS_ERROR_CODES.googlePlay]: openGooglePlayNative,
  }

  return Object.freeze({
    async handleResponse(response) {
      const businessError = readGlobalBusinessError(response?.data)
      if (!businessError) return response

      const handledError = createBusinessHandledError({
        code: businessError.code,
        message: businessError.message,
        protocolId: response?.config?.protocolId ?? response?.config?.meta?.protocolId ?? null,
      })

      if (!activeDialogPromise) {
        activeDialogPromise = Promise.resolve(showDialog(businessError.message))
          .then(() => {
            if (businessError.code === GLOBAL_BUSINESS_ERROR_CODES.logout) clearState()
            const action = actions[businessError.code]
            if (typeof action === 'function') action()
          })
          .catch(() => {})
          .finally(() => { activeDialogPromise = null })
      }

      throw handledError
    },
  })
}

export const globalBusinessErrorHandler = createGlobalBusinessErrorHandler()
