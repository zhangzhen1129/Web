import { getProjectMessage } from '../../../shared/config/projectLanguage.js'
import { getAuthenticationProgressText } from './homeDisplayText.js'

const SUCCESS_CODE = 2000
const APP_MODES = new Set([0, 1, 2, 3])
const ORDER_STATUSES = new Set([10, 20, 21, 30, 40, 70, 80, 90, 100, 101, 110])
const AUTHENTICATION_PROGRESS_BY_STAGE = Object.freeze({ basic_info_required: 95, additional_info_required: 96, identity_required: 97, remittance_account_required: 98 })
const APPLICATION_PROGRESS_ORDER_STATUSES = new Set([10, 100, 101, 110])
const BUTTONS = Object.freeze({ repay: getProjectMessage('30'), processingReviewing: getProjectMessage('31'), processingDisbursing: getProjectMessage('32'), apply: getProjectMessage('33') })
const BROADCAST_AMOUNTS = Object.freeze([500, 1000, 2000, 3000, 4000, 5000])

export class HomeDataMappingError extends Error {
  constructor(code, details = {}) { super(code); this.code = code; Object.assign(this, details) }
}
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const nested = (value, parent, child) => (isRecord(value?.[parent]) ? value[parent][child] : undefined)
const stringValue = (value, code) => { if (typeof value !== 'string' || value.trim().length === 0) throw new HomeDataMappingError(code); return value }
const plainText = (value, code) => { const text = stringValue(value, code).trim(); if (/[<>]/.test(text)) throw new HomeDataMappingError(code); return text }
const integerValue = (value, code) => { if (!Number.isInteger(value)) throw new HomeDataMappingError(code); return value }

function envelope(raw, data) { return { returnCode: nested(raw, 'cyiUgNvO2EPltj', 'atY3WWbXIN'), message: raw?.pl9xRlV, data } }
export function normalizeAppModeResponse(raw) { return envelope(raw, { maskModel: raw?.ff1xUx0HoLLBT, identityAuth: nested(raw, 'sdev3yZIeDeTpPeCLgpe', 'zzNz2u2KdG2t'), addInfoAuth: nested(raw, 'kquKbNemoPpev3iAWeU', 'nxUg4J58bXY'), basicInfoAuth: raw?.uxevWvdDX78A9ZfO2, remittanceAccountAuth: raw?.lsnKlOgSn34X6OyM6YoXneo3b, amount: nested(raw, 'kuYUF6TeSdvF9D', 'ehE3D2'), repaymentTime: nested(raw, 'ujAfyjwfFrlsA2prl52J0', 'wjU33fJgYQNfJ'), applyTime: raw?.kwou5JkFthdG9, button: raw?.jex8fsxrsl, statusDescription: nested(raw, 'umwAvTdTxSKEvCuIsTlOqqY4W', 'xdbJvIIutssyqJjEo'), orderId: raw?.kteZ9gY3cBY, orderStatus: raw?.kxCNx4mRAzCNC7B, totalCredit: raw?.zbp3php3hzn79bp, usedCredit: nested(raw, 'bjNBOTyE0SyECUkmYk', 'dtbUD8bUfa'), locked: nested(raw, 'mem6ek5g79TRxP', 'uiRcT5') }) }
export function normalizeMultiPushResponse(raw) { return envelope(raw, { usedQuota: raw?.zk9qaIUtAK4JQ, sumQuota: raw?.wzKtJNDdLHKt, remaining: raw?.hb9P7T2PY2Y2W, locked: nested(raw, 'mem6ek5g79TRxP', 'uiRcT5'), repaymentNum: nested(raw, 'byrspwnswEcFr9sEYdCb', 'xgxcGompBTCo'), button: raw?.jex8fsxrsl, products: raw?.boxeqivkXywlXvshygxTmwx }) }

