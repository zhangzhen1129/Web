import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const API_HOST = 'https://fixtures.invalid'
const USER_INFO_PATH = '/d6Z/b9V8/Z4W5'
const ADD_ACCOUNT_PATH = '/cd4/d286fhWbY2/YZ1H286fhWbY2q0Ycgbf'
const FORMAT_ERROR_TEXT = 'Número de cuenta del recibo con formato incorrecto'
const SUCCESS_TEXT = 'Vinculación de la tarjeta bancaria con éxito'

function readArgument(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function wait(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay))
}

async function waitForValue(readValue, timeoutMs = 15000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const value = await Promise.resolve().then(readValue).catch(() => null)
    if (value) return value
    await wait(100)
  }
  throw new Error('Timed out while waiting for browser state')
}

async function connectDebugger(browserExecutable, profileDirectory) {
  const port = 10800 + Math.floor(Math.random() * 300)
  const browserProcess = spawn(browserExecutable, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDirectory}`,
    'about:blank',
  ], { stdio: 'ignore' })

  const version = await waitForValue(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`)
    return response.ok ? response.json() : null
  })
  return { browserProcess, webSocketUrl: version.webSocketDebuggerUrl }
}

async function stopBrowser(browserProcess) {
  if (!browserProcess || browserProcess.killed) return
  if (process.platform === 'win32' && browserProcess.pid) {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(browserProcess.pid), '/t', '/f'], { stdio: 'ignore' })
      killer.once('exit', resolve)
      killer.once('error', resolve)
    })
    return
  }
  browserProcess.kill()
}

async function createProtocolClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  let sequence = 0
  const pending = new Map()
  const listeners = new Map()

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result)
      return
    }
    for (const listener of listeners.get(message.method) ?? []) listener(message.params, message.sessionId)
  })

  function send(method, params = {}, sessionId) {
    const id = sequence += 1
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  }

  function on(method, listener) {
    const methodListeners = listeners.get(method) ?? []
    methodListeners.push(listener)
    listeners.set(method, methodListeners)
  }

  return { send, on, close: () => socket.close() }
}

function successEnvelope(extra = {}) {
  return {
    vaOsuw7s: 0,
    bgCAmh0f: { dlWr: 0 },
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    oi: '',
    ...extra,
  }
}

function failurePayload(message) {
  return {
    ...successEnvelope(),
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
    pl9xRlV: message,
  }
}

function sanitizeAddRequest(entry) {
  let body = {}
  try {
    body = JSON.parse(entry.body)
  } catch {}

  return {
    method: entry.method,
    path: entry.path,
    query: entry.query,
    accountNumberPresent: typeof body?.yswWOVNpOUvMLyfcd?.sg4WmVlpmU3Mj === 'string'
      && body.yswWOVNpOUvMLyfcd.sg4WmVlpmU3Mj.length > 0,
    bank: body?.nhxt ?? '',
    bankCode: body?.nxbfuj19OQsO?.jrhBAF7v ?? '',
    type: body?.fwFegVUT?.ekmA,
    nameMatchesFixture: body?.tsMaqR4P?.jyiU === 'Fixture User',
    tokenInBody: typeof body?.yjDnG === 'string',
    gpsEmpty: body?.ulG === '' && body?.vqfH0gehfvNYrW?.rpryc7q8rm === '',
    orderIdPresent: Object.hasOwn(body, 'orderId') || Object.hasOwn(body, 'sf9Qno9CRgP'),
  }
}

