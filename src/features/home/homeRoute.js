const ROUTE_TARGETS = Object.freeze({
  home_tab: Object.freeze({ name: 'home', path: '/home' }),
  repayment_tab: Object.freeze({ name: 'repayment', path: '/repayment' }),
  account_tab: Object.freeze({ name: 'mine', path: '/mine' }),
  repayment_list: Object.freeze({ name: 'repayment', path: '/repayment' }),
  order_list: Object.freeze({ name: 'orderList', path: '/orderList' }),
  cash_loan_primary_action: null,
  information: Object.freeze({ name: 'information', path: '/information' }),
  contacts: Object.freeze({ name: 'contacts', path: '/contacts' }),
  identity: Object.freeze({ name: 'identity', path: '/identity' }),
  addBank: Object.freeze({ name: 'addBank', path: '/addBank' }),
  orderDetail: Object.freeze({ name: 'orderDetail', path: '/orderDetail' }),
  loanConfirm: Object.freeze({ name: 'loanConfirm', path: '/loanConfirm' }),
  multi_push_application_result: Object.freeze({ name: 'loanSuccessMulti', path: '/loanSuccessMulti' }),
})

const ORDER_DETAIL_STATUSES = new Set([20, 21, 30, 70, 80, 90])
const LOAN_CONFIRM_STATUSES = new Set([10, 100, 101, 110])
const KNOWN_ORDER_STATUSES = new Set([...ORDER_DETAIL_STATUSES, ...LOAN_CONFIRM_STATUSES, 40])
const CANONICAL_STAGES = new Set([
  'application_unavailable', 'basic_info_required', 'additional_info_required',
  'identity_required', 'remittance_account_required', 'ready_to_apply',
  'reviewing', 'disbursing', 'repaying', 'rejected',
])
const MAIN_TAB_TARGETS = new Set(['home_tab', 'repayment_tab', 'account_tab'])
const INTERNAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function isEmpty(value) {
  return value === undefined || value === null || value === ''
}

