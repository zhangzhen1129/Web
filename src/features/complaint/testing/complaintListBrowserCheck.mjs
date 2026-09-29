import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const API_HOST = 'https://fixtures.invalid'
const RECORD_PATH = '/veF/RhBg/1LbMax7Kii3zdO2'
const REQUEST_FAILURE_TEXT = 'Unable to complete the network request.'
const INVALID_RESPONSE_TEXT = 'Unable to validate the server response.'

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

async function connectDebugger(browserExecutable, profileDirectory) {
  const port = 12400 + Math.floor(Math.random() * 300)
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

function record(overrides = {}) {
  return {
    id: '1387547894',
    feedbackMechanism: 'Controlled Agency',
    problemType: 'Recordatorio de problemas de pago',
    problemContent: 'Tengo algunas preguntas para dar retroalimentación, por favor deme la respuesta tan pronto como reciba el mensaje.',
    submitStatus: 0,
    firstImageBase64Src: 'ignored-image-1',
    secondImageBase64Src: 'ignored-image-2',
    thirdImageBase64Src: 'ignored-image-3',
    createTime: '2025-11-20',
    ...overrides,
  }
}

function successEnvelope(records) {
  return {
    vaOsuw7s: 0,
    bgCAmh0f: { dlWr: 0 },
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    oi: '',
    qrAbsjzu7WLU: { baIJ: records },
  }
}

function businessFailureEnvelope(message) {
  return {
    ...successEnvelope([]),
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
    pl9xRlV: message,
  }
}

function invalidEnvelope() {
  return {
    ...successEnvelope([]),
    qrAbsjzu7WLU: { baIJ: { invalid: true } },
  }
}

function sanitizeRequest(entry) {
  let body = {}
  try {
    body = JSON.parse(entry.body)
  } catch {}
  return {
    method: entry.method,
    path: entry.path,
    query: entry.query,
    afIdPresent: typeof body.cvgH === 'string' && body.cvgH.length > 0,
    tokenPresent: typeof body.yjDnG === 'string' && body.yjDnG.length > 0,
    gpsEmpty: body.ulG === '' && body.vqfH0gehfvNYrW?.rpryc7q8rm === '',
    imageFieldsAbsent: !Object.hasOwn(body, 'firstImageBase64Src')
      && !Object.hasOwn(body, 'secondImageBase64Src')
      && !Object.hasOwn(body, 'thirdImageBase64Src'),
  }
}

async function main() {
  const baseUrl = readArgument('--base-url', 'http://127.0.0.1:4174/')
  const browserExecutable = readArgument('--browser', DEFAULT_BROWSER)
  const outputArgument = readArgument('--output-dir')
  if (!outputArgument) throw new Error('Missing --output-dir')

  const outputDirectory = path.resolve(outputArgument)
  await mkdir(outputDirectory, { recursive: true })
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'complaint-list-browser-'))
  const requestHistory = []
  const recordRequests = []
  const screenshots = []
  const results = { status: 'passed', baseUrl, scenarios: {}, requests: [], bridge: [], screenshots: [] }
  let browserProcess
  let client
  let sessionId
  let responseBody = successEnvelope([record(), record({ id: '1387547895', submitStatus: 1 })])
  let responseHttpStatus = 200
  let responseDelayMs = 0

  try {
    const connection = await connectDebugger(browserExecutable, profileDirectory)
    browserProcess = connection.browserProcess
    client = await createProtocolClient(connection.webSocketUrl)
    const target = await client.send('Target.createTarget', { url: 'about:blank' })
    const attached = await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
    sessionId = attached.sessionId
    const send = (method, params = {}) => client.send(method, params, sessionId)

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try {
          localStorage.setItem('DineroPro:global:api-host', JSON.stringify({ version: 1, value: '${API_HOST}' }))
          localStorage.setItem('DineroPro:global:token', JSON.stringify({ version: 1, value: 'token-fixture' }))
          localStorage.setItem('DineroPro:global:app-name', JSON.stringify({ version: 1, value: 'FixtureApp' }))
          localStorage.setItem('DineroPro:global:app-version', JSON.stringify({ version: 1, value: '1.2.3' }))
          localStorage.setItem('DineroPro:global:package-name', JSON.stringify({ version: 1, value: 'fixture.package' }))
          localStorage.setItem('DineroPro:global:af-id', JSON.stringify({ version: 1, value: 'af-fixture' }))
          localStorage.setItem('DineroPro:global:ga-id', JSON.stringify({ version: 1, value: 'ga-fixture' }))
          localStorage.setItem('DineroPro:global:fb-id', JSON.stringify({ version: 1, value: 'fb-fixture' }))
        } catch {}
        ;(() => {
          const bridge = window.__complaintListBridge = { events: [] }
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
          }
        })()`,
    })
    await send('Fetch.enable', { patterns: [{ urlPattern: `${API_HOST}/*`, requestStage: 'Request' }] })

    client.on('Fetch.requestPaused', (event, eventSessionId) => {
      if (eventSessionId !== sessionId) return
      const requestUrl = new URL(event.request.url)
      const requestPath = requestUrl.pathname
      const isRecordRequest = requestPath === RECORD_PATH
      const isPreflight = event.request.method === 'OPTIONS'
      if (!isPreflight && isRecordRequest) {
        const entry = {
          method: event.request.method,
          path: requestPath,
          query: requestUrl.search,
          body: event.request.postData ?? '',
        }
        requestHistory.push(entry)
        recordRequests.push(entry)
      }

      const responseCode = isPreflight ? 204 : isRecordRequest ? responseHttpStatus : 404
      const payload = isPreflight ? null : isRecordRequest ? responseBody : null
      const body = payload ? Buffer.from(JSON.stringify(payload)).toString('base64') : ''
      const fulfill = () => send('Fetch.fulfillRequest', {
        requestId: event.requestId,
        responseCode,
        responseHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Access-Control-Allow-Headers', value: '*' },
          { name: 'Access-Control-Allow-Methods', value: '*' },
        ],
        body,
      }).catch(() => {})

      if (isRecordRequest && !isPreflight && responseDelayMs > 0) setTimeout(fulfill, responseDelayMs)
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

    async function navigate(hash, width = 390, height = 844) {
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

    function snapshotExpression() {
      return `(() => {
        const page = document.querySelector('.complaint-list-page')
        const scroll = document.querySelector('.complaint-list-scroll')
        const cards = [...document.querySelectorAll('.complaint-record-card')]
        return {
          hash: location.hash,
          title: document.querySelector('.complaint-list-header h1')?.textContent.trim() ?? '',
          records: cards.length,
          statuses: [...document.querySelectorAll('.complaint-record-status')].map((node) => node.textContent.trim()),
          emptyText: document.querySelector('.complaint-list-empty p')?.textContent.trim() ?? '',
          pageVisible: page ? getComputedStyle(page).display !== 'none' : false,
          scrollContainers: document.querySelectorAll('.complaint-list-scroll').length,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          scrollClientHeight: scroll?.clientHeight ?? 0,
          scrollHeight: scroll?.scrollHeight ?? 0,
          firstDetailsLength: document.querySelector('.complaint-record-details-text')?.textContent.length ?? 0,
          firstCardHeight: cards[0]?.getBoundingClientRect().height ?? 0,
          scrollOverflowY: scroll ? getComputedStyle(scroll).overflowY : '',
          bridgeEvents: window.__complaintListBridge?.events?.map((entry) => entry.type) ?? [],
        }
      })()`
    }

    async function snapshot() {
      return evaluate(snapshotExpression())
    }

    async function openList({ history = false, width = 390, height = 844 } = {}) {
      recordRequests.length = 0
      await navigate('#/home', width, height)
      if (history) {
        await evaluate(`location.hash = '#/complainHome'`)
        await waitForExpression(`Boolean(document.querySelector('.complaint-page'))`)
      }
      await evaluate(`location.hash = '#/complainList'`)
      await waitForExpression(`Boolean(document.querySelector('.complaint-list-page'))`)
      await wait(100)
    }

    await openList()
    const listState = await snapshot()
    assert.equal(listState.hash, '#/complainList')
    assert.equal(listState.title, 'Registro de quejas')
    assert.equal(listState.records, 2)
    assert.equal(listState.statuses[0].includes('está siendo enviada'), true)
    assert.equal(listState.statuses[1].includes('ha sido recibida'), true)
    assert.equal(listState.scrollContainers, 1)
    assert.equal(listState.horizontalOverflow, false)
    assert.equal(listState.bridgeEvents[0], 'showLoading')
    assert.equal(listState.bridgeEvents.at(-1), 'hideLoading')
    assert.equal(recordRequests.length, 1)
    const request = sanitizeRequest(recordRequests[0])
    assert.deepEqual(request, {
      method: 'POST',
      path: RECORD_PATH,
      query: '',
      afIdPresent: true,
      tokenPresent: true,
      gpsEmpty: true,
      imageFieldsAbsent: true,
    })
    const geometry = await evaluate(`(() => {
      const rect = (selector) => {
        const value = document.querySelector(selector)?.getBoundingClientRect()
        return value ? { top: value.top, bottom: value.bottom, left: value.left, right: value.right, width: value.width, height: value.height } : null
      }
      return {
        header: rect('.complaint-list-header'),
        back: rect('.complaint-list-back'),
        meta: rect('.complaint-record-meta'),
        card: rect('.complaint-record-card'),
        status: rect('.complaint-record-status'),
        scroll: rect('.complaint-list-scroll'),
      }
    })()`)
    await screenshot('complaint-list-success-390x844')
    results.scenarios.list = { state: listState, request, geometry }

    await setViewport(375, 812)
    await screenshot('complaint-list-success-375x812')
    await setViewport(360, 800)
    const compact = await snapshot()
    assert.equal(compact.horizontalOverflow, false)
    await screenshot('complaint-list-success-360x800')
    results.scenarios.compact = compact

    responseBody = successEnvelope([record({
      problemContent: 'Controlled long details '.repeat(80),
      feedbackMechanism: 'Controlled feedback agency with a long name',
      problemType: 'Controlled question type with a long label',
    })])
    await openList({ width: 375, height: 812 })
    const longText = await snapshot()
    assert.equal(longText.records, 1)
    assert.equal(longText.horizontalOverflow, false)
    assert.equal(longText.scrollHeight > longText.scrollClientHeight, true, JSON.stringify(longText))
    await screenshot('complaint-list-long-text-375x812')
    await setViewport(360, 800)
    const longText360 = await snapshot()
    assert.equal(longText360.horizontalOverflow, false)
    await screenshot('complaint-list-long-text-360x800')
    results.scenarios.longText = longText
    results.scenarios.longText360 = longText360

    responseBody = successEnvelope(Array.from({ length: 12 }, (_, index) => record({
      id: `13875479${String(index).padStart(2, '0')}`,
      problemContent: `Controlled long list details ${index} `.repeat(8),
    })))
    await openList({ width: 375, height: 812 })
    await evaluate(`document.querySelector('.complaint-list-scroll').scrollTop = document.querySelector('.complaint-list-scroll').scrollHeight`)
    await wait(100)
    const longList = await snapshot()
    assert.equal(longList.records, 12)
    assert.equal(longList.horizontalOverflow, false)
    await screenshot('complaint-list-long-list-bottom-375x812')
    await setViewport(360, 800)
    await evaluate(`document.querySelector('.complaint-list-scroll').scrollTop = document.querySelector('.complaint-list-scroll').scrollHeight`)
    await wait(100)
    const longList360 = await snapshot()
    assert.equal(longList360.horizontalOverflow, false)
    await screenshot('complaint-list-long-list-bottom-360x800')
    results.scenarios.longList = longList
    results.scenarios.longList360 = longList360

    responseBody = successEnvelope([])
    await openList({ width: 375, height: 812 })
    const empty = await snapshot()
    assert.equal(empty.records, 0)
    assert.equal(empty.emptyText, 'Sin registro')
    assert.equal(empty.horizontalOverflow, false)
    await screenshot('complaint-list-empty-375x812')
    await setViewport(360, 800)
    await screenshot('complaint-list-empty-360x800')
    results.scenarios.empty = empty

    responseBody = businessFailureEnvelope('Controlled failure')
    await openList({ width: 375, height: 812 })
    await waitForExpression(`document.body.textContent.includes('Controlled failure')`)
    const businessFailure = await snapshot()
    assert.equal(businessFailure.records, 0)
    assert.equal(businessFailure.emptyText, '')
    assert.equal(businessFailure.bridgeEvents.at(-1), 'hideLoading')
    await screenshot('complaint-list-business-failure-375x812')
    results.scenarios.businessFailure = businessFailure

    responseBody = invalidEnvelope()
    await openList({ width: 375, height: 812 })
    await waitForExpression(`document.body.textContent.includes(${JSON.stringify(INVALID_RESPONSE_TEXT)})`)
    const invalid = await snapshot()
    assert.equal(invalid.records, 0)
    assert.equal(invalid.emptyText, '')
    results.scenarios.invalidResponse = invalid

    responseHttpStatus = 500
    await openList({ width: 375, height: 812 })
    await waitForExpression(`document.body.textContent.includes(${JSON.stringify(REQUEST_FAILURE_TEXT)})`)
    const requestFailure = await snapshot()
    assert.equal(requestFailure.records, 0)
    assert.equal(requestFailure.emptyText, '')
    await screenshot('complaint-list-request-failure-375x812')
    results.scenarios.requestFailure = requestFailure

    responseHttpStatus = 200
    responseBody = successEnvelope([record()])
    await openList({ history: true, width: 375, height: 812 })
    const historyBefore = await evaluate(`({ hash: location.hash, back: history.state?.back ?? null })`)
    await click('.complaint-list-back')
    await wait(500)
    const historyAfter = await evaluate(`({ hash: location.hash, back: history.state?.back ?? null })`)
    assert.equal(historyAfter.hash, '#/complainHome')
    results.scenarios.historyBack = { before: historyBefore, after: historyAfter }

    await navigate('#/home', 375, 812)
    await evaluate(`location.hash = '#/complainList'`)
    await waitForExpression(`Boolean(document.querySelector('.complaint-list-page'))`)
    await click('.complaint-list-back')
    await wait(500)
    const directBack = await evaluate('location.hash')
    assert.equal(directBack, '#/complainHome')
    results.scenarios.directBack = { hash: directBack }

    responseDelayMs = 700
    await navigate('#/home', 375, 812)
    const beforeLate = await evaluate(`window.__complaintListBridge.events.length`)
    await evaluate(`location.hash = '#/complainList'`)
    await waitForExpression(`Boolean(document.querySelector('.complaint-list-page'))`)
    await wait(100)
    await click('.complaint-list-back')
    await wait(500)
    await wait(700)
    const late = await evaluate(`({
      hash: location.hash,
      events: window.__complaintListBridge.events.slice(${beforeLate}).map((entry) => entry.type),
    })`)
    assert.equal(late.hash, '#/complainHome')
    assert.equal(late.events.includes('showLoading'), true)
    assert.equal(late.events.at(-1), 'hideLoading')
    results.scenarios.lateResponse = late

    await navigate('#/complainList?unexpected=1', 375, 812)
    await waitForExpression(`location.hash === '#/home'`)
    results.scenarios.invalidRoute = { hash: await evaluate('location.hash') }

    results.requests = requestHistory.map(sanitizeRequest)
    results.bridge = await evaluate('window.__complaintListBridge.events')
    results.screenshots = screenshots
    await writeFile(path.join(outputDirectory, 'browser-check.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify({ ok: true, screenshots, scenarios: Object.keys(results.scenarios) }, null, 2)}\n`)
  } finally {
    client?.close()
    await stopBrowser(browserProcess)
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {})
  }
}

await main()
