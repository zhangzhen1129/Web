import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const API_PATH = '/o7y/ufJWDay6D/x0IbE9O'
const API_HOST = 'https://fixtures.invalid'
const SUCCESS_CODE = 2000
const BUSINESS_FAILURE_CODE = 2001
const DEFAULT_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const FEATURE_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, '..')
const WEB_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, '../../../..')
const SAMPLE_FIGMA_VALUES = /S\/\s*5,000|2025-11-20|7\s+d[ií]as/

const TWO_RECORDS = Object.freeze([
  Object.freeze({
    extensionStages: 1,
    approvalDate: '2031-04-05',
    amount: 1234,
    extendedTerm: 11,
    updatedDueDate: '2031-04-16',
  }),
  Object.freeze({
    extensionStages: 2,
    approvalDate: '2032-12-31',
    amount: 1234567,
    extendedTerm: 365,
    updatedDueDate: '2033-12-31',
  }),
])

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
    try {
      const value = await readValue()
      if (value) return value
    } catch {}
    await wait(100)
  }
  throw new Error('Timed out while waiting for browser state')
}

async function connectDebugger(browserExecutable, profileDirectory) {
  const port = 10100 + Math.floor(Math.random() * 400)
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
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      return response.ok ? response.json() : null
    } catch {
      return null
    }
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

function successPayload(records) {
  return {
    vaOsuw7s: 0,
    bgCAmh0f: { dlWr: 0 },
    cyiUgNvO2EPltj: { atY3WWbXIN: SUCCESS_CODE },
    pl9xRlV: '',
    oi: '',
    qrAbsjzu7WLU: { baIJ: records },
  }
}

function businessFailurePayload(message) {
  return {
    ...successPayload([]),
    cyiUgNvO2EPltj: { atY3WWbXIN: BUSINESS_FAILURE_CODE },
    pl9xRlV: message,
  }
}

function structuralInvalidPayload() {
  return {
    ...successPayload([]),
    qrAbsjzu7WLU: { baIJ: { invalid: true } },
  }
}

function countEvent(events, type) {
  return events.filter((entry) => entry.type === type).length
}

function assertBridgeCycle(events, { expectDisable = false, requireHideAfterDisable = true } = {}) {
  const showIndex = events.findIndex((entry) => entry.type === 'showLoading')
  const enableIndex = events.findIndex((entry) => entry.type === 'setPhysicalBackInterceptConfig' && entry.payload.enabled === true)
  const disableIndex = events.findIndex((entry) => entry.type === 'setPhysicalBackInterceptConfig' && entry.payload.enabled === false)
  const hideIndex = events.findIndex((entry) => entry.type === 'hideLoading')

  assert.equal(countEvent(events, 'showLoading'), 1)
  assert.equal(countEvent(events, 'hideLoading'), 1)
  assert.equal(events.filter((entry) => entry.type === 'setPhysicalBackInterceptConfig' && entry.payload.enabled === true).length, 1)
  assert.ok(showIndex >= 0)
  assert.ok(enableIndex > showIndex)
  assert.ok(hideIndex > enableIndex)

  if (expectDisable) {
    assert.equal(events.filter((entry) => entry.type === 'setPhysicalBackInterceptConfig' && entry.payload.enabled === false).length, 1)
    assert.ok(disableIndex > enableIndex)
    if (requireHideAfterDisable) assert.ok(hideIndex > disableIndex)
    else assert.ok(hideIndex > enableIndex && hideIndex < disableIndex)
  } else {
    assert.equal(disableIndex, -1)
  }
}

async function collectProductionFiles(directory) {
  const files = []
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'testing') continue
      files.push(...await collectProductionFiles(fullPath))
      continue
    }
    if (entry.name.endsWith('.test.js')) continue
    files.push(fullPath)
  }
  return files
}