function requireSuccess(value, prefix) {
  if (!isRecord(value) || !Number.isInteger(value.returnCode)) throw new HomeDataMappingError(`${prefix}_RESPONSE_INVALID`)
  if (value.returnCode !== SUCCESS_CODE) {
    const text = typeof value.message === 'string' && /^[^<>]*$/.test(value.message) && value.message.trim() ? value.message.trim() : null
    throw new HomeDataMappingError(`${prefix}_BUSINESS_FAILURE`, { displayText: text })
  }
  if (!isRecord(value.data)) throw new HomeDataMappingError(`${prefix}_DATA_INVALID`)
  return value.data
}

export function createHomeTabs(mode) {
  const result = [{ key: 'home', text: 'Préstamos', iconResourceKey: 'home', active: true, enabled: true }]
  if (mode === 'multi_push') result.push({ key: 'repayment', text: 'Reembolso', iconResourceKey: 'repayment', active: false, enabled: true })
  result.push({ key: 'account', text: 'Mi cuenta', iconResourceKey: 'account', active: false, enabled: true })
  return result
}

function createBroadcast(random = Math.random) {
  return { items: Array.from({ length: 6 }, (_, index) => { const phone = `9${String(Math.floor(random() * 1e8)).padStart(8, '0')}`; const amount = BROADCAST_AMOUNTS[Math.floor(random() * BROADCAST_AMOUNTS.length)]; return { key: `broadcast-${index + 1}-${Math.floor(random() * 1e9)}`, text: `${phone.slice(0, 3)}***${phone.slice(-3)} ha solicitado con éxito S/${amount}` } }) }
}

function localSelection() { return { amountOptions: Array.from({ length: 50 }, (_, index) => { const amount = (index + 1) * 100; return { key: String(amount), text: `S/ ${amount}`, disabled: false } }), selectedAmountKey: '5000', termOptions: [91, 120, 180].map((term) => ({ key: String(term), text: `${term} días`, disabled: false })), selectedTermKey: '91' } }
function summary({ availableText, totalText, usedText, locked, prefix = 'CASH' }) { const lockedValue = integerValue(locked, `${prefix}_LOCKED_INVALID`) !== 0; return { availableLabelText: 'Cantidad disponible', availableText: stringValue(availableText, `${prefix}_AMOUNT_INVALID`), totalLabelText: 'Crédito total', totalText: stringValue(totalText, `${prefix}_TOTAL_CREDIT_INVALID`), usedLabelText: 'Crédito usado', usedText: stringValue(usedText, `${prefix}_USED_CREDIT_INVALID`), locked: lockedValue, refreshEnabled: !lockedValue } }

function cashDecision(data) {
  const mode = integerValue(data.maskModel, 'CASH_MODE_INVALID'); if (!APP_MODES.has(mode) || mode === 1) throw new HomeDataMappingError('CASH_MODE_INVALID')
  if (mode === 2) return { stage: 'application_unavailable', viewMode: 'apply', amountSource: 'local_limit' }
  for (const [field, stage] of [['basicInfoAuth', 'basic_info_required'], ['addInfoAuth', 'additional_info_required'], ['identityAuth', 'identity_required'], ['remittanceAccountAuth', 'remittance_account_required']]) if (integerValue(data[field], `CASH_${field.toUpperCase()}_INVALID`) === 0) return { stage, viewMode: 'apply', amountSource: 'local_limit' }
  const status = data.orderStatus
  if (status === undefined || status === null || status === '') return { stage: 'ready_to_apply', viewMode: 'apply', amountSource: 'local_limit' }
  integerValue(status, 'CASH_ORDER_STATUS_INVALID'); if (!ORDER_STATUSES.has(status)) throw new HomeDataMappingError('CASH_ORDER_STATUS_INVALID')
  if (typeof data.orderId !== 'string' || data.orderId.trim().length === 0) throw new HomeDataMappingError('CASH_ORDER_ID_INVALID')
  if (status === 20 || status === 21) return { stage: 'reviewing', viewMode: 'reviewing', amountSource: 'local_limit' }
  if (status === 30 || status === 70) return { stage: 'disbursing', viewMode: 'disbursing', amountSource: 'api_available' }
  if (status === 80 || status === 90) return { stage: 'repaying', viewMode: 'repaying', amountSource: 'api_available', stateKey: status === 90 ? 'overdue' : 'repayment_due' }
  if (status === 40) return { stage: 'rejected', viewMode: 'rejected', amountSource: 'local_limit', primaryActionEffect: 'show_overlay_notice', primaryActionMessageId: '20' }
  if (status === 10) return { stage: 'apply', viewMode: 'apply', amountSource: 'local_limit' }
  return { stage: 'apply', viewMode: 'apply', amountSource: 'api_available' }
}

