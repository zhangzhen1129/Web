import {
  DEFAULT_AMOUNT_KEY,
  DEFAULT_TERM_KEY,
  createLocalContentPayload,
  createLocalErrorPayload,
  createLocalLoadingPayload,
  localViewModes,
  modeHasProductSelection,
} from './localHomeViewData.js'
import { createMultiPushContentPayload, createLocalMultiPushHomeViewData, getMultiPushHomeState } from './localMultiPushHomeViewData.js'

const SPECIAL_MODES = new Set(['loading', 'error'])
const INITIAL_LOADING_DELAY_MS = 800

export function createLocalHomeViewProvider(controller, options = {}) {
  if (!controller || typeof controller.updateHomeView !== 'function') {
    throw new TypeError('controller must provide updateHomeView()')
  }

  const schedule = options.schedule ?? ((callback, delay) => window.setTimeout(callback, delay))
  const clearSchedule = options.clearSchedule ?? ((timerId) => window.clearTimeout(timerId))
  const initialMode = localViewModes.includes(options.initialMode) || SPECIAL_MODES.has(options.initialMode) || options.initialMode === 'multi_push'
    ? options.initialMode
    : 'apply'
  const showInitialLoading = options.initialLoading !== false && !SPECIAL_MODES.has(initialMode)
  const selections = new Map(localViewModes.map((mode) => [mode, {
    selectedAmountKey: DEFAULT_AMOUNT_KEY,
    selectedTermKey: DEFAULT_TERM_KEY,
  }]))
  let currentMode = initialMode
  let requestSequence = 0
  let initialLoadingTimerId = null
  let isDestroyed = false

  function createRequestId(prefix) {
    requestSequence += 1
    return `local-home-${prefix}-${requestSequence}`
  }

  function pushView(sourceOperationId, pageStatus = 'content') {
    if (currentMode === 'multi_push') {
      const multiData = options.multiPushData ?? createLocalMultiPushHomeViewData()
      controller.updateHomeView({
        ...createMultiPushContentPayload(options.multiPushScenario, createRequestId('multi'), sourceOperationId),
        pageStatus,
        multiPushViewData: multiData,
        viewMode: getMultiPushHomeState(multiData).replace(/-/g, '_'),
      })
      return
    }
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
    if (isDestroyed || (!localViewModes.includes(mode) && !SPECIAL_MODES.has(mode))) return false
    currentMode = mode
    pushView()
    return true
  }

  function handleOperation(operation) {
    if (currentMode === 'multi_push') {
      if (operation.type === 'refresh') beginLoading(operation.requestId)
      return
    }
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
      beginLoading(operation.requestId)
    }
  }

  function beginLoading(sourceOperationId) {
    if (initialLoadingTimerId !== null) clearSchedule(initialLoadingTimerId)
    controller.updateHomeView(createLocalLoadingPayload(createRequestId('loading'), sourceOperationId))
    initialLoadingTimerId = schedule(() => {
      initialLoadingTimerId = null
      if (!isDestroyed) pushView(sourceOperationId)
    }, INITIAL_LOADING_DELAY_MS)
  }

  function start() {
    if (isDestroyed) return
    if (!showInitialLoading) {
      pushView()
      return
    }

    beginLoading()
  }

  function reload() {
    start()
  }

  function destroy() {
    isDestroyed = true
    if (initialLoadingTimerId !== null) clearSchedule(initialLoadingTimerId)
    initialLoadingTimerId = null
  }

  function setHomeMode(mode) {
    if (isDestroyed) return false
    const nextMode = mode === 'multi_push' ? 'multi_push' : (localViewModes.includes(mode) ? mode : 'apply')
    currentMode = nextMode
    pushView()
    return true
  }

  return Object.freeze({
    start,
    reload,
    getMode: () => currentMode,
    setMode,
    setHomeMode,
    handleOperation,
    destroy,
  })
}
