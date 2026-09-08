export const HOME_PAGE_STATUS = Object.freeze({
  LOADING: 'loading',
  CONTENT: 'content',
  REFRESHING: 'refreshing',
  ERROR: 'error',
})

export const HOME_MODE = Object.freeze({
  CASH_LOAN: 'cash_loan',
  MULTI_PUSH: 'multi_push',
})

export const CASH_VIEW_MODE = Object.freeze({
  APPLY: 'apply',
  REVIEWING: 'reviewing',
  DISBURSING: 'disbursing',
  REPAYING: 'repaying',
  REJECTED: 'rejected',
})

export const MULTI_PUSH_VARIANT = Object.freeze({
  AVAILABLE_ONLY: 'available_only',
  ACTIVE_ONLY: 'active_only',
  PROCESSING_ONLY: 'processing_only',
  AVAILABLE_AND_ACTIVE: 'available_and_active',
})

export const HOME_OPERATION_TYPE = Object.freeze({
  REFRESH: 'refresh',
  REFRESH_CREDIT: 'refresh_credit',
  OPEN_PRODUCT_DIALOG: 'open_product_dialog',
  PRIMARY_ACTION: 'primary_action',
  SELECT_AMOUNT: 'select_amount',
  SELECT_TERM: 'select_term',
  TOGGLE_PRODUCT_SELECTION: 'toggle_product_selection',
  SUBMIT_SELECTED_PRODUCTS: 'submit_selected_products',
  SELECT_TAB: 'select_tab',
})

const identifierPattern = /^[A-Za-z0-9_-]{1,64}$/
const pageStatuses = new Set(Object.values(HOME_PAGE_STATUS))
const homeModes = new Set(Object.values(HOME_MODE))
const cashViewModes = new Set(Object.values(CASH_VIEW_MODE))
const multiPushVariants = new Set(Object.values(MULTI_PUSH_VARIANT))
const operationTypes = new Set(Object.values(HOME_OPERATION_TYPE))
const tabKeys = new Set(['home', 'repayment', 'account'])
const stepResourceKeys = new Set(['step-1', 'step-2', 'step-3'])
const tabResourceKeys = new Set(['home', 'repayment', 'account'])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function issue(issues, path, code) {
  issues.push({ path, code })
}

function exactRecord(value, allowedKeys, path, issues) {
  if (!isRecord(value)) {
    issue(issues, path, 'invalid_type')
    return false
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) issue(issues, `${path}.${key}`, 'unknown_field')
  }
  return true
}

function requiredString(value, path, issues, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) issue(issues, path, 'invalid_string')
}

function optionalString(value, path, issues, allowEmpty = false) {
  if (value !== undefined) requiredString(value, path, issues, allowEmpty)
}

function identifier(value, path, issues) {
  if (typeof value !== 'string' || !identifierPattern.test(value)) issue(issues, path, 'invalid_identifier')
}

function booleanValue(value, path, issues) {
  if (typeof value !== 'boolean') issue(issues, path, 'invalid_boolean')
}

function arrayValue(value, path, issues, validateItem, minimum = 0) {
  if (!Array.isArray(value)) {
    issue(issues, path, 'invalid_array')
    return false
  }
  if (value.length < minimum) issue(issues, path, 'insufficient_items')
  value.forEach((item, index) => validateItem(item, `${path}[${index}]`, issues))
  return true
}

function uniqueField(items, field, path, issues) {
  if (!Array.isArray(items)) return
  const values = new Set()
  items.forEach((item, index) => {
    if (!isRecord(item) || typeof item[field] !== 'string') return
    if (values.has(item[field])) issue(issues, `${path}[${index}].${field}`, 'duplicate_value')
    values.add(item[field])
  })
}

