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
import { getProjectMessage } from '../../../shared/config/projectLanguage.js'

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
  let currentMultiPushData = initialMode === 'multi_push'
    ? (options.multiPushData ?? createLocalMultiPushHomeViewData(options.multiPushScenario))
    : null
  let requestSequence = 0
  let initialLoadingTimerId = null
  let isDestroyed = false
  let noticeSequence = 0
  let permissionPending = false

  function createRequestId(prefix) {
    requestSequence += 1
    return `local-home-${prefix}-${requestSequence}`
  }

  function pushView(sourceOperationId, pageStatus = 'content', overlayNotice) {
    if (currentMode === 'multi_push') {
      const multiData = currentMultiPushData ?? options.multiPushData ?? createLocalMultiPushHomeViewData(options.multiPushScenario)
      controller.updateHomeView({
        ...createMultiPushContentPayload(options.multiPushScenario, createRequestId('multi'), sourceOperationId),
        pageStatus,
        multiPushViewData: multiData,
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
      ...(overlayNotice ? { overlayNotice } : {}),
      pageStatus,
    })
  }

  function setMode(mode) {
    if (isDestroyed || (!localViewModes.includes(mode) && !SPECIAL_MODES.has(mode))) return false
    currentMode = mode
    if (mode === 'multi_push') currentMultiPushData = options.multiPushData ?? createLocalMultiPushHomeViewData(options.multiPushScenario)
    pushView()
    return true
  }

  function handleOperation(operation) {
    if (currentMode === 'multi_push') {
      if (operation.type === 'refresh') beginLoading(operation.requestId)
      if (operation.type === 'refresh_credit') beginLoading(operation.requestId)
      if (operation.type === 'toggle_product_selection') {
        const products = currentMultiPushData?.products ?? []
        const index = products.findIndex((item) => item.id === operation.data.productId)
        if (index < 0 || !products[index].selectable) return
        const selectedCount = products.filter((item) => item.selectable && item.selected).length
        if (operation.data.selected === false && selectedCount <= (currentMultiPushData.minimumSelectionCount ?? 1)) return
        products[index] = { ...products[index], selected: operation.data.selected }
        const selected = products.filter((item) => item.selectable && item.selected)
        const amount = selected.reduce((total, item) => total + item.minAmount, 0)
        currentMultiPushData = { ...currentMultiPushData, products, selectedProductCount: selected.length, productCountText: `${selected.length} productos`, selectedMinimumAmount: `S/ ${amount.toLocaleString('en-US')}`, availableAmount: `S/ ${amount.toLocaleString('en-US')}` }
        pushView(operation.requestId)
      }
      return
    }
    if (operation.type === 'primary_action' && currentMode === 'rejected') {
      if (permissionPending) return
      permissionPending = true
      const finishPermissionFlow = (accepted) => {
        permissionPending = false
        if (isDestroyed) return
        const text = getProjectMessage('10')
        if (accepted === true && text) {
          noticeSequence += 1
          pushView(operation.requestId, 'content', {
            noticeId: `local-home-notice-${noticeSequence}`,
            messageId: '10',
            text,
          })
          return
        }
        pushView(operation.requestId)
      }
      try {
        const permissionResult = typeof options.permissionFlow === 'function'
          ? options.permissionFlow(operation)
          : true
        if (permissionResult && typeof permissionResult.then === 'function') {
          permissionResult.then(finishPermissionFlow).catch(() => finishPermissionFlow(false))
        } else {
          finishPermissionFlow(permissionResult)
        }
      } catch {
        finishPermissionFlow(false)
      }
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
    currentMultiPushData = null
    permissionPending = false
  }

  function setHomeMode(mode) {
    if (isDestroyed) return false
    const nextMode = mode === 'multi_push' ? 'multi_push' : (localViewModes.includes(mode) ? mode : 'apply')
    currentMode = nextMode
    if (nextMode === 'multi_push') currentMultiPushData = options.multiPushData ?? createLocalMultiPushHomeViewData(options.multiPushScenario)
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
