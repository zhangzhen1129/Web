import { reactive, readonly } from 'vue'

export const APP_MODE = Object.freeze({
  CASH_LOAN: '0',
  MULTI_PUSH: '1',
  REPAYMENT_VISIBLE: '2',
  REPAYMENT_HIDDEN: '3',
})

const DEFAULT_HOME_TABS = Object.freeze([
  Object.freeze({ key: 'home', text: 'Pr\u00e9stamos', iconResourceKey: 'home', active: true, enabled: true }),
  Object.freeze({ key: 'account', text: 'Mi cuenta', iconResourceKey: 'account', active: false, enabled: true }),
])

function createDefaultHomeTabs() {
  return DEFAULT_HOME_TABS.map((tab) => ({ ...tab }))
}

const state = reactive({
  mode: APP_MODE.CASH_LOAN,
  homeTabs: createDefaultHomeTabs(),
  diagnosticCode: null,
})

function dispatchAppModeEvent(name, detail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

function normalizeAppMode(value) {
  const normalized = String(value ?? '').trim()
  if (normalized === APP_MODE.CASH_LOAN
    || normalized === APP_MODE.MULTI_PUSH
    || normalized === APP_MODE.REPAYMENT_VISIBLE
    || normalized === APP_MODE.REPAYMENT_HIDDEN) {
    return normalized
  }
  return null
}

export function setAppMode(value) {
  const normalized = normalizeAppMode(value)
  if (!normalized) {
    state.mode = APP_MODE.CASH_LOAN
    state.homeTabs = createDefaultHomeTabs()
    state.diagnosticCode = 'INVALID_APP_MODE'
    dispatchAppModeEvent('dinero-pro:app-mode-diagnostic', { code: state.diagnosticCode })
    return false
  }

  state.mode = normalized
  state.diagnosticCode = null
  dispatchAppModeEvent('dinero-pro:app-mode-change', { mode: normalized })
  return true
}

export function setHomeTabs(tabs) {
  state.homeTabs = Array.isArray(tabs) && tabs.length > 0
    ? tabs.map((tab) => ({ ...tab }))
    : createDefaultHomeTabs()
}

export function setMultiPushTabs(tabs) {
  setHomeTabs(tabs)
}

export function shouldShowRepaymentTab(mode = state.mode, tabs = state.homeTabs) {
  if (mode !== APP_MODE.MULTI_PUSH) return false
  return tabs.some((tab) => tab?.key === 'repayment' && tab.enabled !== false)
}

export const appModeState = readonly(state)