function validateStep(value, path, issues) {
  if (!exactRecord(value, new Set(['key', 'text', 'iconResourceKey']), path, issues)) return
  requiredString(value.key, `${path}.key`, issues)
  requiredString(value.text, `${path}.text`, issues)
  optionalString(value.iconResourceKey, `${path}.iconResourceKey`, issues)
  if (value.iconResourceKey !== undefined && !stepResourceKeys.has(value.iconResourceKey)) {
    issue(issues, `${path}.iconResourceKey`, 'unknown_resource_key')
  }
}

function validateBroadcast(value, path, issues) {
  if (!exactRecord(value, new Set(['items']), path, issues)) return
  const validArray = arrayValue(value.items, `${path}.items`, issues, (item, itemPath, nestedIssues) => {
    if (!exactRecord(item, new Set(['key', 'text']), itemPath, nestedIssues)) return
    requiredString(item.key, `${itemPath}.key`, nestedIssues)
    requiredString(item.text, `${itemPath}.text`, nestedIssues)
  })
  if (validArray && value.items.length !== 6) issue(issues, `${path}.items`, 'invalid_item_count')
  uniqueField(value.items, 'key', `${path}.items`, issues)
}

function validateCreditSummary(value, path, issues) {
  const keys = new Set([
    'availableLabelText',
    'availableText',
    'totalLabelText',
    'totalText',
    'usedLabelText',
    'usedText',
    'locked',
    'refreshEnabled',
  ])
  if (!exactRecord(value, keys, path, issues)) return
  for (const key of ['availableLabelText', 'availableText', 'totalLabelText', 'totalText', 'usedLabelText', 'usedText']) {
    requiredString(value[key], `${path}.${key}`, issues)
  }
  booleanValue(value.locked, `${path}.locked`, issues)
  if (hasOwn(value, 'refreshEnabled')) booleanValue(value.refreshEnabled, `${path}.refreshEnabled`, issues)
}

function validateSelectOption(value, path, issues) {
  if (!exactRecord(value, new Set(['key', 'text', 'disabled']), path, issues)) return
  requiredString(value.key, `${path}.key`, issues)
  requiredString(value.text, `${path}.text`, issues)
  booleanValue(value.disabled, `${path}.disabled`, issues)
}

function validateSelection(value, path, issues) {
  const keys = new Set(['amountOptions', 'selectedAmountKey', 'termOptions', 'selectedTermKey'])
  if (!exactRecord(value, keys, path, issues)) return
  for (const [optionsKey, selectedKey] of [['amountOptions', 'selectedAmountKey'], ['termOptions', 'selectedTermKey']]) {
    if (hasOwn(value, optionsKey)) {
      arrayValue(value[optionsKey], `${path}.${optionsKey}`, issues, validateSelectOption, 1)
      uniqueField(value[optionsKey], 'key', `${path}.${optionsKey}`, issues)
    }
    if (hasOwn(value, selectedKey)) requiredString(value[selectedKey], `${path}.${selectedKey}`, issues)
    if (hasOwn(value, optionsKey) !== hasOwn(value, selectedKey)) issue(issues, `${path}.${selectedKey}`, 'selection_pair_required')
    if (Array.isArray(value[optionsKey]) && typeof value[selectedKey] === 'string') {
      if (!value[optionsKey].some((option) => isRecord(option) && option.key === value[selectedKey])) {
        issue(issues, `${path}.${selectedKey}`, 'selection_not_found')
      }
    }
  }
}

function validatePrimaryAction(value, path, issues) {
  if (!exactRecord(value, new Set(['text', 'enabled', 'loading', 'supportingText', 'badgeText']), path, issues)) return
  requiredString(value.text, `${path}.text`, issues)
  booleanValue(value.enabled, `${path}.enabled`, issues)
  booleanValue(value.loading, `${path}.loading`, issues)
  optionalString(value.supportingText, `${path}.supportingText`, issues)
  optionalString(value.badgeText, `${path}.badgeText`, issues)
}

