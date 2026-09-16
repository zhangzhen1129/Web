export const ACCOUNT_TYPE = Object.freeze({
  CHECKING: 0,
  SAVINGS: 1,
})

export const ACCOUNT_NUMBER_ERROR_TEXT = 'Número de cuenta del recibo con formato incorrecto'

const SAME_SAVINGS_AND_CHECKING_DIGITS = Object.freeze({
  [ACCOUNT_TYPE.CHECKING]: Object.freeze([18, 20]),
  [ACCOUNT_TYPE.SAVINGS]: Object.freeze([18, 20]),
})

const THIRTEEN_DIGITS = Object.freeze({
  [ACCOUNT_TYPE.CHECKING]: Object.freeze([13]),
  [ACCOUNT_TYPE.SAVINGS]: Object.freeze([13]),
})

const TEN_DIGITS = Object.freeze({
  [ACCOUNT_TYPE.CHECKING]: Object.freeze([10]),
  [ACCOUNT_TYPE.SAVINGS]: Object.freeze([10]),
})

const TWENTY_DIGITS = Object.freeze({
  [ACCOUNT_TYPE.CHECKING]: Object.freeze([20]),
  [ACCOUNT_TYPE.SAVINGS]: Object.freeze([20]),
})

const BCP_DIGITS = Object.freeze({
  [ACCOUNT_TYPE.CHECKING]: Object.freeze([13]),
  [ACCOUNT_TYPE.SAVINGS]: Object.freeze([14]),
})

export const BANK_OPTIONS = Object.freeze([
  Object.freeze({ code: '1', name: 'BBVA', recommended: true, arrivalText: 'Llegada en 1 hora', digitRule: SAME_SAVINGS_AND_CHECKING_DIGITS, placeholder: '18 o 20 dígitos' }),
  Object.freeze({ code: '2', name: 'Interbank', recommended: true, arrivalText: 'Llegada en 1 hora', digitRule: THIRTEEN_DIGITS, placeholder: '13 dígitos' }),
  Object.freeze({ code: '3', name: 'BCP', recommended: true, arrivalText: 'Llegada en 1 hora', digitRule: BCP_DIGITS }),
  Object.freeze({ code: '4', name: 'Scotiabank', recommended: true, arrivalText: 'Llegada en 1 hora', digitRule: TEN_DIGITS, placeholder: '10 dígitos' }),
  Object.freeze({ code: '13', name: 'Banco de la Nacion', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
  Object.freeze({ code: '6', name: 'BanBif', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
  Object.freeze({ code: '7', name: 'Banco Santander', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
  Object.freeze({ code: '9', name: 'Banco de Comercio', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
  Object.freeze({ code: '11', name: 'Banco GNB', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
  Object.freeze({ code: '12', name: 'Citibank', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
  Object.freeze({ code: '14', name: 'CMAC Trujillo', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
  Object.freeze({ code: '17', name: 'CMAC Sullana', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
  Object.freeze({ code: '18', name: 'CMAC Cusco', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
  Object.freeze({ code: '19', name: 'CMAC Huancayo', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
  Object.freeze({ code: '20', name: 'Caja Metropolitana', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
  Object.freeze({ code: '21', name: 'Banco Pichincha', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
  Object.freeze({ code: '22', name: 'Banco Azteca', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
  Object.freeze({ code: '23', name: 'Banco Cencosud', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
  Object.freeze({ code: '24', name: 'ICBC PERU BANK', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
  Object.freeze({ code: '25', name: 'Caja Maynas', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
  Object.freeze({ code: '26', name: 'Caja Municipal Ica', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
  Object.freeze({ code: '27', name: 'Caja Tacna', recommended: false, arrivalText: '', digitRule: TWENTY_DIGITS }),
])

export const BANK_OPTION_BY_CODE = Object.freeze(Object.fromEntries(
  BANK_OPTIONS.map((bank) => [bank.code, bank]),
))

export const BANK_OPTION_BY_NAME = Object.freeze(Object.fromEntries(
  BANK_OPTIONS.map((bank) => [bank.name, bank]),
))
