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
})

export const OPERATION_TYPE = Object.freeze({
  REFRESH: 'refresh',
  PRIMARY_ACTION: 'primary_action',
  SELECT_AMOUNT: 'select_amount',
  SELECT_TERM: 'select_term',
  RETRY: 'retry',
})

export const BROADCAST_INTERVAL_MS = 2000
