import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { getProjectMessage } from '../../../shared/config/projectLanguage.js'
import { BANK_DETAIL_TEXT, formatAccountLabel } from '../bankDetailText.js'

const pageUrl = new URL('./BankDetailPage.vue', import.meta.url)
const styleUrl = new URL('./bankDetailPage.css', import.meta.url)
const source = readFileSync(pageUrl, 'utf8')
const styles = readFileSync(styleUrl, 'utf8')
const assetDir = fileURLToPath(new URL('../../../assets/bankDetail/', import.meta.url))

test('page uses the confirmed Figma text and dynamic account label', () => {
  assert.equal(BANK_DETAIL_TEXT.title, 'Información de la tarjeta')
  assert.equal(BANK_DETAIL_TEXT.defaultCard, 'Tarjeta bancaria por defecto')
  assert.equal(BANK_DETAIL_TEXT.addMethod, 'Agregar un nuevo método')
  assert.equal(BANK_DETAIL_TEXT.submit, 'Enviar')
  assert.equal(BANK_DETAIL_TEXT.empty, 'Sin cuentas agregadas')
  assert.equal(BANK_DETAIL_TEXT.successToast, 'Vinculaci\u00f3n de la tarjeta bancaria con \u00e9xito')
  assert.equal(getProjectMessage('60', 'en'), 'Bank card linked successfully')
  assert.equal(getProjectMessage('60', 'sw'), 'Kadi ya benki imeunganishwa kwa mafanikio')
  assert.match(source, /onSuccessNotice: \(\) => showMessage\(BANK_DETAIL_TEXT\.successToast\)/)
  assert.equal(formatAccountLabel({ bank: 'Banco Uno', accountLast4: '3984' }), 'Banco Uno（3984）')
  assert.match(source, /BANK_DETAIL_TEXT\.defaultCard/)
  assert.match(source, /formatAccountLabel\(account\)/)
})

test('page delegates business work to the controller and keeps global state behind services', () => {
  assert.match(source, /createBankDetailController/)
  assert.match(source, /createBankDetailServices\(\{ getGlobalState: \(\) => globalStore \}\)/)
  assert.match(source, /controller\.initialize\(route\.query\)/)
  assert.match(source, /controller\.selectAccount\(account\.id\)/)
  assert.match(source, /controller\.submit\(\)/)
  assert.match(source, /controller\.navigateAddPaymentMethod\(\)/)
  assert.match(source, /controller\.requestBack\(\)/)
  assert.match(source, /controller\.dispose\(\)/)
  assert.doesNotMatch(source, /axios|fetch\(|XMLHttpRequest|localStorage|sessionStorage|innerHTML|v-html|eval\(|window\.plahub/)
  assert.doesNotMatch(source, /globalStore\.(afId|gaId|fbId|appName|appVersion|packageName|token)/)
  assert.doesNotMatch(source, /[\u3400-\u9fff]/)
})

test('template renders mutually exclusive list and empty states with accessible account selection', () => {
  assert.doesNotMatch(source, /<template v-if="state\.rootState !== 'loading'">/)
  assert.match(source, /<header class="bank-detail-header">[\s\S]*<div v-if="state\.rootState !== 'loading'" class="bank-detail-scroll">/)
  assert.match(source, /state\.rootState === 'list'/)
  assert.match(source, /state\.rootState === 'empty'/)
  assert.match(source, /v-for="\(account, index\) in state\.accounts"/)
  assert.match(source, /:key="`\$\{index\}-\$\{account\.accountLast4\}`"/)
  assert.doesNotMatch(source, /:key="account\.id"/)
  assert.match(source, /:aria-pressed="isSelected\(account\)"/)
  assert.match(source, /@click="controller\.selectAccount\(account\.id\)"/)
  assert.match(source, /v-if="showDefaultCard\(account\)"/)
  assert.match(source, /v-if="state\.rootState === 'list'" class="bank-detail-footer"/)
  assert.doesNotMatch(source, /https?:\/\//)
})

test('page imports only the bankDetail-local exported assets', () => {
  for (const name of ['back.svg', 'bank-selected.svg', 'bank-unselected.svg', 'check.svg', 'plus.svg', 'empty.png']) {
    assert.match(source, new RegExp(`assets/bankDetail/${name.replace('.', '\\.')}`))
    assert.equal(existsSync(`${assetDir}${name}`), true, `${name} should exist`)
  }

  for (const name of ['back.svg', 'bank-selected.svg', 'bank-unselected.svg', 'check.svg', 'plus.svg']) {
    const content = readFileSync(`${assetDir}${name}`, 'utf8')
    assert.match(content, /<svg\b/)
    assert.match(content, /viewBox=/)
  }

  const emptyPng = readFileSync(`${assetDir}empty.png`)
  assert.equal(emptyPng.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(emptyPng.readUInt32BE(16), 366)
  assert.equal(emptyPng.readUInt32BE(20), 216)
})

test('layout keeps one vertical scroll, safe areas, exact Figma colors, and long-text handling', () => {
  assert.match(styles, /height:\s*100dvh/)
  assert.match(styles, /flex-direction:\s*column/)
  assert.match(styles, /\.bank-detail-scroll[\s\S]*overflow-y:\s*auto/)
  assert.match(styles, /var\(--app-safe-area-top\)/)
  assert.match(styles, /env\(safe-area-inset-bottom\)/)
  assert.match(styles, /position:\s*sticky/)
  assert.match(styles, /\.bank-detail-account--selected[\s\S]*border-color:\s*#3a46f9/)
  assert.match(styles, /background:\s*#155dfc/)
  assert.match(styles, /background:\s*#f7de5a/)
  assert.match(styles, /color:\s*#a7a7a7/)
  assert.match(styles, /\.bank-detail-account__name\s*\{[^}]*white-space:\s*normal/)
  assert.doesNotMatch(styles, /\.bank-detail-account__name\s*\{[^}]*text-overflow:\s*ellipsis/)
  assert.match(styles, /text-overflow:\s*ellipsis/)
  assert.match(styles, /min-height:\s*1\.64103rem/)
  assert.match(styles, /min-height:\s*2\.51282rem/)
  assert.match(styles, /\.41026rem/)
})