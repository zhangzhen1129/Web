import { OPERATION_TYPE, PAGE_STATUS, VIEW_MODE } from './constants.js'

const PAGE_STATUSES = new Set(Object.values(PAGE_STATUS))
const VIEW_MODES = new Set(Object.values(VIEW_MODE))
const OPERATION_TYPES = new Set(Object.values(OPERATION_TYPE))
const NOTICE_TONES = new Set(['info', 'success', 'warning', 'error'])
const REQUIRED_TAB_KEYS = new Set(['home', 'account'])
const TAB_KEYS = new Set(['home', 'repayment', 'account'])

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
  ])
  if (!validateExactKeys(value, keys, path, issues)) return
  validateRequiredString(value.availableLabelText, `${path}.availableLabelText`, issues)
  validateRequiredString(value.availableText, `${path}.availableText`, issues)
  validateRequiredString(value.totalLabelText, `${path}.totalLabelText`, issues)
  validateRequiredString(value.totalText, `${path}.totalText`, issues)
  validateRequiredString(value.usedLabelText, `${path}.usedLabelText`, issues)
  validateRequiredString(value.usedText, `${path}.usedText`, issues)
  validateBoolean(value.locked, `${path}.locked`, issues)
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
  if (!validateExactKeys(value, new Set(['text', 'enabled', 'loading', 'badgeText']), path, issues)) return
  validateRequiredString(value.text, `${path}.text`, issues)
  validateBoolean(value.enabled, `${path}.enabled`, issues)
  validateBoolean(value.loading, `${path}.loading`, issues)
  validateOptionalString(value.badgeText, `${path}.badgeText`, issues)
}

function validateStatusNotice(value, path, issues) {
  if (!validateExactKeys(value, new Set(['text', 'tone']), path, issues)) return
  validateRequiredString(value.text, `${path}.text`, issues)
  if (!NOTICE_TONES.has(value.tone)) addIssue(issues, `${path}.tone`, 'invalid_enum')
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
  if (!validateExactKeys(value, new Set(['messageText', 'retryVisible', 'retryText']), path, issues)) return
  validateRequiredString(value.messageText, `${path}.messageText`, issues)
  validateBoolean(value.retryVisible, `${path}.retryVisible`, issues)
  if (value.retryVisible === true) validateRequiredString(value.retryText, `${path}.retryText`, issues)
  else if (hasOwn(value, 'retryText')) addIssue(issues, `${path}.retryText`, 'unexpected_field')
}

function rejectPresentFields(value, fields, issues) {
  fields.forEach((field) => {
    if (hasOwn(value, field)) addIssue(issues, `payload.${field}`, 'unexpected_field')
  })
}

export function validateHomeViewPayload(payload) {
  const issues = []
  const keys = new Set(['requestId', 'sourceOperationId', 'pageStatus', 'viewMode', 'viewData', 'errorData'])
  if (!validateExactKeys(payload, keys, 'payload', issues)) return issues

  validateRequiredString(payload.requestId, 'payload.requestId', issues)
  validateOptionalString(payload.sourceOperationId, 'payload.sourceOperationId', issues)
  if (!PAGE_STATUSES.has(payload.pageStatus)) addIssue(issues, 'payload.pageStatus', 'invalid_enum')

  if (payload.pageStatus === PAGE_STATUS.CONTENT || payload.pageStatus === PAGE_STATUS.REFRESHING) {
    if (!VIEW_MODES.has(payload.viewMode)) addIssue(issues, 'payload.viewMode', 'invalid_enum')
    if (!hasOwn(payload, 'viewData')) addIssue(issues, 'payload.viewData', 'required_field')
    else validateHomeViewData(payload.viewData, 'payload.viewData', issues)
    rejectPresentFields(payload, ['errorData'], issues)
  } else if (payload.pageStatus === PAGE_STATUS.ERROR) {
    if (!hasOwn(payload, 'errorData')) addIssue(issues, 'payload.errorData', 'required_field')
    else validateErrorData(payload.errorData, 'payload.errorData', issues)
    rejectPresentFields(payload, ['viewMode', 'viewData'], issues)
  } else if (payload.pageStatus === PAGE_STATUS.LOADING) {
    rejectPresentFields(payload, ['viewMode', 'viewData', 'errorData'], issues)
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
