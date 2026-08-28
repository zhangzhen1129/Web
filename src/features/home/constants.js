export const PAGE_STATUS = Object.freeze({
  LOADING: 'loading',
  CONTENT: 'content',
  REFRESHING: 'refreshing',
  ERROR: 'error',
})

export const VIEW_MODE = Object.freeze({
  APPLY: 'apply',
  REVIEWING: 'reviewing',
  DISBURSING: 'disbursing',
  REPAYING: 'repaying',
  REJECTED: 'rejected',
  AVAILABLE_ONLY: 'available_only',
  ACTIVE_ONLY: 'active_only',
  PROCESSING_ONLY: 'processing_only',
  AVAILABLE_AND_ACTIVE: 'available_and_active',
})

export const HOME_MODE = Object.freeze({
  CASH_LOAN: 'cash_loan',
  MULTI_PUSH: 'multi_push',
})

const operationTypes = {
  REFRESH: 'refresh',
  PRIMARY_ACTION: 'primary_action',
  SELECT_AMOUNT: 'select_amount',
  SELECT_TERM: 'select_term',
  RETRY: 'retry',
}
Object.defineProperties(operationTypes, {
  REFRESH_CREDIT: { value: 'refresh_credit', enumerable: false },
  TOGGLE_PRODUCT_SELECTION: { value: 'toggle_product_selection', enumerable: false },
  SUBMIT_SELECTED_PRODUCTS: { value: 'submit_selected_products', enumerable: false },
})
export const OPERATION_TYPE = Object.freeze(operationTypes)

export const BROADCAST_INTERVAL_MS = 2000
