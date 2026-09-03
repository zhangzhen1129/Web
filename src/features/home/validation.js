import { HOME_MODE, OPERATION_TYPE, PAGE_STATUS, VIEW_MODE } from './constants.js'

const PAGE_STATUSES = new Set(Object.values(PAGE_STATUS))
const VIEW_MODES = new Set(Object.values(VIEW_MODE))
const OPERATION_TYPES = new Set([
  ...Object.values(OPERATION_TYPE),
  OPERATION_TYPE.REFRESH_CREDIT,
  OPERATION_TYPE.TOGGLE_PRODUCT_SELECTION,
  OPERATION_TYPE.SUBMIT_SELECTED_PRODUCTS,
])
const NOTICE_TONES = new Set(['info', 'success', 'warning', 'error'])
const OVERLAY_MESSAGE_IDS = new Set(['20'])
const TOAST_MESSAGE_IDS = new Set(['10'])
const REQUIRED_TAB_KEYS = new Set(['home', 'account'])
const TAB_KEYS = new Set(['home', 'repayment', 'account'])
const HOME_MODES = new Set(Object.values(HOME_MODE))
const MULTI_PUSH_ACTIONS = new Set(['apply', 'repay', 'processing'])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function addIssue(issues, path, code) {
  issues.push({ path, code })
}

function validateExactKeys(value, allowedKeys, path, issues) {
  if (!isRecord(value)) {
    addIssue(issues, path, 'invalid_type')
    return false
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      addIssue(issues, `${path}.${key}`, 'unknown_field')
    }
  }

  return true
}

function validateRequiredString(value, path, issues) {
  if (typeof value !== 'string' || value.length === 0) {
    addIssue(issues, path, 'required_string')
  }
}

function validateOptionalString(value, path, issues) {
  if (value !== undefined) {
    validateRequiredString(value, path, issues)
  }
}

function validateBoolean(value, path, issues) {
  if (typeof value !== 'boolean') {
    addIssue(issues, path, 'required_boolean')
  }
}

function validateArray(value, path, issues, itemValidator, minimum = 0) {
  if (!Array.isArray(value)) {
    addIssue(issues, path, 'required_array')
    return
  }

  if (value.length < minimum) {
    addIssue(issues, path, 'insufficient_items')
  }

  value.forEach((item, index) => itemValidator(item, `${path}[${index}]`, issues))
}

function validateUniqueKeys(items, path, issues) {
  if (!Array.isArray(items)) {
    return
  }

  const keys = new Set()
  items.forEach((item, index) => {
    if (!isRecord(item) || typeof item.key !== 'string') {
      return
    }

    if (keys.has(item.key)) {
      addIssue(issues, `${path}[${index}].key`, 'duplicate_key')
    }
    keys.add(item.key)
  })
}

function validateStep(value, path, issues) {
  if (!validateExactKeys(value, new Set(['key', 'text', 'iconResourceKey']), path, issues)) return
  validateRequiredString(value.key, `${path}.key`, issues)
  validateRequiredString(value.text, `${path}.text`, issues)
  validateOptionalString(value.iconResourceKey, `${path}.iconResourceKey`, issues)
}

function validateBroadcastItem(value, path, issues) {
  if (!validateExactKeys(value, new Set(['key', 'text']), path, issues)) return
  validateRequiredString(value.key, `${path}.key`, issues)
  validateRequiredString(value.text, `${path}.text`, issues)
}

