import { reactive, readonly } from 'vue'

export const APP_MODE = Object.freeze({
  CASH_LOAN: '0',
  MULTI_PUSH: '1',
  REPAYMENT_VISIBLE: '2',
  REPAYMENT_HIDDEN: '3',
})

const state = reactive({
  mode: APP_MODE.CASH_LOAN,
  multiPushTabs: [],
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
    state.multiPushTabs = []
    state.diagnosticCode = 'INVALID_APP_MODE'
    dispatchAppModeEvent('dinero-pro:app-mode-diagnostic', { code: state.diagnosticCode })
    return false
  }

  state.mode = normalized
  if (normalized !== APP_MODE.MULTI_PUSH) state.multiPushTabs = []
  state.diagnosticCode = null
  dispatchAppModeEvent('dinero-pro:app-mode-change', { mode: normalized })
  return true
}

export function setMultiPushTabs(tabs) {
  state.multiPushTabs = Array.isArray(tabs) ? tabs.map((tab) => ({ ...tab })) : []
}

export function shouldShowRepaymentTab(mode = state.mode, tabs = state.multiPushTabs) {
  if (mode !== APP_MODE.MULTI_PUSH) return false
  return tabs.some((tab) => tab?.key === 'repayment' && tab.enabled !== false)
}

export function readInitialAppMode(candidate) {
  const direct = normalizeAppMode(Array.isArray(candidate) ? candidate[0] : candidate)
  if (direct) return direct
  if (typeof window === 'undefined') return APP_MODE.CASH_LOAN

  const searchParams = new URLSearchParams(window.location.search)
  const searchMode = normalizeAppMode(searchParams.get('appMode'))
  if (searchMode) return searchMode

  const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?').slice(1).join('?') : ''
  const hashMode = normalizeAppMode(new URLSearchParams(hashQuery).get('appMode'))
  return hashMode ?? APP_MODE.CASH_LOAN
}

export const appModeState = readonly(state)