async function main() {
  const baseUrl = readArgument('--base-url', 'http://127.0.0.1:5173/')
  const browserExecutable = readArgument('--browser', DEFAULT_BROWSER)
  const outputArgument = readArgument('--output-dir')
  if (!outputArgument) throw new Error('Missing --output-dir')

  const outputDirectory = path.resolve(outputArgument)
  await mkdir(outputDirectory, { recursive: true })
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'add-payment-browser-'))
  const requestLog = []
  const requestHistory = []
  const screenshots = []
  const results = { baseUrl, browserExecutable, scenarios: {}, requests: [], bridge: {}, screenshots: [] }
  let browserProcess
  let client
  let sessionId
  let addDelayMs = 0
  let addResponse = successEnvelope({ iuwUlX3FHD: { ca: '' } })
  let userInfoResponse = successEnvelope({
    xyF2u5qfFaFq32y6: 'Fixture',
    sbkP9S52kXkdGPj8IPdTRAvy: { dp1JgEgUCwfPEw9A: 'User' },
  })

  try {
    const debuggerConnection = await connectDebugger(browserExecutable, profileDirectory)
    browserProcess = debuggerConnection.browserProcess
    client = await createProtocolClient(debuggerConnection.webSocketUrl)
    const target = await client.send('Target.createTarget', { url: 'about:blank' })
    const attached = await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
    sessionId = attached.sessionId
    const send = (method, params = {}) => client.send(method, params, sessionId)

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem('DineroPro:global:api-host', JSON.stringify({ version: 1, value: '${API_HOST}' })) } catch {}
        ;(() => {
          const bridge = window.__addPaymentBridge = { events: [], enabledRequestId: null }
          window.plahub = {
            showLoading(payload) {
              const request = JSON.parse(payload)
              bridge.events.push({ type: 'showLoading', requestId: request.requestId })
              return JSON.stringify({ action: 'showLoading', requestId: request.requestId, status: 'success', message: 'ok' })
            },
            hideLoading(payload) {
              const request = JSON.parse(payload)
              bridge.events.push({ type: 'hideLoading', requestId: request.requestId })
              return JSON.stringify({ action: 'hideLoading', requestId: request.requestId, status: 'success', message: 'ok' })
            },
            setPhysicalBackInterceptConfig(payload) {
              const request = JSON.parse(payload)
              bridge.events.push({ type: 'setPhysicalBackInterceptConfig', payload: request })
              bridge.enabledRequestId = request.enabled ? request.requestId : null
              return JSON.stringify({
                action: 'setPhysicalBackInterceptConfig',
                requestId: request.requestId,
                status: 'success',
                message: 'ok',
              })
            },
          }
        })()`,
    })
    await send('Fetch.enable', { patterns: [{ urlPattern: `${API_HOST}/*`, requestStage: 'Request' }] })

    client.on('Fetch.requestPaused', (event, eventSessionId) => {
      if (eventSessionId !== sessionId) return
      const requestUrl = new URL(event.request.url)
      const requestPath = requestUrl.pathname
      const isUserInfo = requestPath === USER_INFO_PATH
      const isAdd = requestPath === ADD_ACCOUNT_PATH
      const isPreflight = event.request.method === 'OPTIONS'
      if (!isPreflight && (isUserInfo || isAdd)) {
        const entry = {
          method: event.request.method,
          path: requestPath,
          query: requestUrl.search,
          body: event.request.postData ?? '',
        }
        requestHistory.push(entry)
        if (isAdd) requestLog.push(entry)
      }
      const response = isUserInfo ? userInfoResponse : isAdd ? addResponse : null
      const responseCode = isPreflight ? 204 : response ? 200 : 404
      const responseBody = isPreflight || !response ? '' : Buffer.from(JSON.stringify(response)).toString('base64')
      const fulfill = () => send('Fetch.fulfillRequest', {
        requestId: event.requestId,
        responseCode,
        responseHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Access-Control-Allow-Headers', value: '*' },
          { name: 'Access-Control-Allow-Methods', value: '*' },
        ],
        body: responseBody,
      }).catch(() => {})
      if (isAdd && !isPreflight && addDelayMs > 0) setTimeout(fulfill, addDelayMs)
      else void fulfill()
    })

    async function evaluate(expression) {
      const response = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
      return response.result.value
    }

    async function waitForExpression(expression, timeoutMs = 15000) {
      return waitForValue(() => evaluate(expression), timeoutMs)
    }

    async function setViewport(width, height) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: true,
        screenWidth: width,
        screenHeight: height,
      })
    }

    function routeUrl(hash) {
      const url = new URL(baseUrl)
      url.searchParams.set('apiHost', API_HOST)
      url.hash = hash
      return url.toString()
    }

    async function navigate(hash, width = 375, height = 812) {
      await setViewport(width, height)
      await send('Page.navigate', { url: routeUrl(hash) })
      await waitForExpression(`document.readyState === 'complete'`)
    }

    async function screenshot(name) {
      const image = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
      const filename = `${name}.png`
      await writeFile(path.join(outputDirectory, filename), Buffer.from(image.data, 'base64'))
      screenshots.push(filename)
    }

    async function click(selector) {
      const clicked = await evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)})
        if (!element) return false
        element.click()
        return true
      })()`)
      assert.equal(clicked, true, `Missing element: ${selector}`)
    }

    async function fillAccount(value) {
      const filled = await evaluate(`(() => {
        const input = document.querySelector('#add-payment-account-number')
        if (!input) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(input, ${JSON.stringify(value)})
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)
      assert.equal(filled, true)
    }

    async function openPageFromHome() {
      requestLog.length = 0
      const previousUserInfoCount = requestHistory.filter((entry) => entry.path === USER_INFO_PATH).length
      await navigate('#/home')
      await evaluate(`location.hash = '#/addPaymentMethod'`)
      await waitForExpression(`Boolean(document.querySelector('.add-payment-page'))`)
      await waitForValue(() => requestHistory.filter((entry) => entry.path === USER_INFO_PATH).length > previousUserInfoCount)
      await wait(100)
    }

    async function prepareValidForm() {
      await click('#add-payment-bank-trigger')
      await waitForExpression(`document.querySelector('.add-payment-field__trigger')?.getAttribute('aria-expanded') === 'true'`)
      await click('.add-payment-bank-picker__option:nth-child(3)')
      await click('.add-payment-bank-picker__submit')
      await waitForExpression(`document.querySelector('.add-payment-field__trigger')?.getAttribute('aria-expanded') === 'false'`)
      await click('.add-payment-types__option:nth-child(2)')
      await fillAccount('1234567890123')
    }

    await setViewport(390, 844)
    await navigate('#/home')
    requestLog.length = 0
    await evaluate(`location.hash = '#/addPaymentMethod'`)
    await waitForExpression(`Boolean(document.querySelector('.add-payment-page'))`)
    await waitForValue(() => requestHistory.filter((entry) => entry.path === USER_INFO_PATH).length >= 1)
    await wait(100)
    const defaultState = await evaluate(`(() => ({
      hash: location.hash,
      title: document.querySelector('.add-payment-header h1')?.textContent.trim() ?? '',
      bank: document.querySelector('.add-payment-field__trigger span')?.textContent.trim() ?? '',
      accountType: document.querySelector('.add-payment-types__option[aria-checked="true"]')?.textContent.trim() ?? '',
      accountValue: document.querySelector('#add-payment-account-number')?.value ?? '',
      submitDisabled: document.querySelector('.add-payment-footer__submit')?.disabled ?? false,
      scrollContainers: document.querySelectorAll('.add-payment-scroll').length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }))()`)
    assert.deepEqual(defaultState, {
      hash: '#/addPaymentMethod',
      title: 'Añadir método de pago',
      bank: 'Por favor, elija',
      accountType: 'Cuenta de ahorro',
      accountValue: '',
      submitDisabled: true,
      scrollContainers: 1,
      horizontalOverflow: false,
    })
    assert.equal(requestLog.length, 0)
    assert.equal(requestHistory.filter((entry) => entry.path === USER_INFO_PATH).length, 1)
    await screenshot('add-payment-default-390x844')
    await setViewport(375, 812)
    await screenshot('add-payment-default-375x812')
    await setViewport(360, 800)
    await screenshot('add-payment-default-360x800')
    results.scenarios.default = defaultState

    await setViewport(375, 812)
    await click('#add-payment-bank-trigger')
    await waitForExpression(`document.querySelector('.add-payment-field__trigger')?.getAttribute('aria-expanded') === 'true'`)
    await wait(400)
    const pickerOpen = await evaluate(`(() => ({
      title: document.querySelector('.add-payment-bank-picker h2')?.textContent.trim() ?? '',
      options: document.querySelectorAll('.add-payment-bank-picker__option').length,
      selected: document.querySelectorAll('.add-payment-bank-picker__option[aria-checked="true"]').length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }))()`)
    assert.equal(pickerOpen.title, 'Nombre del banco')
    assert.equal(pickerOpen.options, 22)
    assert.equal(pickerOpen.selected, 0)
    assert.equal(pickerOpen.horizontalOverflow, false)
    await screenshot('add-payment-bank-picker-375x812')
    await click('.add-payment-bank-picker__option:nth-child(3)')
    await click('.add-payment-bank-picker__header button')
    await waitForExpression(`document.querySelector('.add-payment-field__trigger')?.getAttribute('aria-expanded') === 'false'`)
    const afterPickerClose = await evaluate(`(() => ({
      bank: document.querySelector('.add-payment-field__trigger span')?.textContent.trim() ?? '',
      draftSelected: document.querySelectorAll('.add-payment-bank-picker__option[aria-checked="true"]').length,
    }))()`)
    assert.equal(afterPickerClose.bank, 'Por favor, elija')
    assert.equal(afterPickerClose.draftSelected, 1)

    await click('#add-payment-bank-trigger')
    await waitForExpression(`document.querySelector('.add-payment-field__trigger')?.getAttribute('aria-expanded') === 'true'`)
    await click('.add-payment-bank-picker__submit')
    await waitForExpression(`document.querySelector('.add-payment-field__trigger')?.getAttribute('aria-expanded') === 'false'`)
    const afterBankConfirm = await evaluate(`(() => ({
      bank: document.querySelector('.add-payment-field__trigger span')?.textContent.trim() ?? '',
      accountType: document.querySelector('.add-payment-types__option[aria-checked="true"]')?.textContent.trim() ?? '',
      accountValue: document.querySelector('#add-payment-account-number')?.value ?? '',
      submitDisabled: document.querySelector('.add-payment-footer__submit')?.disabled ?? false,
    }))()`)
    assert.deepEqual(afterBankConfirm, {
      bank: 'BCP',
      accountType: 'Cuenta de ahorro',
      accountValue: '',
      submitDisabled: true,
    })
    results.scenarios.bankSelection = { pickerOpen, afterPickerClose, afterBankConfirm }

    await click('.add-payment-types__option:nth-child(2)')
    await fillAccount('1234567890123')
    await click('.add-payment-types__option:nth-child(1)')
    const afterTypeSwitch = await evaluate(`(() => ({
      accountType: document.querySelector('.add-payment-types__option[aria-checked="true"]')?.textContent.trim() ?? '',
      accountValue: document.querySelector('#add-payment-account-number')?.value ?? '',
    }))()`)
    assert.deepEqual(afterTypeSwitch, { accountType: 'Cuenta de ahorro', accountValue: '' })

    await click('.add-payment-types__option:nth-child(2)')
    await fillAccount('123456789012')
    const presenceEnabled = await evaluate(`document.querySelector('.add-payment-footer__submit')?.disabled === false`)
    assert.equal(presenceEnabled, true)
    await click('.add-payment-footer__submit')
    await waitForExpression(`document.body.textContent.includes(${JSON.stringify(FORMAT_ERROR_TEXT)})`)
    const invalidState = await evaluate(`(() => ({
      confirmVisible: Boolean(document.querySelector('.add-payment-confirm')?.getBoundingClientRect().height),
      accountValue: document.querySelector('#add-payment-account-number')?.value ?? '',
      toastVisible: document.body.textContent.includes(${JSON.stringify(FORMAT_ERROR_TEXT)}),
    }))()`)
    assert.deepEqual(invalidState, {
      confirmVisible: false,
      accountValue: '123456789012',
      toastVisible: true,
    })
    assert.equal(requestLog.length, 0)

    await fillAccount('1234567890123')
    await wait(2300)
    await click('.add-payment-footer__submit')
    await waitForExpression(`Boolean(document.querySelector('.add-payment-confirm')?.getBoundingClientRect().height)`)
    await wait(400)
    const confirmState = await evaluate(`(() => ({
      bank: [...document.querySelectorAll('.add-payment-confirm__summary dd')][0]?.textContent.trim() ?? '',
      type: [...document.querySelectorAll('.add-payment-confirm__summary dd')][1]?.textContent.trim() ?? '',
      account: [...document.querySelectorAll('.add-payment-confirm__summary dd')][2]?.textContent.trim() ?? '',
      title: document.querySelector('.add-payment-confirm h2')?.textContent.trim() ?? '',
      warning: document.querySelector('.add-payment-confirm__warning')?.textContent.trim() ?? '',
      cardRect: (() => { const r = document.querySelector('.add-payment-confirm')?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null })(),
      titleRect: (() => { const r = document.querySelector('.add-payment-confirm h2')?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null })(),
      summaryRect: (() => { const r = document.querySelector('.add-payment-confirm__summary')?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null })(),
      warningRect: (() => { const r = document.querySelector('.add-payment-confirm__warning')?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null })(),
      okRect: (() => { const r = document.querySelector('.add-payment-confirm__ok')?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null })(),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }))()`)
    assert.equal(confirmState.bank, 'BCP')
    assert.equal(confirmState.type, 'Cuenta corriente')
    assert.equal(confirmState.account, '1234567890123')
    assert.equal(confirmState.title, 'Confirmar la informacionde la cuenta receptora')
    assert.equal(confirmState.warning, 'Asegurese de que la information es correcta, Nose puede cambiar despues de la confirmacion.')
    assert.equal(confirmState.horizontalOverflow, false)
    assert.equal(confirmState.cardRect.top >= 180 && confirmState.cardRect.bottom <= 640, true)
    assert.equal(confirmState.titleRect.bottom <= confirmState.summaryRect.top, true)
    assert.equal(confirmState.summaryRect.bottom <= confirmState.warningRect.top, true)
    assert.equal(confirmState.warningRect.bottom <= confirmState.okRect.top, true)
    assert.equal(confirmState.okRect.bottom <= confirmState.cardRect.bottom, true)

    await screenshot('add-payment-confirm-375x812')
    await click('.add-payment-confirm__cancel')
    await waitForExpression(`!document.querySelector('.add-payment-confirm')?.getBoundingClientRect().height`)
    const canceled = await evaluate(`(() => ({
      account: document.querySelector('#add-payment-account-number')?.value ?? '',
      bank: document.querySelector('.add-payment-field__trigger span')?.textContent.trim() ?? '',
    }))()`)
    assert.deepEqual(canceled, { account: '1234567890123', bank: 'BCP' })
    results.scenarios.validationAndConfirm = { afterTypeSwitch, invalidState, confirmState, canceled }

    await click('.add-payment-footer__submit')
    await waitForExpression(`Boolean(document.querySelector('.add-payment-confirm')?.getBoundingClientRect().height)`)
    const bridgeBeforeSuccess = await evaluate(`window.__addPaymentBridge.events.length`)
    await click('.add-payment-confirm__ok')
    await waitForExpression(`location.hash === '#/home'`)
    await waitForExpression(`document.body.textContent.includes(${JSON.stringify(SUCCESS_TEXT)})`)
    const successState = await evaluate(`(() => ({
      hash: location.hash,
      toastVisible: document.body.textContent.includes(${JSON.stringify(SUCCESS_TEXT)}),
      requests: ${requestLog.length},
    }))()`)
    assert.equal(successState.hash, '#/home')
    assert.equal(successState.toastVisible, true)
    assert.equal(requestLog.length, 1)
    const successRequest = sanitizeAddRequest(requestLog[0])
    assert.equal(successRequest.method, 'POST')
    assert.equal(successRequest.path, ADD_ACCOUNT_PATH)
    assert.equal(successRequest.query, '')
    assert.equal(successRequest.accountNumberPresent, true)
    assert.equal(successRequest.bank, 'BCP')
    assert.equal(successRequest.bankCode, '3')
    assert.equal(successRequest.type, 0)
    assert.equal(successRequest.nameMatchesFixture, true)
    assert.equal(successRequest.tokenInBody, true)
    assert.equal(successRequest.gpsEmpty, true)
    assert.equal(successRequest.orderIdPresent, false)
    const successBridge = await evaluate(`window.__addPaymentBridge.events.slice(${bridgeBeforeSuccess}).map((entry) => entry.type)`)
    assert.deepEqual(successBridge.slice(0, 3), ['showLoading', 'hideLoading', 'setPhysicalBackInterceptConfig'])
    assert.equal(successBridge.filter((type) => type === 'showLoading').length >= 1, true)
    assert.equal(successBridge.filter((type) => type === 'hideLoading').length >= 1, true)
    results.scenarios.success = { state: successState, request: successRequest, bridge: successBridge }
    await wait(2300)

    addResponse = failurePayload('Controlled failure')
    await openPageFromHome()
    await prepareValidForm()
    await click('.add-payment-footer__submit')
    await waitForExpression(`Boolean(document.querySelector('.add-payment-confirm')?.getBoundingClientRect().height)`)
    await click('.add-payment-confirm__ok')
    await waitForExpression(`document.body.textContent.includes('Controlled failure')`)
    const failureState = await evaluate(`({
      hash: location.hash,
      accountValue: document.querySelector('#add-payment-account-number')?.value ?? '',
      toastVisible: document.body.textContent.includes('Controlled failure'),
    })`)
    assert.deepEqual(failureState, {
      hash: '#/addPaymentMethod',
      accountValue: '1234567890123',
      toastVisible: true,
    })
    assert.equal(requestLog.length, 1)

    addResponse = successEnvelope({ iuwUlX3FHD: { ca: '' } })
    requestLog.length = 0
    await click('.add-payment-footer__submit')
    await waitForExpression(`Boolean(document.querySelector('.add-payment-confirm')?.getBoundingClientRect().height)`)
    await click('.add-payment-confirm__ok')
    await waitForExpression(`location.hash === '#/home'`)
    assert.equal(requestLog.length, 1)
    results.scenarios.businessFailureAndRetry = { failureState, retryRequests: requestLog.length }
    await wait(2300)

    await openPageFromHome()
    const bridgeBeforePhysicalBack = await evaluate(`window.__addPaymentBridge.events.length`)
    await click('#add-payment-bank-trigger')
    await waitForExpression(`document.querySelector('.add-payment-field__trigger')?.getAttribute('aria-expanded') === 'true'`)
    const physicalBackDebug = await evaluate(`({
      hasCallback: typeof window.__dineroProPhysicalBackInterceptReply === 'function',
      enabledRequestId: window.__addPaymentBridge.enabledRequestId,
    })`)
    assert.equal(physicalBackDebug.hasCallback, true)
    assert.equal(typeof physicalBackDebug.enabledRequestId, 'string')
    await evaluate(`window.__dineroProPhysicalBackInterceptReply({ action: 'physicalBackIntercepted', requestId: ${JSON.stringify(physicalBackDebug.enabledRequestId)}, status: 'intercepted', message: 'ok' })`)
    await waitForExpression(`location.hash === '#/home'`)
    const physicalBack = await evaluate(`({
      hash: location.hash,
      disableCount: window.__addPaymentBridge.events.slice(${bridgeBeforePhysicalBack}).filter((entry) => entry.type === 'setPhysicalBackInterceptConfig' && entry.payload.enabled === false).length,
    })`)
    assert.deepEqual(physicalBack, { hash: '#/home', disableCount: 1 })
    results.scenarios.physicalBack = physicalBack

    const keyboardViewports = [
      { name: '390x844', width: 390, height: 544 },
      { name: '375x812', width: 375, height: 512 },
      { name: '360x800', width: 360, height: 500 },
    ]
    const keyboardResults = {}
    for (const viewport of keyboardViewports) {
      await openPageFromHome()
      await evaluate(`document.querySelector('#add-payment-account-number').focus()`)
      await setViewport(viewport.width, viewport.height)
      await waitForExpression(`document.querySelector('.add-payment-page')?.classList.contains('add-payment-page--input-focused')`)
      await wait(800)
      const keyboardState = await evaluate(`(() => {
        const scroll = document.querySelector('.add-payment-scroll')
        const input = document.querySelector('#add-payment-account-number')
        const submit = document.querySelector('.add-payment-footer__submit')
        const scrollRect = scroll.getBoundingClientRect()
        const inputRect = input.getBoundingClientRect()
        const submitRect = submit.getBoundingClientRect()
        return {
          scrollable: scroll.scrollHeight > scroll.clientHeight,
          inputVisible: inputRect.top >= scrollRect.top && inputRect.bottom <= scrollRect.bottom,
          submitVisible: submitRect.top >= scrollRect.top && submitRect.bottom <= scrollRect.bottom,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        }
      })()`)
      assert.deepEqual(keyboardState, {
        scrollable: true,
        inputVisible: true,
        submitVisible: true,
        horizontalOverflow: false,
      })
      await screenshot(`add-payment-keyboard-sim-${viewport.name}`)
      keyboardResults[viewport.name] = keyboardState
    }
    results.scenarios.keyboardSimulation = keyboardResults

    await navigate('#/home')
    await setViewport(375, 812)
    await evaluate(`location.hash = '#/addPaymentMethod?extra=1'`)
    await waitForExpression(`location.hash === '#/home'`)
    results.scenarios.invalidQuery = { hash: await evaluate('location.hash') }

    results.requests = requestHistory.map(sanitizeAddRequest)
    results.screenshots = screenshots
    results.bridge = await evaluate(`window.__addPaymentBridge.events`)
    await writeFile(path.join(outputDirectory, 'browser-check.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({ ok: true, screenshots, scenarios: Object.keys(results.scenarios) }, null, 2))
  } finally {
    client?.close()
    await stopBrowser(browserProcess)
    await rm(profileDirectory, { recursive: true, force: true }).catch(() => {})
  }
}

await main()