function authenticationProgress(decision, orderStatus) {
  const stageProgress = AUTHENTICATION_PROGRESS_BY_STAGE[decision.stage]
  if (stageProgress) return stageProgress
  return decision.stage === 'apply' && APPLICATION_PROGRESS_ORDER_STATUSES.has(orderStatus) ? 99 : null
}

function mapCash(data, options) {
  const decision = cashDecision(data); const button = plainText(data.button, 'CASH_BUTTON_INVALID'); const tabs = createHomeTabs('cash_loan'); const viewData = { steps: [{ key: 'step-1', text: 'Verificación de información', iconResourceKey: 'step-1' }, { key: 'step-2', text: 'Revisión del préstamo', iconResourceKey: 'step-2' }, { key: 'step-3', text: 'Aprobación de la solicitud', iconResourceKey: 'step-3' }], broadcast: createBroadcast(options.random), primaryAction: { text: button, enabled: !['reviewing', 'disbursing'].includes(decision.stage), loading: decision.stage === 'disbursing' } }
  const progress = authenticationProgress(decision, data.orderStatus)
  if (progress) viewData.primaryAction.badgeText = getAuthenticationProgressText(progress)
  if (decision.amountSource === 'local_limit') viewData.productSelection = localSelection(); else viewData.creditSummary = summary({ availableText: data.amount, totalText: data.totalCredit, usedText: data.usedCredit, locked: data.locked })
  if (decision.stateKey) viewData.primaryAction.supportingText = plainText(data.statusDescription, 'CASH_STATUS_DESCRIPTION_INVALID')
  const payload = { requestId: options.requestId, revision: options.revision, ...(options.sourceOperationId ? { sourceOperationId: options.sourceOperationId } : {}), pageStatus: 'content', homeMode: 'cash_loan', viewMode: decision.viewMode, viewData, tabs }
  return { kind: 'cash_loan', payload, snapshot: Object.freeze({ loadCycleId: options.loadCycleId, viewRevision: options.revision, trigger: options.trigger, ...(options.sourceOperationId ? { sourceOperationId: options.sourceOperationId } : {}), mode: 'cash_loan', stage: decision.stage, viewMode: decision.viewMode, amountSource: decision.amountSource, localLimit: decision.amountSource === 'local_limit' ? '5000' : null, availableAmount: decision.amountSource === 'api_available' ? data.amount : null, totalCredit: decision.amountSource === 'api_available' ? data.totalCredit : null, usedCredit: decision.amountSource === 'api_available' ? data.usedCredit : null, locked: decision.amountSource === 'api_available' ? integerValue(data.locked, 'CASH_LOCKED_INVALID') !== 0 : null, orderId: typeof data.orderId === 'string' && data.orderId.length ? data.orderId : null, orderStatus: data.orderStatus ?? null, repaymentTime: data.repaymentTime ?? null, applyTime: data.applyTime ?? null, primaryActionEffect: decision.primaryActionEffect ?? null, primaryActionMessageId: decision.primaryActionMessageId ?? null, tabs }) }
}

