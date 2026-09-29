import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const RED_DOT_PATH = '/n5V/78R7/S1221NY09yUP44TB34UNT'

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
  const port = 11600 + Math.floor(Math.random() * 300)
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

function visibleExpression(selector) {
  return `(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; const style = getComputedStyle(node); return style.display !== 'none' && style.visibility !== 'hidden' && node.getBoundingClientRect().height > 0 })()`
}

async function main() {
  const baseUrl = readArgument('--base-url', 'http://127.0.0.1:4174/?apiHost=https%3A%2F%2Ffixtures.invalid')
  const browserExecutable = readArgument('--browser', DEFAULT_BROWSER)
  const outputArgument = readArgument('--output-dir')
  if (!outputArgument) throw new Error('Missing --output-dir')
  const outputDirectory = path.resolve(outputArgument)
  await mkdir(outputDirectory, { recursive: true })
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'complaint-browser-'))
  const screenshots = []
  const browserErrors = []
  const requestCounts = { redDot: 0 }
  let redDotFixture = { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, pl9xRlV: '', aewM: true }
  let redDotHttpStatus = 200
  let browserProcess
  let client
  let sessionId

  try {
    const connection = await connectDebugger(browserExecutable, profileDirectory)
    browserProcess = connection.browserProcess
    client = await createProtocolClient(connection.webSocketUrl)
    const target = await client.send('Target.createTarget', { url: 'about:blank' })
    const attached = await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
    sessionId = attached.sessionId
    const send = (method, params = {}) => client.send(method, params, sessionId)

    client.on('Runtime.exceptionThrown', (event, eventSessionId) => {
      if (eventSessionId === sessionId) browserErrors.push(event.exceptionDetails.text)
    })
    client.on('Runtime.consoleAPICalled', (event, eventSessionId) => {
      if (eventSessionId === sessionId && event.type === 'error') browserErrors.push('console.error')
    })

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('DineroPro:global:api-host', JSON.stringify({ version: 1, value: 'https://fixtures.invalid' }));
        window.__complaintCheck = { errors: [] };
        window.addEventListener('error', (event) => window.__complaintCheck.errors.push(String(event.message || 'error')));
        window.addEventListener('unhandledrejection', (event) => window.__complaintCheck.errors.push(String(event.reason || 'rejection')));`,
    })
    await send('Fetch.enable', { patterns: [{ urlPattern: 'https://fixtures.invalid/*', requestStage: 'Request' }] })
    client.on('Fetch.requestPaused', async (event, eventSessionId) => {
      if (eventSessionId !== sessionId) return
      const requestUrl = new URL(event.request.url)
      const isPreflight = event.request.method === 'OPTIONS'
      if (requestUrl.pathname === RED_DOT_PATH && !isPreflight) requestCounts.redDot += 1
      await send('Fetch.fulfillRequest', {
        requestId: event.requestId,
        responseCode: isPreflight ? 200 : redDotHttpStatus,
        responseHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Access-Control-Allow-Headers', value: '*' },
          { name: 'Access-Control-Allow-Methods', value: '*' },
        ],
        body: isPreflight ? '' : Buffer.from(JSON.stringify(redDotFixture)).toString('base64'),
      }).catch(() => {})
    })

    async function evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
      return result.result.value
    }

    async function setViewport(width, height) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: height })
    }

    async function screenshot(name) {
      await evaluate(`document.querySelector('#__vconsole')?.remove()`)
      const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
      await writeFile(path.join(outputDirectory, `${name}.png`), Buffer.from(result.data, 'base64'))
      screenshots.push(`${name}.png`)
    }

    async function navigate(hash, width = 375, height = 812) {
      await setViewport(width, height)
      const url = new URL(baseUrl)
      url.searchParams.set('run', String(Date.now()))
      url.hash = hash
      await send('Page.navigate', { url: url.toString() })
      await waitForValue(() => evaluate('document.readyState === "complete" && Boolean(document.querySelector("#app"))'))
      await wait(180)
    }

    async function openPage(width = 375, height = 812) {
      await navigate('#/complainHome', width, height)
      await waitForValue(() => evaluate(visibleExpression('.complaint-page')))
      await wait(180)
    }

    async function waitForHash(hash) {
      await waitForValue(() => evaluate(`location.hash === ${JSON.stringify(hash)}`))
    }

    async function snapshot() {
      return evaluate(`(() => {
        const options = Array.from(document.querySelectorAll('.complaint-agency__option'))
        const selected = options.find((option) => option.classList.contains('complaint-agency__option--selected'))
        const record = document.querySelector('.complaint-record')
        const recordRect = record?.getBoundingClientRect()
        return {
          hash: location.hash,
          title: document.querySelector('.complaint-page__header h1')?.textContent.trim() ?? '',
          agencyLabels: options.map((option) => option.textContent.trim()),
          selectedAgency: selected?.textContent.trim() ?? null,
          agencySelectedCount: options.filter((option) => option.getAttribute('aria-pressed') === 'true').length,
          tipsHeading: document.querySelector('.complaint-tips__heading')?.textContent.trim() ?? '',
          tipsMessage: document.querySelector('.complaint-tips__message')?.textContent.trim() ?? '',
          recordLabel: record?.textContent.trim() ?? '',
          redDotCount: document.querySelectorAll('.complaint-record__red-dot').length,
          customerText: document.querySelector('.complaint-customer-card__text')?.textContent.trim() ?? '',
          questionTitle: document.querySelector('.complaint-question-header h2')?.textContent.trim() ?? '',
          questionLabels: Array.from(document.querySelectorAll('.complaint-question-option')).map((option) => option.textContent.trim()),
          customerVisible: ${visibleExpression('.complaint-customer-popup')},
          questionVisible: ${visibleExpression('.complaint-question-popup')},
          overlayCount: Array.from(document.querySelectorAll('.complaint-popup-overlay')).filter((node) => getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().height > 0).length,
          loadingCount: document.querySelectorAll('.van-loading, .van-skeleton, [data-dinero-browser-loading]').length,
          toastCount: document.querySelectorAll('.van-toast').length,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
          recordBottomGap: recordRect ? Math.round(window.innerHeight - recordRect.bottom) : null,
          placeholderTitle: document.querySelector('.route-placeholder h1')?.textContent.trim() ?? '',
        }
      })()`)
    }

    async function openAgency(index) {
      await evaluate(`document.querySelectorAll('.complaint-agency__option')[${index}].click()`)
      await waitForValue(() => evaluate(visibleExpression('.complaint-question-popup')))
      await wait(360)
    }

    async function closeQuestion() {
      await evaluate(`document.querySelector('.complaint-question-close').click()`)
      await waitForValue(() => evaluate(`!${visibleExpression('.complaint-question-popup')}`))
      await wait(120)
    }

    await openPage()
    const initial = await snapshot()
    assert.equal(initial.hash, '#/complainHome')
    assert.equal(initial.title, 'Quejas')
    assert.deepEqual(initial.agencyLabels, ['DineroPro', 'Plataforma de quejas en línea'])
    assert.equal(initial.selectedAgency, 'Plataforma de quejas en línea')
    assert.equal(initial.agencySelectedCount, 1)
    assert.equal(initial.tipsHeading, 'Consejos útiles:')
    assert.equal(initial.recordLabel, 'Registro de quejas')
    assert.equal(initial.redDotCount, 1)
    assert.equal(initial.loadingCount, 0)
    assert.equal(initial.toastCount, 0)
    assert.equal(initial.horizontalOverflow, false)
    assert.ok(initial.recordBottomGap >= 20 && initial.recordBottomGap <= 32, JSON.stringify(initial))
    assert.equal(requestCounts.redDot, 1)
    await screenshot('complaint-default-375x812')

    await openAgency(0)
    const agencyPopup = await snapshot()
    assert.equal(agencyPopup.selectedAgency, 'DineroPro')
    assert.equal(agencyPopup.questionTitle, 'Por favor seleccione el tipo de pregunta')
    assert.deepEqual(agencyPopup.questionLabels, ['Problemas de endeudamiento', 'Problemas de reembolso', 'Recordatorio de problemas de pago', 'Otras preguntas'])
    assert.equal(agencyPopup.questionVisible, true)
    assert.equal(agencyPopup.overlayCount, 1)
    assert.equal(requestCounts.redDot, 1)
    await screenshot('complaint-question-popup-375x812')
    await closeQuestion()
    const closed = await snapshot()
    assert.equal(closed.questionVisible, false)
    assert.equal(closed.selectedAgency, 'DineroPro')
    assert.equal(closed.redDotCount, 1)

    await openAgency(1)
    await closeQuestion()
    await evaluate(`document.querySelectorAll('.complaint-agency__option')[1].click(); document.querySelectorAll('.complaint-agency__option')[1].click(); document.querySelectorAll('.complaint-agency__option')[1].click()`)
    await waitForValue(() => evaluate(visibleExpression('.complaint-question-popup')))
    await wait(360)
    const rapid = await snapshot()
    assert.equal(rapid.overlayCount, 1)
    assert.equal(rapid.questionVisible, true)
    await closeQuestion()

    await openAgency(0)
    const historyBefore = await evaluate('history.length')
    await evaluate(`(() => { const option = document.querySelectorAll('.complaint-question-option')[1]; for (let index = 0; index < 5; index += 1) option.click() })()`)
    await wait(800)
    const questionHash = await evaluate('location.hash')
    assert.equal(questionHash.startsWith('#/complainEdit?'), true)
    await waitForValue(() => evaluate(visibleExpression('.route-placeholder')))
    const questionRoute = await evaluate(`(() => { const query = new URLSearchParams(location.hash.split('?')[1] || ''); return { hash: location.hash, type: query.get('type'), question: query.get('question'), title: document.querySelector('.route-placeholder h1')?.textContent.trim() ?? '', historyLength: history.length } })()`)
    assert.equal(questionRoute.type, 'DineroPro')
    assert.equal(questionRoute.question, 'Problemas de reembolso')
    assert.equal(questionRoute.title, 'Complaint edit')
    assert.equal(questionRoute.historyLength - historyBefore, 1)
    await screenshot('complaint-edit-placeholder-375x812')

    await openPage()
    const listHistoryBefore = await evaluate('history.length')
    await evaluate(`document.querySelector('.complaint-record').click()`)
    await waitForHash('#/complainList')
    await waitForValue(() => evaluate(visibleExpression('.route-placeholder')))
    const listRoute = await evaluate(`({ hash: location.hash, title: document.querySelector('.route-placeholder h1')?.textContent.trim() ?? '', historyLength: history.length })`)
    assert.equal(listRoute.title, 'Complaint records')
    assert.equal(listRoute.historyLength - listHistoryBefore, 1)
    await screenshot('complaint-list-placeholder-375x812')

    await navigate('#/complainEdit?type=DineroPro&question=Otras%20preguntas&extra=1')
    await waitForHash('#/home')
    await navigate('#/complainList?extra=1')
    await waitForHash('#/home')
    await navigate('#/complainList')
    await waitForValue(() => evaluate(visibleExpression('.route-placeholder')))
    assert.equal(await evaluate('document.querySelector(".route-placeholder h1")?.textContent.trim()'), 'Complaint records')

    await openPage()
    await evaluate(`document.querySelector('.complaint-page__customer-service').click()`)
    await waitForValue(() => evaluate(visibleExpression('.complaint-customer-popup')))
    await wait(360)
    const customer = await snapshot()
    assert.equal(customer.customerVisible, true)
    assert.equal(customer.customerText, 'Atención al cliente: 5517872176')
    assert.equal(customer.overlayCount, 1)
    assert.equal(customer.loadingCount, 0)
    assert.equal(customer.toastCount, 0)
    await screenshot('complaint-customer-popup-375x812')
    await evaluate(`document.querySelector('.complaint-customer-close').click()`)
    await waitForValue(() => evaluate(`!${visibleExpression('.complaint-customer-popup')}`))
    await wait(120)
    assert.equal(await evaluate(visibleExpression('.complaint-customer-popup')), false)

    redDotFixture = { cyiUgNvO2EPltj: { atY3WWbXIN: 2001 }, pl9xRlV: 'Controlled failure', aewM: true }
    await openPage()
    const businessFailure = await snapshot()
    assert.equal(businessFailure.redDotCount, 0)
    assert.equal(businessFailure.loadingCount, 0)
    assert.equal(businessFailure.toastCount, 0)

    redDotFixture = { invalid: true }
    await openPage()
    const invalidResponse = await snapshot()
    assert.equal(invalidResponse.redDotCount, 0)
    assert.equal(invalidResponse.toastCount, 0)

    redDotFixture = { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, pl9xRlV: '', aewM: false }
    await openPage()
    const hiddenRedDot = await snapshot()
    assert.equal(hiddenRedDot.redDotCount, 0)

    redDotHttpStatus = 500
    await openPage()
    const httpFailure = await snapshot()
    assert.equal(httpFailure.redDotCount, 0)
    assert.equal(httpFailure.toastCount, 0)

    redDotHttpStatus = 200
    redDotFixture = { cyiUgNvO2EPltj: { atY3WWbXIN: 2000 }, pl9xRlV: '', aewM: true }
    await navigate('#/complainHome?extra=1')
    await waitForValue(() => evaluate(visibleExpression('.complaint-page')))
    const extraQuery = await snapshot()
    assert.equal(extraQuery.hash, '#/complainHome?extra=1')
    assert.equal(extraQuery.title, 'Quejas')

    await openPage(360, 800)
    const compact = await snapshot()
    assert.equal(compact.horizontalOverflow, false)
    assert.equal(compact.title, 'Quejas')
    assert.equal(compact.agencyLabels.length, 2)
    await screenshot('complaint-default-360x800')

    await navigate('#/home')
    await waitForHash('#/home')
    await evaluate(`location.hash = '#/complainHome'`)
    await waitForValue(() => evaluate(visibleExpression('.complaint-page')))
    await evaluate(`document.querySelector('.complaint-page__back').click()`)
    await waitForHash('#/home')

    await navigate('#/complainHome')
    await waitForValue(() => evaluate(visibleExpression('.complaint-page')))
    await evaluate(`document.querySelector('.complaint-page__back').click()`)
    await waitForHash('#/home')

    const pageErrors = await evaluate('window.__complaintCheck.errors')
    assert.deepEqual(pageErrors, [])
    assert.deepEqual(browserErrors, [])
    const report = { status: 'passed', requestCounts, initial, agencyPopup, closed, rapid, questionRoute, listRoute, customer, businessFailure, invalidResponse, hiddenRedDot, httpFailure, extraQuery, compact, screenshots }
    await writeFile(path.join(outputDirectory, 'browser-check.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify({ ok: true, screenshots, scenarios: Object.keys(report).length }, null, 2)}\n`)
  } finally {
    client?.close()
    await stopBrowser(browserProcess)
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {})
  }
}

await main()