import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const API_HOST = 'https://fixtures.invalid'
const LIST_PATH = '/dGd/mvhzoK5E7v/I9DdKorit9V7tjLiKKznK'
const UPDATE_PATH = '/x3L/USPWW7D1FS/0RRLT1tROQkD5G'
const FULL_ACCOUNT_NUMBER = '1111222233331234'
const DEFAULT_ACCOUNTS = [
  account('account-default', 'BBVA', FULL_ACCOUNT_NUMBER, 1),
  account('account-second', 'Interbank', '9999888877774321', 0),
  account('account-third', 'BCP', '8888777766665555', 0),
  account('account-fourth', 'Scotiabank', '7777666655554444', 0),
]

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
    const value = await readValue().catch(() => null)
    if (value) return value
    await wait(100)
  }
  throw new Error('Timed out while waiting for browser state')
}

async function connectDebugger(browserExecutable, profileDirectory) {
  const port = 10400 + Math.floor(Math.random() * 400)
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

function account(id, bank, accountNumber, markLoanCard) {
  return { id, bank, accountNumber, markLoanCard }
}

function listPayload(accounts) {
  return successEnvelope({ qrAbsjzu7WLU: { baIJ: accounts } })
}

function sanitizeRequest(entry) {
  let body = {}
  try {
    body = JSON.parse(entry.body)
  } catch {}
  const accountId = body?.ablZsa94bVDTb5t4stcHUlS?.xhklrw8qahCfarsqrPb
  return {
    method: entry.method,
    path: entry.path,
    query: entry.query,
    accountIdPresent: typeof accountId === 'string' && accountId.trim().length > 0,
    orderIdPresent: Object.hasOwn(body, 'orderId') || Object.hasOwn(body, 'sf9Qno9CRgP'),
    gpsEmpty: body?.ulG === '' && body?.vqfH0gehfvNYrW?.rpryc7q8rm === '',
  }
}

function failurePayload(message) {
  return {
    ...successEnvelope(),
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
    pl9xRlV: message,
  }
}

async function main() {
  const baseUrl = readArgument('--base-url', 'http://127.0.0.1:4173/')
  const browserExecutable = readArgument('--browser', DEFAULT_BROWSER)
  const outputArgument = readArgument('--output-dir')
  if (!outputArgument) throw new Error('Missing --output-dir')
  const outputDirectory = path.resolve(outputArgument)
  await mkdir(outputDirectory, { recursive: true })

  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'bank-detail-browser-'))
  const requestLog = []
  const screenshots = []
  const results = { baseUrl, browserExecutable, scenarios: {}, requests: [], bridge: {}, screenshots: [] }
  let browserProcess
  let client
  let sessionId

  let listResponse = listPayload(DEFAULT_ACCOUNTS)
  let listResponseDelayMs = 0
  let updateResponse = successEnvelope()

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
        const bridge = window.__bankDetailBridge = { events: [], enabledRequestId: null }
        window.plahub = {
          showLoading(payload) {
            bridge.events.push({ type: 'showLoading', payload: JSON.parse(payload) })
            return JSON.stringify({ status: 'success', message: 'ok' })
          },
          hideLoading(payload) {
            bridge.events.push({ type: 'hideLoading', payload: JSON.parse(payload) })
            return JSON.stringify({ status: 'success', message: 'ok' })
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
      const isList = requestPath === LIST_PATH
      const isUpdate = requestPath === UPDATE_PATH
      const isPreflight = event.request.method === 'OPTIONS'
      if (!isPreflight && (isList || isUpdate)) {
        requestLog.push({
          method: event.request.method,
          path: requestPath,
          query: requestUrl.search,
          body: event.request.postData ?? '',
        })
      }
      const response = isList ? listResponse : isUpdate ? updateResponse : null
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
      if (!isPreflight && isList && listResponseDelayMs > 0) setTimeout(fulfill, listResponseDelayMs)
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
      const targetUrl = routeUrl(hash)
      await send('Page.navigate', { url: targetUrl })
      await waitForExpression(`document.readyState === 'complete'`)
      await send('Page.reload', { ignoreCache: true })
      await waitForExpression(`document.readyState === 'complete'`)
    }

    async function screenshot(name) {
      const image = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
      const filename = `${name}.png`
      await writeFile(path.join(outputDirectory, filename), Buffer.from(image.data, 'base64'))
      screenshots.push(filename)
    }

    function findRequest(requestPath) {
      return requestLog.filter((entry) => entry.path === requestPath)
    }

    async function reloadListScenario(accounts = DEFAULT_ACCOUNTS) {
      requestLog.length = 0
      listResponse = listPayload(accounts)
      updateResponse = successEnvelope()
      await navigate('#/bankDetail')
      await waitForExpression(`Boolean(document.querySelector('[aria-label="Lista de cuentas"]'))`)
    }

    listResponse = listPayload(DEFAULT_ACCOUNTS)
    listResponseDelayMs = 1200
    await navigate('#/bankDetail')
    await waitForExpression(`Boolean(document.querySelector('.bank-detail-header'))`)
    const initialHeaderState = await evaluate(`({
      title: document.querySelector('.bank-detail-header h1')?.textContent.trim() ?? '',
      listContent: document.querySelectorAll('.bank-detail-content').length,
      footer: document.querySelectorAll('.bank-detail-footer').length,
    })`)
    assert.deepEqual(initialHeaderState, {
      title: 'Información de la tarjeta',
      listContent: 0,
      footer: 0,
    })
    await waitForExpression(`Boolean(document.querySelector('[aria-label="Lista de cuentas"]'))`)
    listResponseDelayMs = 0
    results.scenarios.initialHeader = initialHeaderState

    await reloadListScenario()
    const listState = await evaluate(`(() => {
      const cards = [...document.querySelectorAll('.bank-detail-account')]
      const selected = cards.filter((card) => card.getAttribute('aria-pressed') === 'true')
      return {
        hash: location.hash,
        cardCount: cards.length,
        selectedCount: selected.length,
        defaultLabel: document.querySelector('.bank-detail-account__default')?.textContent.trim() ?? '',
        addText: document.querySelector('.bank-detail-add')?.textContent.trim() ?? '',
        submitText: document.querySelector('.bank-detail-footer__submit')?.textContent.trim() ?? '',
        html: document.documentElement.outerHTML,
      }
    })()`)
    assert.equal(listState.hash, '#/bankDetail')
    assert.equal(listState.cardCount, 4)
    assert.equal(listState.selectedCount, 1)
    assert.equal(listState.defaultLabel, 'Tarjeta bancaria por defecto')
    assert.equal(listState.addText, 'Agregar un nuevo método')
    assert.equal(listState.submitText, 'Enviar')
    assert.equal(listState.html.includes(FULL_ACCOUNT_NUMBER), false)
    assert.equal(listState.html.includes('（1234）'), true)
    await screenshot('bank-detail-list-375x812')
    await setViewport(360, 800)
    await screenshot('bank-detail-list-360x800')
    results.scenarios.list = { cardCount: listState.cardCount, selectedCount: listState.selectedCount, defaultLabel: listState.defaultLabel, addText: listState.addText, submitText: listState.submitText, fullAccountExposed: false }

    await reloadListScenario()
    await evaluate(`document.querySelector('.bank-detail-account:nth-child(2)').click()`)
    const switched = await evaluate(`({
      selected: document.querySelectorAll('.bank-detail-account[aria-pressed="true"]').length,
      selectedDefaultLabel: document.querySelector('.bank-detail-account[aria-pressed="true"] .bank-detail-account__default')?.textContent.trim() ?? '',
    })`)
    assert.equal(switched.selected, 1)
    assert.equal(switched.selectedDefaultLabel, '')
    results.scenarios.selection = switched

    await reloadListScenario()
    await evaluate(`document.querySelector('.bank-detail-footer__submit').click()`)
    await waitForExpression(`location.hash === '#/home'`)
    await waitForExpression(`document.body.textContent.includes('Vinculaci\u00f3n de la tarjeta bancaria con \u00e9xito')`)
    const successToastVisible = await evaluate(`document.body.textContent.includes('Vinculaci\u00f3n de la tarjeta bancaria con \u00e9xito')`)
    assert.equal(successToastVisible, true)
    const updateRequests = findRequest(UPDATE_PATH)
    assert.equal(updateRequests.length, 1)
    const updateBody = JSON.parse(updateRequests[0].body)
    assert.equal(updateBody.ablZsa94bVDTb5t4stcHUlS.xhklrw8qahCfarsqrPb, 'account-default')
    assert.equal(Object.hasOwn(updateBody, 'orderId'), false)
    assert.equal(updateBody.sf9Qno9CRgP, undefined)
    const successBridge = await evaluate(`window.__bankDetailBridge.events.map((entry) => entry.type)`)
    assert.equal(successBridge.filter((type) => type === 'showLoading').length >= 2, true)
    assert.equal(successBridge.filter((type) => type === 'hideLoading').length >= 2, true)
    assert.equal(successBridge.filter((type) => type === 'setPhysicalBackInterceptConfig').length >= 2, true)
    results.scenarios.submit = { request: sanitizeRequest(updateRequests[0]), bridgeEvents: successBridge, referenceToastConfirmed: successToastVisible }

    await reloadListScenario()
    await evaluate(`document.querySelector('.bank-detail-add').click()`)
    await waitForExpression(`location.hash === '#/addPaymentMethod'`)
    const addRoute = await evaluate(`({
      hash: location.hash,
      title: document.querySelector('.route-placeholder h1')?.textContent.trim() ?? '',
      query: location.hash.includes('?'),
    })`)
    assert.equal(addRoute.hash, '#/addPaymentMethod')
    assert.equal(addRoute.title, 'Add payment method')
    assert.equal(addRoute.query, false)
    results.scenarios.addPaymentMethod = addRoute

    const longBankName = 'Banco de Credito del Peru Sucursal Central'
    const longAccounts = Array.from({ length: 8 }, (_, index) => account(
      `long-account-${index + 1}`,
      index === 0 ? longBankName : `Long Bank Name Number ${index + 1}`,
      String(1000000000000000 + index),
      index === 0 ? 1 : 0,
    ))
    await reloadListScenario(longAccounts)
    const longListState = await evaluate(`(() => {
      const scroll = document.querySelector('.bank-detail-scroll')
      const footer = document.querySelector('.bank-detail-footer')
      const footerRect = footer.getBoundingClientRect()
      return {
        fullBankVisible: document.body.textContent.includes(${JSON.stringify(longBankName)}),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        scrollable: scroll.scrollHeight > scroll.clientHeight,
        footerVisible: footerRect.top >= 0 && footerRect.bottom <= window.innerHeight,
      }
    })()`)
    assert.equal(longListState.fullBankVisible, true)
    assert.equal(longListState.horizontalOverflow, false)
    assert.equal(longListState.scrollable, true)
    assert.equal(longListState.footerVisible, true)
    await evaluate(`document.querySelector('.bank-detail-scroll').scrollTop = document.querySelector('.bank-detail-scroll').scrollHeight`)
    await screenshot('bank-detail-long-list-bottom-375x812')
    results.scenarios.longList = longListState

    requestLog.length = 0
    listResponse = listPayload([])
    await navigate('#/bankDetail')
    await waitForExpression(`Boolean(document.querySelector('.bank-detail-empty'))`)
    const emptyState = await evaluate(`({
      cards: document.querySelectorAll('.bank-detail-account').length,
      add: document.querySelectorAll('.bank-detail-add').length,
      submit: document.querySelectorAll('.bank-detail-footer__submit').length,
      text: document.querySelector('.bank-detail-empty p')?.textContent.trim() ?? '',
    })`)
    assert.deepEqual(emptyState, { cards: 0, add: 0, submit: 0, text: 'Sin cuentas agregadas' })
    await screenshot('bank-detail-empty-375x812')
    await setViewport(360, 800)
    await screenshot('bank-detail-empty-360x800')
    results.scenarios.empty = emptyState

    listResponse = failurePayload('Card list failed')
    await navigate('#/bankDetail')
    await waitForExpression(`Boolean(document.querySelector('.bank-detail-empty'))`)
    await waitForExpression(`document.body.textContent.includes('Card list failed')`)
    const failureState = await evaluate(`({
      cards: document.querySelectorAll('.bank-detail-account').length,
      add: document.querySelectorAll('.bank-detail-add').length,
      toast: document.body.textContent.includes('Card list failed'),
    })`)
    assert.deepEqual(failureState, { cards: 0, add: 0, toast: true })
    results.scenarios.businessFailure = failureState

    listResponse = listPayload(DEFAULT_ACCOUNTS)
    await navigate('#/home')
    await evaluate(`location.hash = '#/bankDetail'`)
    await waitForExpression(`Boolean(document.querySelector('[aria-label="Lista de cuentas"]'))`)
    const physicalBackDebug = await evaluate(`({
      hasCallback: typeof window.__dineroProPhysicalBackInterceptReply === 'function',
      enabledRequestId: window.__bankDetailBridge.enabledRequestId,
    })`)
    if (!physicalBackDebug.hasCallback || !physicalBackDebug.enabledRequestId) {
      throw new Error(`Physical back bridge unavailable: ${JSON.stringify(physicalBackDebug)}`)
    }
    await evaluate(`window.__dineroProPhysicalBackInterceptReply({ action: 'physicalBackIntercepted', requestId: ${JSON.stringify(physicalBackDebug.enabledRequestId)}, status: 'intercepted', message: 'ok' })`)
    await waitForExpression(`location.hash === '#/home'`)
    const physicalBack = await evaluate(`({
      hash: location.hash,
      disableCount: window.__bankDetailBridge.events.filter((entry) => entry.type === 'setPhysicalBackInterceptConfig' && entry.payload.enabled === false).length,
    })`)
    assert.equal(physicalBack.hash, '#/home')
    assert.equal(physicalBack.disableCount, 1)
    results.scenarios.physicalBack = physicalBack

    await navigate('#/bankDetail?extra=1')
    await waitForExpression(`location.hash === '#/home'`)
    results.scenarios.invalidQuery = { hash: await evaluate('location.hash') }

    await navigate('#/addPaymentMethod?extra=1')
    await waitForExpression(`location.hash === '#/home'`)
    results.scenarios.addPaymentMethodInvalidQuery = { hash: await evaluate('location.hash') }

    results.requests = requestLog.map(sanitizeRequest)
    results.screenshots = screenshots
    results.bridge = await evaluate(`window.__bankDetailBridge.events`)
    await writeFile(path.join(outputDirectory, 'browser-check.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({ ok: true, screenshots, scenarios: Object.keys(results.scenarios) }, null, 2))
  } finally {
    client?.close()
    await stopBrowser(browserProcess)
    await rm(profileDirectory, { recursive: true, force: true }).catch(() => {})
  }
}

await main()