function parseDecimal(value, code) { const raw = stringValue(value, code).trim(); if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(raw)) throw new HomeDataMappingError(code); const [whole, fraction = ''] = raw.split('.'); return { raw, text: fraction ? `${whole}.${fraction.replace(/0+$/, '') || '0'}` : whole, whole, fraction } }
function addDecimals(values) { const scale = Math.max(0, ...values.map((value) => value.fraction.length)); const total = values.reduce((sum, value) => sum + BigInt(value.whole) * (10n ** BigInt(scale)) + BigInt((value.fraction || '').padEnd(scale, '0') || 0), 0n); const raw = total.toString().padStart(scale + 1, '0'); if (!scale) return raw; const fraction = raw.slice(-scale).replace(/0+$/, ''); return fraction ? `${raw.slice(0, -scale)}.${fraction}` : raw.slice(0, -scale) }
function dueDate(now) { const date = new Date(now); if (Number.isNaN(date.getTime())) throw new HomeDataMappingError('MULTI_DATE_INVALID'); date.setDate(date.getDate() + 6); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function mapProducts(items, now) { if (!Array.isArray(items)) throw new HomeDataMappingError('MULTI_PRODUCTS_INVALID'); const ids = new Set(); const date = dueDate(now); const decimals = []; const domainProducts = []; const products = items.map((item) => { if (!isRecord(item)) throw new HomeDataMappingError('MULTI_PRODUCT_INVALID'); const id = stringValue(item.id, 'MULTI_PRODUCT_ID_INVALID').trim(); if (ids.has(id)) throw new HomeDataMappingError('MULTI_PRODUCT_ID_DUPLICATE'); ids.add(id); const name = stringValue(item.productName, 'MULTI_PRODUCT_NAME_INVALID').trim(); const amount = parseDecimal(item.minAmount, 'MULTI_MINIMUM_AMOUNT_INVALID'); let icon; try { icon = new URL(item.icon) } catch { throw new HomeDataMappingError('MULTI_PRODUCT_ICON_INVALID') } if (icon.protocol !== 'https:' || icon.username || icon.password) throw new HomeDataMappingError('MULTI_PRODUCT_ICON_INVALID'); const reloan = integerValue(item.isReloan, 'MULTI_PRODUCT_RELOAN_INVALID'); decimals.push(amount); domainProducts.push({ productId: id, minimumAmount: amount.raw }); return { productId: id, iconUrl: icon.toString(), name, loanAmountText: amount.raw, dueDateText: date, isReloan: reloan === 1, selectable: true, selected: true } }); return { products, domainProducts, selectedAmount: addDecimals(decimals) } }

export function mapAppModeResponse(raw, options = {}) { const data = requireSuccess(normalizeAppModeResponse(raw), 'APP_MODE'); const mode = integerValue(data.maskModel, 'APP_MODE_INVALID'); if (mode === 1) return { kind: 'multi_push', mode, data: Object.freeze({ ...data }) }; if (!APP_MODES.has(mode)) throw new HomeDataMappingError('APP_MODE_INVALID'); return mapCash(data, options) }
export function mapMultiPushResponse(raw, options = {}) { const data = requireSuccess(normalizeMultiPushResponse(raw), 'MULTI'); const used = parseDecimal(data.usedQuota, 'MULTI_USED_QUOTA_INVALID'); const total = parseDecimal(data.sumQuota, 'MULTI_SUM_QUOTA_INVALID'); const remaining = parseDecimal(data.remaining, 'MULTI_REMAINING_INVALID'); const locked = integerValue(data.locked, 'MULTI_LOCKED_INVALID'); const repaymentNum = integerValue(data.repaymentNum, 'MULTI_REPAYMENT_COUNT_INVALID'); if (repaymentNum < 0) throw new HomeDataMappingError('MULTI_REPAYMENT_COUNT_INVALID'); const button = stringValue(data.button, 'MULTI_BUTTON_INVALID').trim(); const action = button === BUTTONS.repay ? { id: '30', action: 'repay', variant: 'active_only', effect: 'navigate_repayment_list' } : button === BUTTONS.processingReviewing ? { id: '31', action: 'processing', variant: 'processing_only', effect: 'navigate_order_list' } : button === BUTTONS.processingDisbursing ? { id: '32', action: 'processing', variant: 'processing_only', effect: 'navigate_order_list' } : button === BUTTONS.apply ? { id: '33', action: 'apply', variant: repaymentNum > 0 ? 'available_and_active' : 'available_only', effect: 'apply_order' } : null; if (!action) throw new HomeDataMappingError('MULTI_BUTTON_INVALID'); const mapped = mapProducts(data.products, options.now ?? Date.now()); const hasProducts = mapped.products.length > 0; if (action.action !== 'apply' && hasProducts) throw new HomeDataMappingError('MULTI_PRODUCTS_FOR_ACTION_INVALID'); const viewData = { variant: action.variant, steps: [{ key: 'step-1', text: 'Verificación de información', iconResourceKey: 'step-1' }, { key: 'step-2', text: 'Revisión del préstamo', iconResourceKey: 'step-2' }, { key: 'step-3', text: 'Aprobación de la solicitud', iconResourceKey: 'step-3' }], broadcast: createBroadcast(options.random), creditSummary: summary({ availableText: mapped.selectedAmount, totalText: total.raw, usedText: used.raw, locked, prefix: 'MULTI' }), minimumSelectionCount: hasProducts ? 1 : 0, primaryAction: { text: BUTTONS[action.id === '30' ? 'repay' : action.id === '31' ? 'processingReviewing' : action.id === '32' ? 'processingDisbursing' : 'apply'], enabled: true, loading: false } }; if (hasProducts) { viewData.products = mapped.products; viewData.productSummary = { countTextTemplate: '{count} productos' } } else if (action.variant === 'active_only') { viewData.products = []; viewData.productSummary = { countTextTemplate: '{count} productos' } } const payload = { requestId: options.requestId, revision: options.revision, ...(options.sourceOperationId ? { sourceOperationId: options.sourceOperationId } : {}), pageStatus: 'content', homeMode: 'multi_push', multiPushViewData: viewData, tabs: createHomeTabs('multi_push') }; return { kind: 'multi_push', payload, snapshot: Object.freeze({ loadCycleId: options.loadCycleId, viewRevision: options.revision, trigger: options.trigger, ...(options.sourceOperationId ? { sourceOperationId: options.sourceOperationId } : {}), mode: 'multi_push', variant: action.variant, primaryAction: action.action, primaryActionEffect: hasProducts ? action.effect : action.action === 'apply' ? 'show_empty_products_toast' : action.effect, primaryActionMessageId: !hasProducts && action.action === 'apply' ? '10' : null, products: mapped.domainProducts, selectedProductCount: mapped.products.length, minimumSelectionCount: hasProducts ? 1 : 0, repaymentNum, totalCredit: total.raw, usedCredit: used.raw, remainingCredit: remaining.raw, locked: locked !== 0, tabs: createHomeTabs('multi_push') }) } }
export function createLoadingPayload({ requestId, revision, sourceOperationId, messageText }) { return { requestId, revision, ...(sourceOperationId ? { sourceOperationId } : {}), pageStatus: 'loading', tabs: createHomeTabs('cash_loan'), ...(messageText ? { toastNotice: { noticeId: requestId, text: messageText } } : {}) } }
export function createErrorPayload({ requestId, revision, sourceOperationId, messageText }) { return { requestId, revision, ...(sourceOperationId ? { sourceOperationId } : {}), pageStatus: 'error', tabs: createHomeTabs('cash_loan'), errorData: { messageText: messageText || 'Unable to load home data.' } } }