function validateCashViewData(value, path, issues) {
  const keys = new Set(['steps', 'broadcast', 'creditSummary', 'productSelection', 'primaryAction'])
  if (!exactRecord(value, keys, path, issues)) return
  if (hasOwn(value, 'steps')) {
    arrayValue(value.steps, `${path}.steps`, issues, validateStep)
    uniqueField(value.steps, 'key', `${path}.steps`, issues)
  }
  if (hasOwn(value, 'broadcast')) validateBroadcast(value.broadcast, `${path}.broadcast`, issues)
  if (hasOwn(value, 'creditSummary')) validateCreditSummary(value.creditSummary, `${path}.creditSummary`, issues)
  if (hasOwn(value, 'productSelection')) validateSelection(value.productSelection, `${path}.productSelection`, issues)
  if (hasOwn(value, 'creditSummary') === hasOwn(value, 'productSelection')) issue(issues, path, 'amount_source_required')
  if (!hasOwn(value, 'primaryAction')) issue(issues, `${path}.primaryAction`, 'required_field')
  else validatePrimaryAction(value.primaryAction, `${path}.primaryAction`, issues)
}

function isAbsoluteSafeHttpsUrl(value) {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function validateProduct(value, path, issues) {
  const keys = new Set([
    'productId',
    'iconUrl',
    'name',
    'loanAmountText',
    'dueDateText',
    'isReloan',
    'selectable',
    'selected',
  ])
  if (!exactRecord(value, keys, path, issues)) return
  for (const key of ['productId', 'iconUrl', 'name', 'loanAmountText', 'dueDateText']) {
    requiredString(value[key], `${path}.${key}`, issues)
  }
  if (!isAbsoluteSafeHttpsUrl(value.iconUrl)) issue(issues, `${path}.iconUrl`, 'invalid_https_url')
  booleanValue(value.isReloan, `${path}.isReloan`, issues)
  booleanValue(value.selectable, `${path}.selectable`, issues)
  booleanValue(value.selected, `${path}.selected`, issues)
  if (value.selectable === false && value.selected === true) issue(issues, `${path}.selected`, 'unselectable_product_selected')
}

function validateProductSummary(value, path, issues) {
  if (!exactRecord(value, new Set(['countTextTemplate']), path, issues)) return
  requiredString(value.countTextTemplate, `${path}.countTextTemplate`, issues)
  if (typeof value.countTextTemplate === 'string') {
    const placeholders = value.countTextTemplate.match(/\{count\}/g) ?? []
    if (placeholders.length !== 1) issue(issues, `${path}.countTextTemplate`, 'invalid_count_placeholder')
  }
}

function validateMultiPushViewData(value, path, issues) {
  const keys = new Set([
    'variant',
    'steps',
    'broadcast',
    'creditSummary',
    'products',
    'minimumSelectionCount',
    'productSummary',
    'primaryAction',
  ])
  if (!exactRecord(value, keys, path, issues)) return
  if (!multiPushVariants.has(value.variant)) issue(issues, `${path}.variant`, 'invalid_enum')
  if (hasOwn(value, 'steps')) {
    arrayValue(value.steps, `${path}.steps`, issues, validateStep)
    uniqueField(value.steps, 'key', `${path}.steps`, issues)
  }
  if (hasOwn(value, 'broadcast')) validateBroadcast(value.broadcast, `${path}.broadcast`, issues)
  if (hasOwn(value, 'creditSummary')) validateCreditSummary(value.creditSummary, `${path}.creditSummary`, issues)
  if (!hasOwn(value, 'primaryAction')) issue(issues, `${path}.primaryAction`, 'required_field')
  else validatePrimaryAction(value.primaryAction, `${path}.primaryAction`, issues)

  const products = hasOwn(value, 'products') ? value.products : []
  if (hasOwn(value, 'products')) {
    arrayValue(products, `${path}.products`, issues, validateProduct)
    uniqueField(products, 'productId', `${path}.products`, issues)
  }
  const hasProducts = Array.isArray(products) && products.length > 0
  if (!Number.isInteger(value.minimumSelectionCount) || ![0, 1].includes(value.minimumSelectionCount)) {
    issue(issues, `${path}.minimumSelectionCount`, 'invalid_selection_minimum')
  }
  if (hasProducts) {
    if (value.minimumSelectionCount !== 1) issue(issues, `${path}.minimumSelectionCount`, 'product_minimum_mismatch')
    if (!products.some((product) => isRecord(product) && product.selectable === true)) issue(issues, `${path}.products`, 'selectable_product_required')
    if (products.filter((product) => isRecord(product) && product.selected === true).length < 1) issue(issues, `${path}.products`, 'selected_product_required')
    if (!hasOwn(value, 'productSummary')) issue(issues, `${path}.productSummary`, 'required_field')
  } else {
    if (value.minimumSelectionCount !== 0) issue(issues, `${path}.minimumSelectionCount`, 'empty_product_minimum_mismatch')
    if (value.variant === MULTI_PUSH_VARIANT.ACTIVE_ONLY) {
      if (!hasOwn(value, 'productSummary')) issue(issues, `${path}.productSummary`, 'required_field')
    } else if (hasOwn(value, 'productSummary')) {
      issue(issues, `${path}.productSummary`, 'unexpected_field')
    }
  }
  if (hasOwn(value, 'productSummary')) validateProductSummary(value.productSummary, `${path}.productSummary`, issues)
}

function validateTabs(value, path, issues) {
  const validArray = arrayValue(value, path, issues, (tab, tabPath, nestedIssues) => {
    if (!exactRecord(tab, new Set(['key', 'text', 'iconResourceKey', 'active', 'enabled']), tabPath, nestedIssues)) return
    if (!tabKeys.has(tab.key)) issue(nestedIssues, `${tabPath}.key`, 'invalid_enum')
    requiredString(tab.text, `${tabPath}.text`, nestedIssues)
    requiredString(tab.iconResourceKey, `${tabPath}.iconResourceKey`, nestedIssues)
    if (!tabResourceKeys.has(tab.iconResourceKey)) issue(nestedIssues, `${tabPath}.iconResourceKey`, 'unknown_resource_key')
    booleanValue(tab.active, `${tabPath}.active`, nestedIssues)
    booleanValue(tab.enabled, `${tabPath}.enabled`, nestedIssues)
  }, 2)
  if (!validArray) return
  uniqueField(value, 'key', path, issues)
  for (const key of ['home', 'account']) {
    if (!value.some((tab) => isRecord(tab) && tab.key === key)) issue(issues, path, `missing_${key}_tab`)
  }
  if (value.filter((tab) => isRecord(tab) && tab.active === true).length > 1) issue(issues, path, 'multiple_active_tabs')
}

function validateNotice(value, path, issues) {
  if (!exactRecord(value, new Set(['noticeId', 'text']), path, issues)) return
  requiredString(value.noticeId, `${path}.noticeId`, issues)
  requiredString(value.text, `${path}.text`, issues, true)
}

export function validateHomeViewPayload(payload) {
  const issues = []
  const keys = new Set([
    'requestId',
    'revision',
    'sourceOperationId',
    'pageStatus',
    'homeMode',
    'viewMode',
    'viewData',
    'multiPushViewData',
    'tabs',
    'errorData',
    'toastNotice',
    'overlayNotice',
    'productDialogVisible',
    'submissionOverlay',
  ])
  if (!exactRecord(payload, keys, 'payload', issues)) return issues
  identifier(payload.requestId, 'payload.requestId', issues)
  if (!Number.isSafeInteger(payload.revision) || payload.revision < 0) issue(issues, 'payload.revision', 'invalid_revision')
  if (hasOwn(payload, 'sourceOperationId')) identifier(payload.sourceOperationId, 'payload.sourceOperationId', issues)
  if (!pageStatuses.has(payload.pageStatus)) issue(issues, 'payload.pageStatus', 'invalid_enum')
  if (!hasOwn(payload, 'tabs')) issue(issues, 'payload.tabs', 'required_field')
  else validateTabs(payload.tabs, 'payload.tabs', issues)
  if (hasOwn(payload, 'toastNotice')) validateNotice(payload.toastNotice, 'payload.toastNotice', issues)
  if (hasOwn(payload, 'overlayNotice')) validateNotice(payload.overlayNotice, 'payload.overlayNotice', issues)
  if (payload.toastNotice?.noticeId && payload.toastNotice.noticeId === payload.overlayNotice?.noticeId) {
    issue(issues, 'payload.overlayNotice.noticeId', 'duplicate_notice_id')
  }

  const hasContent = payload.pageStatus === HOME_PAGE_STATUS.CONTENT || payload.pageStatus === HOME_PAGE_STATUS.REFRESHING
  if (hasContent) {
    if (!homeModes.has(payload.homeMode)) issue(issues, 'payload.homeMode', 'invalid_enum')
    if (payload.homeMode === HOME_MODE.CASH_LOAN) {
      if (!cashViewModes.has(payload.viewMode)) issue(issues, 'payload.viewMode', 'invalid_enum')
      if (!hasOwn(payload, 'viewData')) issue(issues, 'payload.viewData', 'required_field')
      else validateCashViewData(payload.viewData, 'payload.viewData', issues)
      const localLimitModes = new Set([CASH_VIEW_MODE.REVIEWING, CASH_VIEW_MODE.REJECTED])
      const apiAvailableModes = new Set([CASH_VIEW_MODE.DISBURSING, CASH_VIEW_MODE.REPAYING])
      if (localLimitModes.has(payload.viewMode) && !hasOwn(payload.viewData, 'productSelection')) {
        issue(issues, 'payload.viewData.productSelection', 'required_for_view_mode')
      }
      if (apiAvailableModes.has(payload.viewMode) && !hasOwn(payload.viewData, 'creditSummary')) {
        issue(issues, 'payload.viewData.creditSummary', 'required_for_view_mode')
      }
      for (const key of ['multiPushViewData', 'errorData']) {
        if (hasOwn(payload, key)) issue(issues, `payload.${key}`, 'unexpected_field')
      }
    } else if (payload.homeMode === HOME_MODE.MULTI_PUSH) {
      if (hasOwn(payload, 'viewMode')) issue(issues, 'payload.viewMode', 'unexpected_field')
      if (!hasOwn(payload, 'multiPushViewData')) issue(issues, 'payload.multiPushViewData', 'required_field')
      else validateMultiPushViewData(payload.multiPushViewData, 'payload.multiPushViewData', issues)
      for (const key of ['viewData', 'errorData']) {
        if (hasOwn(payload, key)) issue(issues, `payload.${key}`, 'unexpected_field')
      }
      if (hasOwn(payload, 'productDialogVisible')) booleanValue(payload.productDialogVisible, 'payload.productDialogVisible', issues)
      if (hasOwn(payload, 'submissionOverlay')) {
        if (exactRecord(payload.submissionOverlay, new Set(['phase', 'operationId']), 'payload.submissionOverlay', issues)) {
          const phases = new Set(['collecting', 'uploading', 'pre_applying', 'applying'])
          if (!phases.has(payload.submissionOverlay.phase)) issue(issues, 'payload.submissionOverlay.phase', 'invalid_enum')
          identifier(payload.submissionOverlay.operationId, 'payload.submissionOverlay.operationId', issues)
          if (payload.submissionOverlay.operationId !== payload.sourceOperationId) {
            issue(issues, 'payload.submissionOverlay.operationId', 'source_operation_mismatch')
          }
        }
      }
    }
  } else {
    if (hasOwn(payload, 'homeMode') && !homeModes.has(payload.homeMode)) issue(issues, 'payload.homeMode', 'invalid_enum')
    for (const key of ['viewMode', 'viewData', 'multiPushViewData']) {
      if (hasOwn(payload, key)) issue(issues, `payload.${key}`, 'unexpected_field')
    }
    for (const key of ['productDialogVisible', 'submissionOverlay']) {
      if (hasOwn(payload, key)) issue(issues, `payload.${key}`, 'unexpected_field')
    }
    if (payload.pageStatus === HOME_PAGE_STATUS.ERROR) {
      if (hasOwn(payload, 'errorData')) {
        if (exactRecord(payload.errorData, new Set(['messageText']), 'payload.errorData', issues)) {
          requiredString(payload.errorData.messageText, 'payload.errorData.messageText', issues)
        }
      }
    } else if (hasOwn(payload, 'errorData')) {
      issue(issues, 'payload.errorData', 'unexpected_field')
    }
  }
  return issues
}

function validateOperationData(operation, issues) {
  const hasData = hasOwn(operation, 'data')
  if (operation.type === HOME_OPERATION_TYPE.PRIMARY_ACTION) {
    if (!hasData) return
    if (!exactRecord(operation.data, new Set(['amountKey', 'termKey']), 'operation.data', issues)) return
    optionalString(operation.data.amountKey, 'operation.data.amountKey', issues)
    optionalString(operation.data.termKey, 'operation.data.termKey', issues)
    if (!hasOwn(operation.data, 'amountKey') && !hasOwn(operation.data, 'termKey')) issue(issues, 'operation.data', 'empty_data')
    return
  }
  if (operation.type === HOME_OPERATION_TYPE.OPEN_PRODUCT_DIALOG) {
    if (hasData) issue(issues, 'operation.data', 'unexpected_field')
    return
  }
  const keyedOperations = new Map([
    [HOME_OPERATION_TYPE.SELECT_AMOUNT, ['amountKey']],
    [HOME_OPERATION_TYPE.SELECT_TERM, ['termKey']],
    [HOME_OPERATION_TYPE.SELECT_TAB, ['tabKey']],
  ])
  if (keyedOperations.has(operation.type)) {
    const [key] = keyedOperations.get(operation.type)
    if (!hasData || !exactRecord(operation.data, new Set([key]), 'operation.data', issues)) {
      if (!hasData) issue(issues, 'operation.data', 'required_field')
      return
    }
    requiredString(operation.data[key], `operation.data.${key}`, issues)
    if (operation.type === HOME_OPERATION_TYPE.SELECT_TAB && !tabKeys.has(operation.data[key])) {
      issue(issues, `operation.data.${key}`, 'invalid_enum')
    }
    return
  }
  if (operation.type === HOME_OPERATION_TYPE.TOGGLE_PRODUCT_SELECTION) {
    if (!hasData || !exactRecord(operation.data, new Set(['productId', 'selected']), 'operation.data', issues)) {
      if (!hasData) issue(issues, 'operation.data', 'required_field')
      return
    }
    requiredString(operation.data.productId, 'operation.data.productId', issues)
    booleanValue(operation.data.selected, 'operation.data.selected', issues)
    return
  }
  if (operation.type === HOME_OPERATION_TYPE.SUBMIT_SELECTED_PRODUCTS) {
    if (!hasData || !exactRecord(operation.data, new Set(['productIds']), 'operation.data', issues)) {
      if (!hasData) issue(issues, 'operation.data', 'required_field')
      return
    }
    arrayValue(operation.data.productIds, 'operation.data.productIds', issues, requiredString, 1)
    if (Array.isArray(operation.data.productIds) && new Set(operation.data.productIds).size !== operation.data.productIds.length) {
      issue(issues, 'operation.data.productIds', 'duplicate_value')
    }
    return
  }
  if (hasData) issue(issues, 'operation.data', 'unexpected_field')
}

export function validateHomeOperation(operation) {
  const issues = []
  if (!exactRecord(operation, new Set(['requestId', 'type', 'data']), 'operation', issues)) return issues
  identifier(operation.requestId, 'operation.requestId', issues)
  if (!operationTypes.has(operation.type)) issue(issues, 'operation.type', 'invalid_enum')
  validateOperationData(operation, issues)
  return issues
}

export function cloneHomeValue(value) {
  if (Array.isArray(value)) return value.map(cloneHomeValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneHomeValue(item)]))
}