function validateBroadcast(value, path, issues) {
  if (!validateExactKeys(value, new Set(['items']), path, issues)) return
  validateArray(value.items, `${path}.items`, issues, validateBroadcastItem, 1)
  validateUniqueKeys(value.items, `${path}.items`, issues)
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
    'refreshLabelText',
  ])
  if (!validateExactKeys(value, keys, path, issues)) return
  validateRequiredString(value.availableLabelText, `${path}.availableLabelText`, issues)
  validateRequiredString(value.availableText, `${path}.availableText`, issues)
  validateRequiredString(value.totalLabelText, `${path}.totalLabelText`, issues)
  validateRequiredString(value.totalText, `${path}.totalText`, issues)
  validateRequiredString(value.usedLabelText, `${path}.usedLabelText`, issues)
  validateRequiredString(value.usedText, `${path}.usedText`, issues)
  validateBoolean(value.locked, `${path}.locked`, issues)
  if (hasOwn(value, 'refreshEnabled')) validateBoolean(value.refreshEnabled, `${path}.refreshEnabled`, issues)
  if (hasOwn(value, 'refreshLabelText')) validateRequiredString(value.refreshLabelText, `${path}.refreshLabelText`, issues)
  if (value.refreshEnabled === true && !hasOwn(value, 'refreshLabelText')) addIssue(issues, `${path}.refreshLabelText`, 'required_field')
}

function validateSelectOption(value, path, issues) {
  if (!validateExactKeys(value, new Set(['key', 'text', 'disabled']), path, issues)) return
  validateRequiredString(value.key, `${path}.key`, issues)
  validateRequiredString(value.text, `${path}.text`, issues)
  validateBoolean(value.disabled, `${path}.disabled`, issues)
}

function validateSelectionKey(options, selectedKey, path, issues) {
  if (!Array.isArray(options) || typeof selectedKey !== 'string') return
  if (!options.some((option) => isRecord(option) && option.key === selectedKey)) {
    addIssue(issues, path, 'selection_not_found')
  }
}

function validateProductSelection(value, path, issues) {
  const keys = new Set([
    'amountLabelText',
    'amountOptions',
    'selectedAmountKey',
    'termLabelText',
    'termOptions',
    'selectedTermKey',
    'rateText',
  ])
  if (!validateExactKeys(value, keys, path, issues)) return
  validateRequiredString(value.amountLabelText, `${path}.amountLabelText`, issues)
  validateArray(value.amountOptions, `${path}.amountOptions`, issues, validateSelectOption, 1)
  validateUniqueKeys(value.amountOptions, `${path}.amountOptions`, issues)
  validateRequiredString(value.selectedAmountKey, `${path}.selectedAmountKey`, issues)
  validateSelectionKey(value.amountOptions, value.selectedAmountKey, `${path}.selectedAmountKey`, issues)
  validateRequiredString(value.termLabelText, `${path}.termLabelText`, issues)
  validateArray(value.termOptions, `${path}.termOptions`, issues, validateSelectOption, 1)
  validateUniqueKeys(value.termOptions, `${path}.termOptions`, issues)
  validateRequiredString(value.selectedTermKey, `${path}.selectedTermKey`, issues)
  validateSelectionKey(value.termOptions, value.selectedTermKey, `${path}.selectedTermKey`, issues)
  validateOptionalString(value.rateText, `${path}.rateText`, issues)
}

function validatePrimaryAction(value, path, issues) {
  if (!validateExactKeys(value, new Set(['text', 'enabled', 'loading', 'badgeText', 'supportingText']), path, issues)) return
  validateRequiredString(value.text, `${path}.text`, issues)
  validateBoolean(value.enabled, `${path}.enabled`, issues)
  validateBoolean(value.loading, `${path}.loading`, issues)
  validateOptionalString(value.badgeText, `${path}.badgeText`, issues)
  validateOptionalString(value.supportingText, `${path}.supportingText`, issues)
}

function validateStatusNotice(value, path, issues) {
  if (!validateExactKeys(value, new Set(['text', 'tone', 'stateKey']), path, issues)) return
  validateRequiredString(value.text, `${path}.text`, issues)
  if (!NOTICE_TONES.has(value.tone)) addIssue(issues, `${path}.tone`, 'invalid_enum')
  validateOptionalString(value.stateKey, `${path}.stateKey`, issues)
}

