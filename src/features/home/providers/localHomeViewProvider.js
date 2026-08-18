import {
  DEFAULT_AMOUNT_KEY,
  DEFAULT_TERM_KEY,
  createLocalContentPayload,
  createLocalErrorPayload,
  createLocalLoadingPayload,
  localViewModes,
  modeHasProductSelection,
} from './localHomeViewData.js'

const SPECIAL_MODES = new Set(['loading', 'error'])

export function createLocalHomeViewProvider(controller, options = {}) {
  if (!controller || typeof controller.updateHomeView !== 'function') {
    throw new TypeError('controller must provide updateHomeView()')
  }

  const schedule = options.schedule ?? ((callback, delay) => window.setTimeout(callback, delay))
  const initialMode = localViewModes.includes(options.initialMode) || SPECIAL_MODES.has(options.initialMode)
    ? options.initialMode
    : 'apply'
  const selections = new Map(localViewModes.map((mode) => [mode, {
    selectedAmountKey: DEFAULT_AMOUNT_KEY,
    selectedTermKey: DEFAULT_TERM_KEY,
  }]))
  let currentMode = initialMode
  let requestSequence = 0

  function createRequestId(prefix) {
    requestSequence += 1
    return `local-home-${prefix}-${requestSequence}`
  }

  function pushView(sourceOperationId, pageStatus = 'content') {
    if (currentMode === 'loading') {
      controller.updateHomeView(createLocalLoadingPayload(createRequestId('loading')))
      return
    }
    if (currentMode === 'error') {
      controller.updateHomeView(createLocalErrorPayload(createRequestId('error')))
      return
    }
    controller.updateHomeView({
      ...createLocalContentPayload(currentMode, createRequestId(currentMode), selections.get(currentMode)),
      ...(sourceOperationId ? { sourceOperationId } : {}),
      pageStatus,
    })
  }

  function setMode(mode) {
    if (!localViewModes.includes(mode) && !SPECIAL_MODES.has(mode)) return false
    currentMode = mode
    pushView()
    return true
  }

  function handleOperation(operation) {
    if (operation.type === 'select_amount' && modeHasProductSelection(currentMode)) {
      selections.get(currentMode).selectedAmountKey = operation.data.amountKey
      pushView(operation.requestId)
      return
    }
    if (operation.type === 'select_term' && modeHasProductSelection(currentMode)) {
      selections.get(currentMode).selectedTermKey = operation.data.termKey
      pushView(operation.requestId)
      return
    }
    if (operation.type === 'refresh') {
      pushView(operation.requestId, 'refreshing')
      schedule(() => pushView(operation.requestId), 450)
    }
  }

  return Object.freeze({
    start: pushView,
    getMode: () => currentMode,
    setMode,
    handleOperation,
  })
}
