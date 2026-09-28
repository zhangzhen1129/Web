import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const DETAIL_PATH = '/wHA/wPLwFKAGF/vwLsAD'
const SUBMIT_PATH = '/woe/awpdjrenj/lqao6x'

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

function detailFixture(overrides = {}) {
  return {
    vaOsuw7s: 10,
    bgCAmh0f: { dlWr: 1 },
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    oi: '',
    vh9d4uTh7IYo1PT: 'bill-001',
    qmYkXDFBY7NwJ: '2025-11-20',
    tvBFCUlFBJlcCJPFBJ: '2025-11-30',
    kmeYZle281Z1I2caLJpH: { yc3NXMOMxN1V: 10 },
    vgDMkYy6x5: 20000,
    jwXcMpXgVgWvuX8V: { rncMaMb1: 'ignored' },
    rkRqBuDuPCCDRZCuob29: { wso6AenfCBn6: 1500 },
    ej21XmNiglNAN5zMdK: { upWLpOW3Wy: 300 },
    ...overrides,
  }
}

function businessFailureFixture(message = 'No disponible') {
  return {
    ...detailFixture(),
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
    pl9xRlV: message,
  }
}

function submitFixture(url = 'https://payments.example.test/order') {
  return {
    vaOsuw7s: 0,
    bgCAmh0f: { dlWr: 0 },
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    oi: '',
    aewM: url,
  }
}