function validateOverlayNotice(value, path, issues) {
  if (!validateExactKeys(value, new Set(['noticeId', 'messageId', 'text']), path, issues)) return
  validateRequiredString(value.noticeId, `${path}.noticeId`, issues)
  validateRequiredString(value.messageId, `${path}.messageId`, issues)
  if (!OVERLAY_MESSAGE_IDS.has(value.messageId)) addIssue(issues, `${path}.messageId`, 'invalid_enum')
  validateRequiredString(value.text, `${path}.text`, issues)
}

function validateToastNotice(value, path, issues) {
  if (!validateExactKeys(value, new Set(['noticeId', 'messageId', 'text']), path, issues)) return
  validateRequiredString(value.noticeId, `${path}.noticeId`, issues)
  if (hasOwn(value, 'messageId')) {
    validateRequiredString(value.messageId, `${path}.messageId`, issues)
    if (!TOAST_MESSAGE_IDS.has(value.messageId)) addIssue(issues, `${path}.messageId`, 'invalid_enum')
  }
  validateRequiredString(value.text, `${path}.text`, issues)
}

function validateTab(value, path, issues) {
  if (!validateExactKeys(value, new Set(['key', 'text', 'iconResourceKey', 'active', 'enabled']), path, issues)) return
  if (!TAB_KEYS.has(value.key)) addIssue(issues, `${path}.key`, 'invalid_enum')
  validateRequiredString(value.text, `${path}.text`, issues)
  validateRequiredString(value.iconResourceKey, `${path}.iconResourceKey`, issues)
  validateBoolean(value.active, `${path}.active`, issues)
  validateBoolean(value.enabled, `${path}.enabled`, issues)
}

function validateTabs(value, path, issues) {
  validateArray(value, path, issues, validateTab, 2)
  validateUniqueKeys(value, path, issues)
  if (!Array.isArray(value)) return

  for (const requiredKey of REQUIRED_TAB_KEYS) {
    if (!value.some((tab) => isRecord(tab) && tab.key === requiredKey)) {
      addIssue(issues, path, `missing_${requiredKey}_tab`)
    }
  }

  if (value.filter((tab) => isRecord(tab) && tab.active === true).length !== 1) {
    addIssue(issues, path, 'invalid_active_count')
  }
}

function validateHomeViewData(value, path, issues) {
  const keys = new Set([
    'titleText',
    'steps',
    'broadcast',
    'creditSummary',
    'productSelection',
    'primaryAction',
    'statusNotice',
    'tabs',
  ])
  if (!validateExactKeys(value, keys, path, issues)) return
  validateOptionalString(value.titleText, `${path}.titleText`, issues)
  if (hasOwn(value, 'steps')) {
    validateArray(value.steps, `${path}.steps`, issues, validateStep)
    validateUniqueKeys(value.steps, `${path}.steps`, issues)
  }
  if (hasOwn(value, 'broadcast')) validateBroadcast(value.broadcast, `${path}.broadcast`, issues)
  if (hasOwn(value, 'creditSummary')) validateCreditSummary(value.creditSummary, `${path}.creditSummary`, issues)
  if (hasOwn(value, 'productSelection')) validateProductSelection(value.productSelection, `${path}.productSelection`, issues)
  if (hasOwn(value, 'creditSummary') && hasOwn(value, 'productSelection')) {
    addIssue(issues, path, 'mutually_exclusive_content')
  }
  if (!hasOwn(value, 'primaryAction')) addIssue(issues, `${path}.primaryAction`, 'required_field')
  else validatePrimaryAction(value.primaryAction, `${path}.primaryAction`, issues)
  if (hasOwn(value, 'statusNotice')) validateStatusNotice(value.statusNotice, `${path}.statusNotice`, issues)
  if (!hasOwn(value, 'tabs')) addIssue(issues, `${path}.tabs`, 'required_field')
  else validateTabs(value.tabs, `${path}.tabs`, issues)
}

function validateErrorData(value, path, issues) {
  if (!validateExactKeys(value, new Set(['messageText']), path, issues)) return
  validateRequiredString(value.messageText, `${path}.messageText`, issues)
}