function validOrderId(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function result(type, route = null, reason) {
  return {
    type,
    route,
    ...(reason ? { reason } : {}),
  }
}

function navigation(routeName, query = {}) {
  const target = ROUTE_TARGETS[routeName] ?? Object.values(ROUTE_TARGETS).find((item) => item?.name === routeName)
  if (!target) return result('error', null, 'route_unavailable')
  return result('navigate', {
    name: target.name,
    path: target.path,
    query: Object.freeze({ ...query }),
  })
}

function permissionGranted(routeIntent, permissionResult) {
  if (permissionResult?.status !== 'granted') return false
  return permissionResult.operationId === routeIntent.sourceOperationId
}

function validRevision(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null
  if (Number.isInteger(snapshot.appMode)) return snapshot
  if (snapshot.mode === 'multi_push') return { ...snapshot, appMode: 1 }
  if (snapshot.mode !== 'cash_loan') return snapshot
  if (snapshot.stage !== undefined && !CANONICAL_STAGES.has(snapshot.stage)) return { ...snapshot, appMode: -1 }
  const normalized = { ...snapshot, appMode: snapshot.stage === 'application_unavailable' ? 2 : 0 }
  if (snapshot.stage === 'basic_info_required') normalized.basicInfo = 0
  if (snapshot.stage === 'additional_info_required') normalized.additionalInfo = 0
  if (snapshot.stage === 'identity_required') normalized.identityInfo = 0
  if (snapshot.stage === 'remittance_account_required') normalized.remittanceAccount = 0
  return normalized
}

function validIntent(routeIntent) {
  return routeIntent
    && typeof routeIntent === 'object'
    && typeof routeIntent.intentId === 'string'
    && INTERNAL_ID_PATTERN.test(routeIntent.intentId)
    && typeof routeIntent.sourceOperationId === 'string'
    && INTERNAL_ID_PATTERN.test(routeIntent.sourceOperationId)
    && typeof routeIntent.target === 'string'
    && Object.hasOwn(ROUTE_TARGETS, routeIntent.target)
}

function validMultiPushResultIntent(routeIntent) {
  if (!routeIntent || Object.keys(routeIntent).some((key) => !['intentId', 'sourceOperationId', 'target', 'params'].includes(key))) return false
  const params = routeIntent.params
  return params
    && typeof params === 'object'
    && !Array.isArray(params)
    && Object.keys(params).length === 1
    && Object.hasOwn(params, 'systemTime')
    && Number.isSafeInteger(params.systemTime)
    && params.systemTime >= 0
}

export function resolveCashLoanRoute(snapshot, currentSnapshotRevision, routeIntent, permissionResult) {
  if (!validIntent(routeIntent) || routeIntent.target !== 'cash_loan_primary_action') {
    return result('blocked', null, 'unknown_target')
  }
  if (!validRevision(currentSnapshotRevision)
    || !validRevision(routeIntent.snapshotRevision)
    || routeIntent.snapshotRevision !== currentSnapshotRevision) {
    return result('blocked', null, 'stale_intent')
  }
  if (!permissionGranted(routeIntent, permissionResult)) return result('blocked', null, 'permission_required')
  snapshot = normalizeSnapshot(snapshot)
  if (!snapshot || typeof snapshot !== 'object') return result('error', null, 'invalid_snapshot')

  const appMode = snapshot.appMode
  if (appMode === 1) return result('blocked', null, 'unsupported_mode')
  if (appMode === 2) return result('blocked', null, 'notice_handled_upstream')
  if (appMode !== 0 && appMode !== 3) return result('error', null, 'invalid_app_mode')

  if (snapshot.basicInfo === 0) return navigation('information')
  if (snapshot.additionalInfo === 0) return navigation('contacts')
  if (snapshot.identityInfo === 0) return navigation('identity')
  if (snapshot.remittanceAccount === 0) {
    if (!validOrderId(snapshot.orderId)) return result('error', null, 'orderId is required')
    return navigation('addBank', { orderId: snapshot.orderId, from: 'order' })
  }

  if (isEmpty(snapshot.orderStatus)) return result('cash_loan_apply', null)
  if (!KNOWN_ORDER_STATUSES.has(snapshot.orderStatus)) return result('error', null, 'unknown_order_status')
  if (!validOrderId(snapshot.orderId)) return result('error', null, 'orderId is required when orderStatus exists')
  if (ORDER_DETAIL_STATUSES.has(snapshot.orderStatus)) return navigation('orderDetail', { orderId: snapshot.orderId })
  if (snapshot.orderStatus === 40) return result('blocked', null, 'notice_handled_upstream')
  if (LOAN_CONFIRM_STATUSES.has(snapshot.orderStatus)) return navigation('loanConfirm', { orderId: snapshot.orderId })
  return result('error', null, 'unknown_order_status')
}

export function resolveHomeRouteIntent({ snapshot, currentSnapshotRevision, routeIntent, permissionResult } = {}) {
  if (!validIntent(routeIntent)) return result('blocked', null, 'invalid_intent')

  if (routeIntent.target === 'cash_loan_primary_action') {
    return resolveCashLoanRoute(snapshot, currentSnapshotRevision, routeIntent, permissionResult)
  }

  if (routeIntent.target === 'multi_push_application_result') {
    if (!validMultiPushResultIntent(routeIntent)) return result('blocked', null, 'invalid_multi_push_result')
    return navigation('multi_push_application_result', { systemTime: String(routeIntent.params.systemTime) })
  }

  if (routeIntent.target === 'repayment_list' || routeIntent.target === 'order_list') {
    if (!permissionGranted(routeIntent, permissionResult)) return result('blocked', null, 'permission_required')
  }

  if (routeIntent.target === 'home_tab') return navigation('home')
  if (routeIntent.target === 'repayment_tab') return navigation('repayment')
  if (routeIntent.target === 'account_tab') return navigation('mine')
  if (routeIntent.target === 'repayment_list') return navigation('repayment')
  if (routeIntent.target === 'order_list') return navigation('orderList')
  return result('blocked', null, 'unknown_target')
}

export function createHomeRouteConsumer({ router } = {}) {
  if (!router || typeof router.push !== 'function') throw new TypeError('router.push is required')

  async function navigate(route, currentRoute, options = {}) {
    if (!route) return result('blocked', null, 'route_unavailable')
    const current = currentRoute ?? router.currentRoute?.value
    const currentName = current?.name
    const currentQuery = current?.query ?? {}
    const nextQuery = route.query ?? {}
    if (currentName === route.name && JSON.stringify(currentQuery) === JSON.stringify(nextQuery)) {
      return result('ignored', null, 'duplicate_navigation')
    }
    const navigateWith = options.replace === true ? router.replace : router.push
    if (typeof navigateWith !== 'function') return result('error', null, 'navigation_unavailable')
    try {
      await navigateWith.call(router, { name: route.name, query: nextQuery })
      return {
        ...result('navigated', route),
        routeName: route.name,
        routePath: route.path,
        query: route.query,
      }
    } catch {
      return result('error', null, 'navigation_failed')
    }
  }

  async function consumeHomeRouteIntent(context = {}) {
    const resolved = resolveHomeRouteIntent(context)
    if (resolved.type !== 'navigate') return resolved
    return navigate(resolved.route, context.currentRoute, { replace: MAIN_TAB_TARGETS.has(context.routeIntent?.target) })
  }

  return Object.freeze({ consumeHomeRouteIntent, navigate })
}

export { ROUTE_TARGETS }