async function main() {
  const baseUrl = readArgument('--base-url', 'http://127.0.0.1:4173/?apiHost=https%3A%2F%2Ffixtures.invalid')
  const browserExecutable = readArgument('--browser', 'C:/Program Files/Google/Chrome/Application/chrome.exe')
  const outputDirectory = path.resolve(readArgument('--output-dir'))
  if (!outputDirectory) throw new Error('Missing --output-dir')

  await mkdir(outputDirectory, { recursive: true })
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'order-deferral-browser-'))
  const { browserProcess, webSocketUrl } = await connectDebugger(browserExecutable, profileDirectory)
  const client = await createProtocolClient(webSocketUrl)
  const browserErrors = []
  const requestLog = []
  let detailPayload = detailFixture()
  let detailDelayMs = 0
  let submitPayload = submitFixture()
  let submitDelayMs = 0
  const results = {}

  try {
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
      source: `try { localStorage.setItem('DineroPro:global:api-host', JSON.stringify({ version: 1, value: 'https://fixtures.invalid' })) } catch {}`
    })
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        const bridge = window.__orderDeferralBridge = {
          events: [],
          enabledRequestId: null,
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
            return JSON.stringify({
              action: 'setPhysicalBackInterceptConfig',
              requestId: request.requestId,
              status: 'success',
              message: 'ok',
            })
          },
          openPrivacyAgreementPage(payload) {
            const request = JSON.parse(payload)
            bridge.events.push({ type: 'openPrivacyAgreementPage', payload: request })
            return JSON.stringify({
              action: 'openPrivacyAgreementPage',
              requestId: request.requestId,
              status: 'accepted',
              message: 'ok',
            })
          },
        }
      })()`,
    })
    await send('Fetch.enable', {
      patterns: [{ urlPattern: 'https://fixtures.invalid/*', requestStage: 'Request' }],
    })
    client.on('Fetch.requestPaused', (event, eventSessionId) => {
      if (eventSessionId !== sessionId) return
      const requestUrl = new URL(event.request.url)
      const isPreflight = event.request.method === 'OPTIONS'
      const isDetail = requestUrl.pathname === DETAIL_PATH
      const isSubmit = requestUrl.pathname === SUBMIT_PATH
      let body = ''
      let delayMs = 0
      if (isPreflight) {
        body = ''
      } else if (isDetail) {
        requestLog.push({ method: event.request.method, path: requestUrl.pathname })
        body = Buffer.from(JSON.stringify(detailPayload)).toString('base64')
        delayMs = detailDelayMs
      } else if (isSubmit) {
        requestLog.push({
          method: event.request.method,
          path: requestUrl.pathname,
          body: event.request.postData ?? '',
        })
        body = Buffer.from(JSON.stringify(submitPayload)).toString('base64')
        delayMs = submitDelayMs
      } else {
        body = ''
      }

      const fulfill = () => send('Fetch.fulfillRequest', {
        requestId: event.requestId,
        responseCode: isPreflight ? 204 : 200,
        responseHeaders: [
          { name: 'Content-Type', value: isPreflight ? 'text/plain' : 'application/json' },
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Access-Control-Allow-Headers', value: '*' },
          { name: 'Access-Control-Allow-Methods', value: '*' },
        ],
        body,
      }).catch(() => {})
      if (delayMs > 0) setTimeout(fulfill, delayMs)
      else void fulfill()
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
      await writeFile(path.join(outputDirectory, `${name}.png`), Buffer.from(result.data, 'base64'))
    }

    async function navigate(fragment, width = 375, height = 812) {
      await setViewport(width, height)
      const navigationUrl = new URL(baseUrl)
      navigationUrl.searchParams.set('run', String(Date.now()))
      navigationUrl.hash = fragment
      await send('Page.navigate', { url: navigationUrl.toString() })
      await waitForValue(() => evaluate('document.readyState === "complete" && Boolean(document.querySelector("#app"))'))
    }

    async function openDetail({ width = 375, height = 812 } = {}) {
      await navigate('#/deferDetail?orderId=route-order-001', width, height)
      await waitForValue(() => evaluate('Boolean(document.querySelector(".order-deferral-page"))'))
      await waitForValue(() => evaluate('Boolean(document.querySelector(".order-deferral-summary"))'))
      await waitForValue(() => evaluate('!document.querySelector(".order-deferral-summary h2")?.textContent.includes("--")'))
      await wait(100)
    }

    async function readLayout() {
      return evaluate(`(() => {
        const root = document.querySelector('.order-deferral-page')
        const button = document.querySelector('.order-deferral-submit')
        const buttonRect = button.getBoundingClientRect()
        const rootRect = root.getBoundingClientRect()
        return {
          title: document.querySelector('.order-deferral-summary h2')?.textContent.trim() ?? '',
          description: document.querySelector('.order-deferral-summary p')?.textContent.trim() ?? '',
          dateValues: [...document.querySelectorAll('.order-deferral-date-row span:last-child')].map((node) => node.textContent.trim()),
          expanded: Boolean(document.querySelector('.order-deferral-cost-detail')),
          horizontalOverflow: root.scrollWidth > root.clientWidth,
          rootScrollable: root.scrollHeight > root.clientHeight,
          scrollContainers: [...document.querySelectorAll('.order-deferral-page, .order-deferral-content, .order-deferral-footer')].filter((node) => getComputedStyle(node).overflowY === 'auto').length,
          buttonVisible: buttonRect.top >= rootRect.top && buttonRect.bottom <= rootRect.bottom + 1,
          buttonDisabled: button.disabled,
          bottomGap: Math.round(rootRect.bottom - buttonRect.bottom),
        }
      })()`)
    }

    detailPayload = detailFixture()
    detailDelayMs = 5000
    await navigate('#/deferDetail?orderId=route-order-001')
    await waitForValue(() => evaluate('Boolean(document.querySelector(".order-deferral-page"))'))
    await waitForValue(() => evaluate('Boolean(document.querySelector(".order-deferral-summary"))'))
    results.loading = await evaluate(`(() => ({
      nativeShow: window.__orderDeferralBridge.events.some((entry) => entry.type === 'showLoading'),
      summary: Boolean(document.querySelector('.order-deferral-summary')),
      content: Boolean(document.querySelector('.order-deferral-content')),
      submit: Boolean(document.querySelector('.order-deferral-submit')),
      buttonDisabled: document.querySelector('.order-deferral-submit').disabled,
      title: document.querySelector('.order-deferral-summary h2').textContent.trim(),
      dateValues: [...document.querySelectorAll('.order-deferral-date-row span:last-child')].map((node) => node.textContent.trim()),
    }))()`)
    await screenshot('order-deferral-loading-375x812')
    assert.equal(results.loading.nativeShow, true)
    assert.equal(results.loading.summary, true)
    assert.equal(results.loading.content, true)
    assert.equal(results.loading.submit, true)
    assert.equal(results.loading.buttonDisabled, true)
    assert.equal(results.loading.title, 'Retraso de -- días')
    assert.deepEqual(results.loading.dateValues, ['--', '--'])

    await evaluate(`document.querySelector('.order-deferral-fee-trigger').click()`)
    await waitForValue(() => evaluate('Boolean(document.querySelector(".order-deferral-cost-detail"))'))
    results.loadingExpanded = await evaluate(`[...document.querySelectorAll('.order-deferral-cost-row span:last-child')].map((node) => node.textContent.trim())`)
    await screenshot('order-deferral-loading-expanded-375x812')
    assert.deepEqual(results.loadingExpanded, ['--', '--'])
    await evaluate(`document.querySelector('.order-deferral-fee-trigger').click()`)
    await waitForValue(() => evaluate('!document.querySelector(".order-deferral-cost-detail")'))

    await waitForValue(() => evaluate('!document.querySelector(".order-deferral-summary h2")?.textContent.includes("--")'))
    await wait(100)
    detailDelayMs = 0
    results.collapsed375 = await readLayout()
    await screenshot('order-deferral-collapsed-375x812')
    assert.match(results.collapsed375.title, /10 días/)
    assert.match(results.collapsed375.description, /S\/ 20,000/)
    assert.deepEqual(results.collapsed375.dateValues, ['2025-11-20', '2025-11-30'])
    assert.equal(results.collapsed375.expanded, false)
    assert.equal(results.collapsed375.horizontalOverflow, false)
    assert.equal(results.collapsed375.scrollContainers, 1)
    assert.equal(results.collapsed375.buttonVisible, true)

    await evaluate(`document.querySelector('.order-deferral-fee-trigger').click()`)
    await waitForValue(() => evaluate('Boolean(document.querySelector(".order-deferral-cost-detail"))'))
    results.expanded375 = await readLayout()
    results.expanded375.feeValues = await evaluate(`[...document.querySelectorAll('.order-deferral-cost-row span:last-child')].map((node) => node.textContent.trim())`)
    await screenshot('order-deferral-expanded-375x812')
    assert.equal(results.expanded375.expanded, true)
    assert.deepEqual(results.expanded375.feeValues, ['S/ 1,500', 'S/ 300'])
    assert.equal(results.expanded375.horizontalOverflow, false)

    await openDetail({ width: 360, height: 800 })
    results.collapsed360 = await readLayout()
    await screenshot('order-deferral-collapsed-360x800')
    assert.equal(results.collapsed360.horizontalOverflow, false)
    assert.equal(results.collapsed360.buttonVisible, true)

    await openDetail({ width: 390, height: 844 })
    results.figmaCollapsed390 = await readLayout()
    await screenshot('order-deferral-collapsed-390x844')
    assert.equal(results.figmaCollapsed390.horizontalOverflow, false)
    assert.equal(results.figmaCollapsed390.buttonVisible, true)

    await evaluate(`document.querySelector('.order-deferral-fee-trigger').click()`)
    await waitForValue(() => evaluate('Boolean(document.querySelector(".order-deferral-cost-detail"))'))
    results.figmaExpanded390 = await readLayout()
    await screenshot('order-deferral-expanded-390x844')
    assert.equal(results.figmaExpanded390.expanded, true)

    detailPayload = detailFixture({
      kmeYZle281Z1I2caLJpH: { yc3NXMOMxN1V: 365 },
      vgDMkYy6x5: 1234567,
      rkRqBuDuPCCDRZCuob29: { wso6AenfCBn6: 987654 },
      ej21XmNiglNAN5zMdK: { upWLpOW3Wy: 3210 },
    })
    await openDetail()
    await evaluate(`document.querySelector('.order-deferral-fee-trigger').click()`)
    await waitForValue(() => evaluate('Boolean(document.querySelector(".order-deferral-cost-detail"))'))
    results.longValues = await readLayout()
    results.longValues.feeValues = await evaluate(`[...document.querySelectorAll('.order-deferral-cost-row span:last-child')].map((node) => node.textContent.trim())`)
    await screenshot('order-deferral-long-values-375x812')
    assert.match(results.longValues.title, /365 días/)
    assert.match(results.longValues.description, /S\/ 1,234,567/)
    assert.equal(results.longValues.horizontalOverflow, false)
    assert.equal(results.longValues.buttonVisible, true)

    detailPayload = detailFixture({
      qmYkXDFBY7NwJ: null,
      vgDMkYy6x5: null,
      rkRqBuDuPCCDRZCuob29: { wso6AenfCBn6: null },
      ej21XmNiglNAN5zMdK: { upWLpOW3Wy: null },
    })
    await openDetail()
    results.partialFields = await readLayout()
    await evaluate(`document.querySelector('.order-deferral-fee-trigger').click()`)
    await waitForValue(() => evaluate('Boolean(document.querySelector(".order-deferral-cost-detail"))'))
    results.partialFields.feeValues = await evaluate(`[...document.querySelectorAll('.order-deferral-cost-row span:last-child')].map((node) => node.textContent.trim())`)
    await screenshot('order-deferral-optional-fee-375x812')
    assert.match(results.partialFields.title, /10 días/)
    assert.match(results.partialFields.description, /pagar --/)
    assert.deepEqual(results.partialFields.dateValues, ['--', '2025-11-30'])
    assert.equal(results.partialFields.buttonDisabled, false)
    assert.deepEqual(results.partialFields.feeValues, ['--', '--'])

    detailPayload = detailFixture()
    await openDetail()
    submitPayload = submitFixture()
    submitDelayMs = 1500
    await evaluate(`document.querySelector('.order-deferral-submit').click()`)
    await evaluate(`document.querySelector('.order-deferral-submit').click()`)
    await waitForValue(() => evaluate(`window.__orderDeferralBridge.events.some((entry) => entry.type === 'showLoading')`))
    results.submitting = await evaluate(`(() => ({
      disabled: document.querySelector('.order-deferral-submit').disabled,
      nativeShow: window.__orderDeferralBridge.events.some((entry) => entry.type === 'showLoading'),
    }))()`)
    await screenshot('order-deferral-submitting-375x812')
    assert.equal(results.submitting.disabled, true)
    assert.equal(results.submitting.nativeShow, true)
    await waitForValue(() => evaluate(`window.__orderDeferralBridge.events.some((entry) => entry.type === 'openPrivacyAgreementPage')`))
    results.submit = await evaluate(`(() => ({
      enabled: !document.querySelector('.order-deferral-submit').disabled,
      nativeHidden: window.__orderDeferralBridge.events.some((entry) => entry.type === 'hideLoading'),
      events: window.__orderDeferralBridge.events,
    }))()`)
    const submitRequests = requestLog.filter((entry) => entry.path === SUBMIT_PATH)
    assert.equal(submitRequests.length, 1)
    assert.equal(submitRequests[0].body, JSON.stringify({ ca: 'bill-001' }))
    assert.equal(results.submit.enabled, true)
    assert.equal(results.submit.nativeHidden, true)
    assert.equal(results.submit.events.filter((entry) => entry.type === 'openPrivacyAgreementPage').length, 1)

    await openDetail()
    await evaluate(`document.querySelector('.order-deferral-header__help').click()`)
    await waitForValue(() => evaluate(`location.hash.includes('helpCenter')`))
    results.helpNavigation = await evaluate('location.hash')
    assert.match(results.helpNavigation, /helpCenter/)

    detailPayload = businessFailureFixture('No disponible')
    await navigate('#/deferDetail?orderId=route-order-002')
    await waitForValue(() => evaluate('Boolean(document.querySelector(".van-toast"))'))
    results.businessFailure = await evaluate(`(() => ({
      message: document.querySelector('.van-toast')?.textContent.trim() ?? '',
      summary: Boolean(document.querySelector('.order-deferral-summary')),
      content: Boolean(document.querySelector('.order-deferral-content')),
      submit: Boolean(document.querySelector('.order-deferral-submit')),
      buttonDisabled: document.querySelector('.order-deferral-submit')?.disabled,
      title: document.querySelector('.order-deferral-summary h2')?.textContent.trim() ?? '',
      dateValues: [...document.querySelectorAll('.order-deferral-date-row span:last-child')].map((node) => node.textContent.trim()),
    }))()`)
    const submitRequestsBeforeFailureClick = requestLog.filter((entry) => entry.path === SUBMIT_PATH).length
    await evaluate(`document.querySelector('.order-deferral-submit').click()`)
    await wait(50)
    results.businessFailure.submitRequestsAfterClick = requestLog.filter((entry) => entry.path === SUBMIT_PATH).length
    await screenshot('order-deferral-business-failure-375x812')
    assert.equal(results.businessFailure.message, 'No disponible')
    assert.equal(results.businessFailure.summary, true)
    assert.equal(results.businessFailure.content, true)
    assert.equal(results.businessFailure.submit, true)
    assert.equal(results.businessFailure.buttonDisabled, true)
    assert.equal(results.businessFailure.title, 'Retraso de -- días')
    assert.deepEqual(results.businessFailure.dateValues, ['--', '--'])
    assert.equal(results.businessFailure.submitRequestsAfterClick, submitRequestsBeforeFailureClick)

    detailPayload = detailFixture()
    await openDetail()
    const physicalRequestId = await evaluate('window.__orderDeferralBridge.enabledRequestId')
    assert.equal(typeof physicalRequestId, 'string')
    await evaluate(`window.__dineroProPhysicalBackInterceptReply({
      action: 'physicalBackIntercepted',
      requestId: ${JSON.stringify(physicalRequestId)},
      status: 'intercepted',
      message: 'consumed',
    })`)
    await waitForValue(() => evaluate(`!location.hash.includes('deferDetail')`))
    results.physicalBack = await evaluate(`(() => ({
      hash: location.hash,
      events: window.__orderDeferralBridge.events,
    }))()`)
    assert.equal(results.physicalBack.events.some((entry) => entry.type === 'setPhysicalBackInterceptConfig' && entry.payload.enabled === false), true)

    const requestCountBeforeInvalid = requestLog.filter((entry) => entry.path === DETAIL_PATH).length
    await navigate('#/deferDetail')
    await waitForValue(() => evaluate(`location.hash.includes('/home')`))
    const requestCountAfterInvalid = requestLog.filter((entry) => entry.path === DETAIL_PATH).length
    assert.equal(requestCountAfterInvalid, requestCountBeforeInvalid)

    results.requestLog = requestLog
    results.browserErrors = browserErrors
    assert.equal(browserErrors.length, 0)
    assert.ok(requestLog.some((entry) => entry.method === 'POST' && entry.path === DETAIL_PATH))
    assert.equal(requestLog.some((entry) => entry.path.includes('?')), false)

    await writeFile(path.join(outputDirectory, 'browser-check.json'), JSON.stringify(results, null, 2))
    process.stdout.write(`${JSON.stringify({ status: 'passed', outputDirectory, requests: requestLog.length }, null, 2)}\n`)
  } finally {
    client.close()
    await stopBrowser(browserProcess)
    await wait(250)
    for (let attempt = 0; attempt < 3; attempt += 1) {
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