function validateMultiPushProduct(value, path, issues) {
  const keys = new Set(['id', 'name', 'iconUrl', 'loanAmountText', 'dueDateText', 'minAmount', 'isReloan', 'selectable', 'selected'])
  if (!validateExactKeys(value, keys, path, issues)) return
  for (const key of ['id', 'name', 'loanAmountText', 'dueDateText']) validateRequiredString(value[key], `${path}.${key}`, issues)
  if (hasOwn(value, 'iconUrl') && (!/^https:\/\//.test(value.iconUrl) && !value.iconUrl.startsWith('/'))) addIssue(issues, `${path}.iconUrl`, 'invalid_resource_url')
  if (typeof value.minAmount !== 'number' || !Number.isFinite(value.minAmount) || value.minAmount < 0) addIssue(issues, `${path}.minAmount`, 'required_non_negative_number')
  validateBoolean(value.isReloan, `${path}.isReloan`, issues)
  if (hasOwn(value, 'selectable')) validateBoolean(value.selectable, `${path}.selectable`, issues)
  if (hasOwn(value, 'selected')) validateBoolean(value.selected, `${path}.selected`, issues)
  if (value.selected === true && value.selectable !== true) addIssue(issues, `${path}.selected`, 'selected_product_not_selectable')
}

function validateMultiPushViewData(value, path, issues) {
  const keys = new Set(['titleText', 'steps', 'broadcast', 'availableProductCount', 'activeLoanCount', 'allProcessing', 'availableAmount', 'availableLabelText', 'totalCredit', 'totalCreditLabelText', 'usedCredit', 'usedCreditLabelText', 'selectedProductCount', 'selectedMinimumAmount', 'serverRemainingAmount', 'locked', 'refreshEnabled', 'primaryButtonText', 'creditRefreshLabelText', 'primaryAction', 'statusDescription', 'products', 'minimumSelectionCount', 'selectionSubmitText', 'productSummaryText', 'productCountText', 'loanAmountLabelText', 'dueDateLabelText', 'reloanLabelText', 'tabs'])
  if (!validateExactKeys(value, keys, path, issues)) return
  for (const key of ['availableAmount', 'availableLabelText', 'totalCredit', 'totalCreditLabelText', 'usedCredit', 'usedCreditLabelText', 'primaryButtonText', 'creditRefreshLabelText']) validateRequiredString(value[key], `${path}.${key}`, issues)
  if (typeof value.statusDescription !== 'string') addIssue(issues, `${path}.statusDescription`, 'required_string')
  if (hasOwn(value, 'titleText')) validateRequiredString(value.titleText, `${path}.titleText`, issues)
  if (hasOwn(value, 'selectionSubmitText')) validateRequiredString(value.selectionSubmitText, `${path}.selectionSubmitText`, issues)
  if (hasOwn(value, 'productSummaryText')) validateRequiredString(value.productSummaryText, `${path}.productSummaryText`, issues)
  if (hasOwn(value, 'productCountText')) validateRequiredString(value.productCountText, `${path}.productCountText`, issues)
  if (hasOwn(value, 'steps')) { validateArray(value.steps, `${path}.steps`, issues, validateStep); validateUniqueKeys(value.steps, `${path}.steps`, issues) }
  if (hasOwn(value, 'broadcast')) validateBroadcast(value.broadcast, `${path}.broadcast`, issues)
  for (const key of ['availableProductCount', 'activeLoanCount']) {
    if (!Number.isInteger(value[key]) || value[key] < 0) addIssue(issues, `${path}.${key}`, 'invalid_non_negative_integer')
  }
  validateBoolean(value.allProcessing, `${path}.allProcessing`, issues)
  validateBoolean(value.locked, `${path}.locked`, issues)
  if (hasOwn(value, 'refreshEnabled')) validateBoolean(value.refreshEnabled, `${path}.refreshEnabled`, issues)
  for (const key of ['selectedMinimumAmount', 'serverRemainingAmount']) {
    if (hasOwn(value, key)) validateRequiredString(value[key], `${path}.${key}`, issues)
  }
  for (const key of ['selectedProductCount', 'minimumSelectionCount']) {
    if (hasOwn(value, key) && (!Number.isInteger(value[key]) || value[key] < 0)) addIssue(issues, `${path}.${key}`, 'invalid_non_negative_integer')
  }
  if (!MULTI_PUSH_ACTIONS.has(value.primaryAction)) addIssue(issues, `${path}.primaryAction`, 'invalid_enum')
  validateArray(value.products, `${path}.products`, issues, validateMultiPushProduct)
  validateTabs(value.tabs, `${path}.tabs`, issues)
  const hasAvailable = value.availableProductCount > 0
  const hasActive = value.activeLoanCount > 0
  if (value.primaryAction === 'repay' && !hasActive) addIssue(issues, `${path}.primaryAction`, 'repay_state_mismatch')
  if (value.primaryAction === 'processing' && (!value.allProcessing || hasAvailable || hasActive)) addIssue(issues, `${path}.primaryAction`, 'processing_state_mismatch')
  if (value.primaryAction === 'apply' && !hasAvailable && value.products.length !== 0) addIssue(issues, `${path}.primaryAction`, 'apply_state_mismatch')
  for (const key of ['loanAmountLabelText', 'dueDateLabelText', 'reloanLabelText']) {
    if (hasOwn(value, key)) validateRequiredString(value[key], `${path}.${key}`, issues)
  }
  if (value.refreshEnabled === true && value.locked !== true && !hasOwn(value, 'creditRefreshLabelText')) {
    addIssue(issues, `${path}.creditRefreshLabelText`, 'required_field')
  }
  if (hasOwn(value, 'selectedProductCount')) {
    const selectedCount = value.products.filter((product) => product.selectable === true && product.selected === true).length
    if (selectedCount !== value.selectedProductCount) addIssue(issues, `${path}.selectedProductCount`, 'selected_count_mismatch')
  }
}

function rejectPresentFields(value, fields, issues) {
  fields.forEach((field) => {
    if (hasOwn(value, field)) addIssue(issues, `payload.${field}`, 'unexpected_field')
  })
}

export function validateHomeViewPayload(payload) {
  const issues = []
  const keys = new Set(['requestId', 'sourceOperationId', 'pageStatus', 'homeMode', 'viewMode', 'viewData', 'multiPushViewData', 'errorData', 'overlayNotice', 'toastNotice'])
  if (!validateExactKeys(payload, keys, 'payload', issues)) return issues

  validateRequiredString(payload.requestId, 'payload.requestId', issues)
  validateOptionalString(payload.sourceOperationId, 'payload.sourceOperationId', issues)
  if (!PAGE_STATUSES.has(payload.pageStatus)) addIssue(issues, 'payload.pageStatus', 'invalid_enum')

  if (payload.pageStatus === PAGE_STATUS.CONTENT || payload.pageStatus === PAGE_STATUS.REFRESHING) {
    const homeMode = payload.homeMode
    if (!HOME_MODES.has(homeMode)) addIssue(issues, 'payload.homeMode', 'invalid_enum')
    if (homeMode === HOME_MODE.CASH_LOAN) {
      if (!VIEW_MODES.has(payload.viewMode)) addIssue(issues, 'payload.viewMode', 'invalid_enum')
      if (!hasOwn(payload, 'viewData')) addIssue(issues, 'payload.viewData', 'required_field')
      else validateHomeViewData(payload.viewData, 'payload.viewData', issues)
      if (hasOwn(payload, 'overlayNotice')) {
        if (payload.pageStatus === PAGE_STATUS.REFRESHING) addIssue(issues, 'payload.overlayNotice', 'unexpected_field')
        else validateOverlayNotice(payload.overlayNotice, 'payload.overlayNotice', issues)
      }
      if (hasOwn(payload, 'toastNotice')) addIssue(issues, 'payload.toastNotice', 'unexpected_field')
      rejectPresentFields(payload, ['multiPushViewData', 'errorData'], issues)
    } else if (homeMode === HOME_MODE.MULTI_PUSH) {
      if (!hasOwn(payload, 'multiPushViewData')) addIssue(issues, 'payload.multiPushViewData', 'required_field')
      else validateMultiPushViewData(payload.multiPushViewData, 'payload.multiPushViewData', issues)
      rejectPresentFields(payload, ['viewMode', 'viewData', 'errorData', 'overlayNotice'], issues)
      if (hasOwn(payload, 'toastNotice')) validateToastNotice(payload.toastNotice, 'payload.toastNotice', issues)
    }
  } else if (payload.pageStatus === PAGE_STATUS.ERROR) {
    if (!hasOwn(payload, 'errorData')) addIssue(issues, 'payload.errorData', 'required_field')
    else validateErrorData(payload.errorData, 'payload.errorData', issues)
    rejectPresentFields(payload, ['homeMode', 'viewMode', 'viewData', 'multiPushViewData', 'overlayNotice', 'toastNotice'], issues)
  } else if (payload.pageStatus === PAGE_STATUS.LOADING) {
    rejectPresentFields(payload, ['homeMode', 'viewMode', 'viewData', 'multiPushViewData', 'errorData', 'overlayNotice', 'toastNotice'], issues)
  }

  return issues
}

function validateOperationData(operation, issues) {
  const hasData = hasOwn(operation, 'data')
  if (operation.type === OPERATION_TYPE.PRIMARY_ACTION) {
    if (!hasData) return
    if (!validateExactKeys(operation.data, new Set(['amountKey', 'termKey']), 'operation.data', issues)) return
    validateOptionalString(operation.data.amountKey, 'operation.data.amountKey', issues)
    validateOptionalString(operation.data.termKey, 'operation.data.termKey', issues)
    return
  }

  if (operation.type === OPERATION_TYPE.SELECT_AMOUNT || operation.type === OPERATION_TYPE.SELECT_TERM) {
    const key = operation.type === OPERATION_TYPE.SELECT_AMOUNT ? 'amountKey' : 'termKey'
    if (!hasData) {
      addIssue(issues, 'operation.data', 'required_field')
      return
    }
    if (!validateExactKeys(operation.data, new Set([key]), 'operation.data', issues)) return
    validateRequiredString(operation.data[key], `operation.data.${key}`, issues)
    return
  }

  if (operation.type === OPERATION_TYPE.TOGGLE_PRODUCT_SELECTION) {
    if (!hasData) {
      addIssue(issues, 'operation.data', 'required_field')
      return
    }
    if (!validateExactKeys(operation.data, new Set(['productId', 'selected']), 'operation.data', issues)) return
    validateRequiredString(operation.data.productId, 'operation.data.productId', issues)
    validateBoolean(operation.data.selected, 'operation.data.selected', issues)
    return
  }

  if (operation.type === OPERATION_TYPE.SUBMIT_SELECTED_PRODUCTS) {
    if (!hasData) {
      addIssue(issues, 'operation.data', 'required_field')
      return
    }
    if (!validateExactKeys(operation.data, new Set(['productIds']), 'operation.data', issues)) return
    validateArray(operation.data.productIds, 'operation.data.productIds', issues, (item, path, nestedIssues) => validateRequiredString(item, path, nestedIssues), 1)
    return
  }

  if (hasData) addIssue(issues, 'operation.data', 'unexpected_field')
}

export function validateHomeOperation(operation) {
  const issues = []
  const keys = new Set(['requestId', 'type', 'viewMode', 'data'])
  if (!validateExactKeys(operation, keys, 'operation', issues)) return issues
  validateRequiredString(operation.requestId, 'operation.requestId', issues)
  if (!OPERATION_TYPES.has(operation.type)) addIssue(issues, 'operation.type', 'invalid_enum')
  if (!VIEW_MODES.has(operation.viewMode)) addIssue(issues, 'operation.viewMode', 'invalid_enum')
  validateOperationData(operation, issues)
  return issues
}

export function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]))
}