async function assertNoFigmaSampleValues() {
  const featureFiles = await collectProductionFiles(FEATURE_DIRECTORY)
  const routerFile = path.join(WEB_DIRECTORY, 'src/router/index.js')
  const files = [...new Set([...featureFiles, routerFile])]
  const checked = []

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    assert.doesNotMatch(source, SAMPLE_FIGMA_VALUES, `${path.relative(WEB_DIRECTORY, file)} contains a Figma sample value`)
    checked.push(path.relative(WEB_DIRECTORY, file).replaceAll('\\', '/'))
  }

  return checked
}

async function main() {
  const baseUrl = readArgument('--base-url', `http://127.0.0.1:4173/?apiHost=${encodeURIComponent(API_HOST)}`)
  const browserExecutable = readArgument('--browser', DEFAULT_BROWSER)
  const outputArgument = readArgument('--output-dir')
  if (!outputArgument) throw new Error('Missing --output-dir')
  const outputDirectory = path.resolve(outputArgument)

  const scriptSource = await readFile(fileURLToPath(import.meta.url), 'utf8')
  assert.doesNotMatch(scriptSource, /[\u3400-\u9fff]/, 'Browser check source must not contain Chinese characters')
  const productionScanFiles = await assertNoFigmaSampleValues()

  await mkdir(outputDirectory, { recursive: true })
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'defer-history-browser-'))
  let browserProcess
  let client

  const browserErrors = []
  const requestLog = []
  const expectedOrderIds = []
  const screenshotsWritten = []
  const results = {
    baseUrl,
    browserExecutable,
    productionScanFiles,
    screenshotNames: [],
    scenarios: {},
  }

  let apiResponse = {
    statusCode: 200,
    contentType: 'application/json',
    body: JSON.stringify(successPayload(TWO_RECORDS)),
    delayMs: 0,
  }

  function setApiPayload(payload, delayMs = 0) {
    apiResponse = {
      statusCode: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
      delayMs,
    }
  }

  function setApiHttpFailure(statusCode = 500) {
    apiResponse = {
      statusCode,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'request failed' }),
      delayMs: 0,
    }
  }

  function expectOrder(orderId) {
    expectedOrderIds.push(orderId)
  }

  function requestsForOrder(orderId) {
    return requestLog.filter((entry) => {
      try {
        return JSON.parse(entry.body)?.ca === orderId
      } catch {
        return false
      }
    })
  }

  try {
    const debuggerConnection = await connectDebugger(browserExecutable, profileDirectory)
    browserProcess = debuggerConnection.browserProcess
    client = await createProtocolClient(debuggerConnection.webSocketUrl)

    const target = await client.send('Target.createTarget', { url: 'about:blank' })
    const attached = await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
    const sessionId = attached.sessionId
    const send = (method, params = {}) => client.send(method, params, sessionId)

    client.on('Runtime.exceptionThrown', (event, eventSessionId) => {
      if (eventSessionId === sessionId) browserErrors.push(event.exceptionDetails.text)
    })
    client.on('Runtime.consoleAPICalled', (event, eventSessionId) => {
      if (eventSessionId === sessionId && event.type === 'error') browserErrors.push('console.error')
    })

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem('DineroPro:global:api-host', JSON.stringify({ version: 1, value: '${API_HOST}' })) } catch {}`,
    })
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        const bridge = window.__deferHistoryBridge = {
          events: [],
          navigationCalls: [],
          enabledRequestId: null,
        }

        for (const method of ['pushState', 'replaceState']) {
          const original = window.history[method]
          window.history[method] = function (...args) {
            bridge.navigationCalls.push({ method, url: String(args[2] ?? '') })
            return original.apply(this, args)
          }
        }

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
            if (request.enabled) bridge.enabledRequestId = request.requestId
            else bridge.enabledRequestId = null
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
    await send('Fetch.enable', {
      patterns: [{ urlPattern: `${API_HOST}/*`, requestStage: 'Request' }],
    })
    client.on('Fetch.requestPaused', (event, eventSessionId) => {
      if (eventSessionId !== sessionId) return
      const requestUrl = new URL(event.request.url)
      const responseSnapshot = apiResponse
      const isPreflight = event.request.method === 'OPTIONS'
      const isHistoryRequest = requestUrl.pathname === API_PATH

      if (!isPreflight && isHistoryRequest) {
        requestLog.push({
          method: event.request.method,
          path: requestUrl.pathname,
          search: requestUrl.search,
          hash: requestUrl.hash,
          body: event.request.postData ?? '',
        })
      }

      const responseCode = isPreflight ? 204 : isHistoryRequest ? responseSnapshot.statusCode : 404
      const responseBody = isPreflight || !isHistoryRequest
        ? ''
        : Buffer.from(responseSnapshot.body).toString('base64')
      const responseContentType = isPreflight ? 'text/plain' : 'application/json'

      const fulfill = () => send('Fetch.fulfillRequest', {
        requestId: event.requestId,
        responseCode,
        responseHeaders: [
          { name: 'Content-Type', value: responseContentType },
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Access-Control-Allow-Headers', value: '*' },
          { name: 'Access-Control-Allow-Methods', value: '*' },
        ],
        body: responseBody,
      }).catch(() => {})

      if (!isPreflight && isHistoryRequest && responseSnapshot.delayMs > 0) {
        setTimeout(fulfill, responseSnapshot.delayMs)
      } else {
        void fulfill()
      }
    })

    async function evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
      return result.result.value
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

    async function screenshot(name) {
      await evaluate(`document.querySelector('#__vconsole')?.remove()`)
      const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
      screenshotsWritten.push(`${name}.png`)
      await writeFile(path.join(outputDirectory, `${name}.png`), Buffer.from(result.data, 'base64'))
    }

    let navigationSequence = 0
    async function navigate(fragment, width = 375, height = 812) {
      await setViewport(width, height)
      const navigationUrl = new URL(baseUrl)
      navigationSequence += 1
      navigationUrl.searchParams.set('run', `${Date.now()}-${navigationSequence}`)
      navigationUrl.hash = fragment
      await send('Page.navigate', { url: navigationUrl.toString() })
      await waitForValue(() => evaluate('document.readyState === "complete" && Boolean(document.querySelector("#app"))'))
    }

    function historyFragment(orderId, { includeProductId = false } = {}) {
      const query = new URLSearchParams({ orderId, orderStatus: '80' })
      if (includeProductId) query.set('productId', 'ignored-product-route-value')
      return `#/deferHistory?${query.toString()}`
    }

    async function openHistory(orderId, { width = 375, height = 812, includeProductId = false } = {}) {
      expectOrder(orderId)
      await navigate(historyFragment(orderId, { includeProductId }), width, height)
      await waitForValue(() => evaluate('Boolean(document.querySelector(".defer-history-page"))'))
      await waitForValue(() => requestsForOrder(orderId).length === 1)
    }

    async function eventSnapshot() {
      return evaluate(`(() => ({
        events: window.__deferHistoryBridge.events,
        enabledRequestId: window.__deferHistoryBridge.enabledRequestId,
      }))()`)
    }

    async function readLayout() {
      return evaluate(`(() => {
        const root = document.querySelector('.defer-history-page')
        const rootRect = root.getBoundingClientRect()
        const scrollContainers = [root, ...root.querySelectorAll('*')]
          .filter((node) => ['auto', 'scroll'].includes(getComputedStyle(node).overflowY))
          .map((node) => node.className || node.tagName.toLowerCase())
        return {
          headerTitle: document.querySelector('.defer-history-header__title')?.textContent.trim() ?? '',
          pageShell: Boolean(root),
          listContainer: Boolean(document.querySelector('.defer-history-list')),
          cards: [...document.querySelectorAll('.defer-history-item')].map((item) => ({
            title: item.querySelector('.defer-history-item__title')?.textContent.trim() ?? '',
            labels: [...item.querySelectorAll('.defer-history-card__label')].map((node) => node.textContent.trim()),
            values: [...item.querySelectorAll('.defer-history-card__value')].map((node) => node.textContent.trim()),
          })),
          toastCount: document.querySelectorAll('.van-toast').length,
          horizontalOverflow: root.scrollWidth > root.clientWidth + 1
            || document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          scrollContainers,
          rootMetrics: {
            width: Math.round(rootRect.width),
            height: Math.round(rootRect.height),
            clientHeight: root.clientHeight,
            scrollHeight: root.scrollHeight,
          },
        }
      })()`)
    }

    function assertNoOverflow(layout, label) {
      assert.equal(layout.horizontalOverflow, false, `${label} has horizontal overflow`)
      assert.equal(layout.scrollContainers.length, 1, `${label} must have one vertical scroll container`)
    }

    const delayedOrderId = 'route-delay-001'
    setApiPayload(successPayload(TWO_RECORDS), 1500)
    await openHistory(delayedOrderId, { width: 375, height: 812 })
    await wait(120)
    const loadingBridge = await eventSnapshot()
    const loadingLayout = await readLayout()
    results.scenarios.loadingShell = {
      viewport: { width: 375, height: 812 },
      bridge: loadingBridge,
      layout: loadingLayout,
    }
    await screenshot('defer-history-loading-375x812')
    assert.equal(loadingLayout.pageShell, true)
    assert.equal(loadingLayout.listContainer, true)
    assert.equal(loadingLayout.cards.length, 0)
    assert.equal(countEvent(loadingBridge.events, 'showLoading'), 1)
    assert.equal(countEvent(loadingBridge.events, 'hideLoading'), 0)
    assert.equal(loadingBridge.events.some((entry) => entry.type === 'setPhysicalBackInterceptConfig' && entry.payload.enabled === true), true)
    assertNoOverflow(loadingLayout, 'loading shell 375x812')

    const twoRecordViewports = [
      { label: '390x844', width: 390, height: 844, orderId: 'route-records-390' },
      { label: '375x812', width: 375, height: 812, orderId: 'route-records-375' },
      { label: '360x800', width: 360, height: 800, orderId: 'route-records-360' },
    ]
    const expectedTwoRecordValues = [
      ['2031-04-05', 'S/ 1,234', '11 días', '2031-04-16'],
      ['2032-12-31', 'S/ 1,234,567', '365 días', '2033-12-31'],
    ]

    for (const viewport of twoRecordViewports) {
      setApiPayload(successPayload(TWO_RECORDS))
      await openHistory(viewport.orderId, {
        width: viewport.width,
        height: viewport.height,
        includeProductId: viewport.label === '375x812',
      })
      await waitForValue(() => evaluate('document.querySelectorAll(".defer-history-item").length === 2'))
      await waitForValue(() => evaluate('window.__deferHistoryBridge.events.some((entry) => entry.type === "hideLoading")'))
      const layout = await readLayout()
      const bridge = await eventSnapshot()
      results.scenarios[`twoRecords${viewport.width}x${viewport.height}`] = {
        viewport: { width: viewport.width, height: viewport.height },
        bridge,
        layout,
      }
      await screenshot(`defer-history-two-records-${viewport.width}x${viewport.height}`)
      assert.equal(layout.headerTitle, 'Historial de prórrogas')
      assert.equal(layout.cards.length, 2)
      assert.deepEqual(layout.cards.map((card) => card.title), ['Detalles de la prórroga', 'Detalles de la prórroga'])
      assert.deepEqual(layout.cards.map((card) => card.labels), [
        ['Fecha de aplicación', 'Monto de la prórroga', 'Plazo de aplazamiento', 'Fecha de vencimiento actualizada'],
        ['Fecha de aplicación', 'Monto de la prórroga', 'Plazo de aplazamiento', 'Fecha de vencimiento actualizada'],
      ])
      assert.deepEqual(layout.cards.map((card) => card.values), expectedTwoRecordValues)
      assertNoOverflow(layout, `two records ${viewport.label}`)
      assertBridgeCycle(bridge.events)
    }

    const LONG_RECORDS = [
      {
        extensionStages: 3,
        approvalDate: '2045-12-31T23:59:59-05:00',
        amount: 123456789.5,
        extendedTerm: 12345,
        updatedDueDate: '2046-01-01T00:00:00-05:00',
      },
      {
        extensionStages: 4,
        approvalDate: '2050-01-01T00:00:00-05:00',
        amount: 999999999,
        extendedTerm: 3650,
        updatedDueDate: '2060-01-01T00:00:00-05:00',
      },
    ]
    setApiPayload(successPayload(LONG_RECORDS))
    await openHistory('route-long-001', { width: 375, height: 812 })
    await waitForValue(() => evaluate('document.querySelectorAll(".defer-history-item").length === 2'))
    await waitForValue(() => evaluate('window.__deferHistoryBridge.events.some((entry) => entry.type === "hideLoading")'))
    const longLayout = await readLayout()
    const longBridge = await eventSnapshot()
    results.scenarios.longValues = { bridge: longBridge, layout: longLayout }
    await screenshot('defer-history-long-values-375x812')
    assert.deepEqual(longLayout.cards.map((card) => card.values), [
      ['2045-12-31T23:59:59-05:00', 'S/ 123,456,789.5', '12345 días', '2046-01-01T00:00:00-05:00'],
      ['2050-01-01T00:00:00-05:00', 'S/ 999,999,999', '3650 días', '2060-01-01T00:00:00-05:00'],
    ])
    assertNoOverflow(longLayout, 'long values 375x812')
    assertBridgeCycle(longBridge.events)

    setApiPayload(successPayload([]))
    await openHistory('route-empty-001', { width: 375, height: 812 })
    await waitForValue(() => evaluate('window.__deferHistoryBridge.events.some((entry) => entry.type === "hideLoading")'))
    await wait(80)
    const emptyLayout = await readLayout()
    const emptyBridge = await eventSnapshot()
    results.scenarios.emptyArray = { bridge: emptyBridge, layout: emptyLayout }
    await screenshot('defer-history-empty-375x812')
    assert.equal(emptyLayout.pageShell, true)
    assert.equal(emptyLayout.listContainer, true)
    assert.equal(emptyLayout.cards.length, 0)
    assert.equal(emptyLayout.toastCount, 0)
    assertNoOverflow(emptyLayout, 'empty array 375x812')
    assertBridgeCycle(emptyBridge.events)

    const businessMessage = 'Temporary review is unavailable.'
    setApiPayload(businessFailurePayload(businessMessage))
    await openHistory('route-business-failure-001', { width: 375, height: 812 })
    await waitForValue(() => evaluate('document.querySelectorAll(".van-toast").length === 1'))
    await waitForValue(() => evaluate('window.__deferHistoryBridge.events.some((entry) => entry.type === "hideLoading")'))
    const businessFailure = await evaluate(`(() => ({
      message: document.querySelector('.van-toast')?.textContent.trim() ?? '',
      toastCount: document.querySelectorAll('.van-toast').length,
      cardCount: document.querySelectorAll('.defer-history-item').length,
      pageShell: Boolean(document.querySelector('.defer-history-page')),
    }))()`)
    const businessBridge = await eventSnapshot()
    results.scenarios.businessFailure = { bridge: businessBridge, layout: businessFailure }
    await screenshot('defer-history-business-failure-375x812')
    assert.equal(businessFailure.message, businessMessage)
    assert.equal(businessFailure.toastCount, 1)
    assert.equal(businessFailure.cardCount, 0)
    assert.equal(businessFailure.pageShell, true)
    assertBridgeCycle(businessBridge.events)

    setApiPayload(structuralInvalidPayload())
    await openHistory('route-invalid-list-001', { width: 375, height: 812 })
    await waitForValue(() => evaluate('window.__deferHistoryBridge.events.some((entry) => entry.type === "hideLoading")'))
    await wait(120)
    const invalidListLayout = await readLayout()
    const invalidListBridge = await eventSnapshot()
    results.scenarios.structuralInvalidList = { bridge: invalidListBridge, layout: invalidListLayout }
    await screenshot('defer-history-structural-invalid-375x812')
    assert.equal(invalidListLayout.pageShell, true)
    assert.equal(invalidListLayout.cards.length, 0)
    assert.equal(invalidListLayout.toastCount, 0)
    assertNoOverflow(invalidListLayout, 'structural invalid list 375x812')
    assertBridgeCycle(invalidListBridge.events)

    setApiHttpFailure(500)
    await openHistory('route-http-failure-001', { width: 375, height: 812 })
    await waitForValue(() => evaluate('document.querySelectorAll(".van-toast").length === 1'))
    await waitForValue(() => evaluate('window.__deferHistoryBridge.events.some((entry) => entry.type === "hideLoading")'))
    const httpFailure = await evaluate(`(() => ({
      message: document.querySelector('.van-toast')?.textContent.trim() ?? '',
      toastCount: document.querySelectorAll('.van-toast').length,
      cardCount: document.querySelectorAll('.defer-history-item').length,
      pageShell: Boolean(document.querySelector('.defer-history-page')),
    }))()`)
    const httpBridge = await eventSnapshot()
    results.scenarios.httpFailure = { bridge: httpBridge, layout: httpFailure }
    await screenshot('defer-history-http-failure-375x812')
    assert.equal(httpFailure.message, 'Unable to complete the network request.')
    assert.equal(httpFailure.toastCount, 1)
    assert.equal(httpFailure.cardCount, 0)
    assert.equal(httpFailure.pageShell, true)
    assertBridgeCycle(httpBridge.events)

    setApiPayload(successPayload(TWO_RECORDS))
    await openHistory('route-visible-return-001', { width: 375, height: 812 })
    await waitForValue(() => evaluate('document.querySelectorAll(".defer-history-item").length === 2'))
    await waitForValue(() => evaluate('window.__deferHistoryBridge.events.some((entry) => entry.type === "hideLoading")'))
    await evaluate('window.__deferHistoryBridge.navigationCalls.length = 0')
    await evaluate(`document.querySelector('.defer-history-header__back').click()`)
    await waitForValue(() => evaluate('location.hash.includes("/home")'))
    const visibleReturn = await evaluate(`(() => ({
      hash: location.hash,
      navigationCalls: window.__deferHistoryBridge.navigationCalls,
      bridge: window.__deferHistoryBridge,
    }))()`)
    const visibleReturnDisableIndex = visibleReturn.bridge.events.findIndex((entry) => (
      entry.type === 'setPhysicalBackInterceptConfig' && entry.payload.enabled === false
    ))
    const visibleReturnPageEvents = visibleReturn.bridge.events.slice(0, visibleReturnDisableIndex + 1)
    results.scenarios.visibleReturn = {
      hash: visibleReturn.hash,
      navigationCalls: visibleReturn.navigationCalls,
      events: visibleReturnPageEvents,
      enabledRequestId: visibleReturn.bridge.enabledRequestId,
    }
    assert.equal(visibleReturn.navigationCalls.length, 1)
    assertBridgeCycle(visibleReturnPageEvents, { expectDisable: true, requireHideAfterDisable: false })
    assert.equal(visibleReturn.bridge.enabledRequestId, null)

    setApiPayload(successPayload(TWO_RECORDS))
    await openHistory('route-physical-back-001', { width: 375, height: 812 })
    await waitForValue(() => evaluate('document.querySelectorAll(".defer-history-item").length === 2'))
    await waitForValue(() => evaluate('window.__deferHistoryBridge.events.some((entry) => entry.type === "hideLoading")'))
    const physicalRequestId = await evaluate('window.__deferHistoryBridge.enabledRequestId')
    assert.equal(typeof physicalRequestId, 'string')
    await evaluate('window.__deferHistoryBridge.navigationCalls.length = 0')
    await evaluate(`window.__dineroProPhysicalBackInterceptReply({
      action: 'physicalBackIntercepted',
      requestId: ${JSON.stringify(physicalRequestId)},
      status: 'intercepted',
      message: 'consumed',
    })`)
    await waitForValue(() => evaluate('location.hash.includes("/home")'))
    const physicalBack = await evaluate(`(() => ({
      hash: location.hash,
      navigationCalls: window.__deferHistoryBridge.navigationCalls,
      bridge: window.__deferHistoryBridge,
    }))()`)
    const physicalBackDisableIndex = physicalBack.bridge.events.findIndex((entry) => (
      entry.type === 'setPhysicalBackInterceptConfig' && entry.payload.enabled === false
    ))
    const physicalBackPageEvents = physicalBack.bridge.events.slice(0, physicalBackDisableIndex + 1)
    results.scenarios.physicalBack = {
      hash: physicalBack.hash,
      navigationCalls: physicalBack.navigationCalls,
      events: physicalBackPageEvents,
      enabledRequestId: physicalBack.bridge.enabledRequestId,
    }
    assert.equal(physicalBack.navigationCalls.length, 1)
    assertBridgeCycle(physicalBackPageEvents, { expectDisable: true, requireHideAfterDisable: false })
    assert.equal(physicalBack.bridge.enabledRequestId, null)

    const requestCountBeforeInvalidQuery = requestLog.length
    await navigate('#/deferHistory?orderId=invalid-only', 375, 812)
    await waitForValue(() => evaluate('location.hash.includes("/home")'))
    await wait(150)
    const requestCountAfterInvalidQuery = requestLog.length
    results.scenarios.invalidQueryRedirect = {
      hash: await evaluate('location.hash'),
      requestDelta: requestCountAfterInvalidQuery - requestCountBeforeInvalidQuery,
    }
    await screenshot('defer-history-invalid-query-redirect')
    assert.equal(results.scenarios.invalidQueryRedirect.requestDelta, 0)

    assert.equal(requestLog.length, expectedOrderIds.length)
    assert.equal(new Set(expectedOrderIds).size, expectedOrderIds.length)
    for (const entry of requestLog) {
      assert.equal(entry.method, 'POST')
      assert.equal(entry.path, API_PATH)
      assert.equal(entry.search, '')
      assert.equal(entry.hash, '')
      const body = JSON.parse(entry.body)
      assert.equal(typeof body.ca, 'string')
      assert.ok(expectedOrderIds.includes(body.ca))
    }
    for (const orderId of expectedOrderIds) {
      assert.equal(requestsForOrder(orderId).length, 1, `${orderId} must make exactly one request`)
    }

    assert.equal(browserErrors.length, 0)
    results.requestLog = requestLog
    results.expectedOrderIds = expectedOrderIds
    results.browserErrors = browserErrors
    results.screenshotNames = screenshotsWritten
    results.assertions = {
      exactRequestMethod: 'POST',
      exactRequestPath: API_PATH,
      everyRequestHasNoQueryString: true,
      oneRequestPerInstance: true,
      figmaSampleValuesAbsentFromProduction: true,
      horizontalOverflowAbsent: true,
      oneVerticalScrollContainer: true,
      bridgeEnabledDisabledSequence: true,
    }

    await writeFile(path.join(outputDirectory, 'browser-check.json'), JSON.stringify(results, null, 2))
    process.stdout.write(`${JSON.stringify({
      status: 'passed',
      outputDirectory,
      requests: requestLog.length,
      screenshots: screenshotsWritten.length,
    }, null, 2)}\n`)
  } finally {
    client?.close()
    await stopBrowser(browserProcess)
    await wait(250)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await rm(profileDirectory, { recursive: true, force: true })
        break
      } catch {
        await wait(250)
      }
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
})





