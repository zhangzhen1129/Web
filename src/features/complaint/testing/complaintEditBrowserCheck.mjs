import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const API_HOST = 'https://fixtures.invalid'
const FEEDBACK_PATH = '/ntn/zwjv/wfzjKtqupfmsx0ihswh'
const RED_DOT_PATH = '/n5V/78R7/S1221NY09yUP44TB34UNT'
const SUCCESS_TEXT = 'Enviado exitosamente, lo procesaremos lo más pronto posible'
const REQUEST_FAILURE_TEXT = 'Unable to complete the network request.'
const VALID_HASH = '#/complainEdit?type=DineroPro&question=Recordatorio+de+problemas+de+pago'

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
  const port = 12100 + Math.floor(Math.random() * 300)
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

function successEnvelope() {
  return {
    vaOsuw7s: 0,
    bgCAmh0f: { dlWr: 0 },
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    oi: '',
    data: {},
  }
}

function businessFailureEnvelope(message) {
  return {
    ...successEnvelope(),
    cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
    pl9xRlV: message,
  }
}

function sanitizeFeedbackRequest(entry) {
  let body = {}
  try {
    body = JSON.parse(entry.body)
  } catch {}

  return {
    method: entry.method,
    path: entry.path,
    query: entry.query,
    agency: body?.vaGLDIESiMEPCVK0Oyncl?.udxCuzvJ9DvGtMBRF ?? '',
    question: body?.hvwxtAujGLm ?? '',
    details: body?.hgCYz1AtCaH1Bg ?? '',
    userIdPresent: typeof body?.tn10zMNurs?.exMykk === 'string' && body.tn10zMNurs.exMykk.length > 0,
    tokenPresent: typeof body?.yjDnG === 'string' && body.yjDnG.length > 0,
    gpsEmpty: body?.ulG === '' && body?.vqfH0gehfvNYrW?.rpryc7q8rm === '',
    imageFieldsAbsent: !Object.hasOwn(body, 'bebcdw6U0YpUcYdbGbWKFoD')
      && !Object.hasOwn(body, 'ibcDnsMBaveUaHeIrbrr')
      && !Object.hasOwn(body, 'wnXdSy1WV0kW708dBdRMAqy'),
  }
}

async function main() {
  const baseUrl = readArgument('--base-url', 'http://127.0.0.1:4174/')
  const browserExecutable = readArgument('--browser', DEFAULT_BROWSER)
  const outputArgument = readArgument('--output-dir')
  if (!outputArgument) throw new Error('Missing --output-dir')

  const outputDirectory = path.resolve(outputArgument)
  await mkdir(outputDirectory, { recursive: true })
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'complaint-edit-browser-'))
  const requestHistory = []
  const feedbackRequests = []
  const screenshots = []
  const results = { status: 'passed', baseUrl, scenarios: {}, requests: [], bridge: [], screenshots: [] }
  let browserProcess
  let client
  let sessionId
  let feedbackResponse = successEnvelope()
  let feedbackHttpStatus = 200
  let feedbackDelayMs = 0

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
          localStorage.setItem('DineroPro:global:user-id', JSON.stringify({ version: 1, value: 'user-fixture' }))
          localStorage.setItem('DineroPro:global:mobile', JSON.stringify({ version: 1, value: '913456789' }))
          localStorage.setItem('DineroPro:global:app-name', JSON.stringify({ version: 1, value: 'FixtureApp' }))
          localStorage.setItem('DineroPro:global:app-version', JSON.stringify({ version: 1, value: '1.2.3' }))
          localStorage.setItem('DineroPro:global:package-name', JSON.stringify({ version: 1, value: 'fixture.package' }))
          localStorage.setItem('DineroPro:global:af-id', JSON.stringify({ version: 1, value: 'af-fixture' }))
          localStorage.setItem('DineroPro:global:ga-id', JSON.stringify({ version: 1, value: 'ga-fixture' }))
          localStorage.setItem('DineroPro:global:fb-id', JSON.stringify({ version: 1, value: 'fb-fixture' }))
        } catch {}
        ;(() => {
          const bridge = window.__complaintEditBridge = { events: [] }
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
      const isFeedback = requestPath === FEEDBACK_PATH
      const isRedDot = requestPath === RED_DOT_PATH
      const isPreflight = event.request.method === 'OPTIONS'
      if (!isPreflight && (isFeedback || isRedDot)) {
        const entry = {
          method: event.request.method,
          path: requestPath,
          query: requestUrl.search,
          body: event.request.postData ?? '',
        }
        requestHistory.push(entry)
        if (isFeedback) feedbackRequests.push(entry)
      }

      const responseCode = isPreflight ? 204 : isFeedback ? feedbackHttpStatus : isRedDot ? 200 : 404
      const payload = isPreflight
        ? null
        : isFeedback
          ? feedbackResponse
          : isRedDot
            ? successEnvelope()
            : null
      const responseBody = payload ? Buffer.from(JSON.stringify(payload)).toString('base64') : ''
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

      if (isFeedback && !isPreflight && feedbackDelayMs > 0) setTimeout(fulfill, feedbackDelayMs)
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

    async function fillDetails(value) {
      const filled = await evaluate(`(() => {
        const input = document.querySelector('#complaint-edit-details')
        if (!input) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
        setter.call(input, ${JSON.stringify(value)})
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)
      assert.equal(filled, true)
    }

    async function openPage() {
      feedbackRequests.length = 0
      await navigate('#/home')
      await evaluate(`location.hash = '#/complainHome'`)
      await waitForExpression(`Boolean(document.querySelector('.complaint-page'))`)
      await click('.complaint-agency__option:first-child')
      await waitForExpression(`Boolean(document.querySelector('.complaint-question-sheet'))`)
      await click('.complaint-question-option:nth-child(3)')
      await waitForExpression(`Boolean(document.querySelector('.complaint-edit-page'))`)
      await wait(100)
    }

    function snapshotExpression() {
      return `(() => {
        const button = document.querySelector('.complaint-edit-submit')
        const page = document.querySelector('.complaint-edit-page')
        const scroll = document.querySelector('.complaint-edit-scroll')
        return {
          hash: location.hash,
          title: document.querySelector('.complaint-edit-header h1')?.textContent.trim() ?? '',
          agency: document.querySelectorAll('.complaint-edit-readonly')[0]?.textContent.trim() ?? '',
          question: document.querySelectorAll('.complaint-edit-readonly')[1]?.textContent.trim() ?? '',
          detailsLabel: document.querySelector('label[for="complaint-edit-details"]')?.textContent.trim() ?? '',
          placeholder: document.querySelector('#complaint-edit-details')?.getAttribute('placeholder') ?? '',
          details: document.querySelector('#complaint-edit-details')?.value ?? '',
          counter: document.querySelector('.complaint-edit-heading span')?.textContent.trim() ?? '',
          contact: document.querySelectorAll('.complaint-edit-readonly')[2]?.textContent.trim() ?? '',
          submitDisabled: button?.disabled ?? false,
          scrollContainers: document.querySelectorAll('.complaint-edit-scroll').length,
          pageHidden: page ? getComputedStyle(page).display === 'none' : true,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          bodyHasFullMobile: document.body.textContent.includes('913456789'),
          scrollClientHeight: scroll?.clientHeight ?? 0,
          scrollHeight: scroll?.scrollHeight ?? 0,
        }
      })()`
    }

    async function snapshot() {
      return evaluate(snapshotExpression())
    }

    await setViewport(390, 844)
    await openPage()
    const empty = await snapshot()
    assert.deepEqual(empty, {
      hash: VALID_HASH,
      title: 'Quejas',
      agency: 'DineroPro',
      question: 'Recordatorio de problemas de pago',
      detailsLabel: 'Detalles de la pregunta',
      placeholder: 'Por favor complete el contenido de su queja, no más de 100 palabras.',
      details: '',
      counter: '0/100',
      contact: '913****789',
      submitDisabled: true,
      scrollContainers: 1,
      pageHidden: false,
      horizontalOverflow: false,
      bodyHasFullMobile: false,
      scrollClientHeight: empty.scrollClientHeight,
      scrollHeight: empty.scrollHeight,
    })
    assert.equal(feedbackRequests.length, 0)
    assert.equal(empty.scrollHeight <= empty.scrollClientHeight, true)

    const geometry = await evaluate(`(() => {
      const rect = (selector) => {
        const value = document.querySelector(selector)?.getBoundingClientRect()
        return value ? { top: value.top, bottom: value.bottom, left: value.left, right: value.right, width: value.width, height: value.height } : null
      }
      return {
        header: rect('.complaint-edit-header'),
        back: rect('.complaint-edit-back'),
        firstLabel: rect('.complaint-edit-field:nth-child(1) .complaint-edit-label'),
        firstField: rect('.complaint-edit-field:nth-child(1) .complaint-edit-readonly'),
        secondLabel: rect('.complaint-edit-field:nth-child(2) .complaint-edit-label'),
        detailsLabel: rect('.complaint-edit-field:nth-child(3) .complaint-edit-heading'),
        textarea: rect('#complaint-edit-details'),
        contactField: rect('.complaint-edit-field:nth-child(4) .complaint-edit-readonly'),
        submit: rect('.complaint-edit-submit'),
      }
    })()`)
    const assertNear = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < .5, label + ': ' + actual + ' != ' + expected)
    assertNear(geometry.header.height, 64, 'header height')
    assertNear(geometry.back.top, 56, 'back top')
    assertNear(geometry.back.left, 16, 'back left')
    assertNear(geometry.firstLabel.top, 126, 'first label top')
    assertNear(geometry.firstField.top, 154, 'first field top')
    assertNear(geometry.secondLabel.top, 226, 'second label top')
    assertNear(geometry.detailsLabel.top, 326, 'details label top')
    assertNear(geometry.textarea.top, 354, 'textarea top')
    assertNear(geometry.textarea.height, 96, 'textarea height')
    assertNear(geometry.contactField.top, 494, 'contact top')
    assertNear(geometry.submit.top, 764, 'submit top')
    await screenshot('complaint-edit-empty-390x844')
    await setViewport(375, 812)
    await screenshot('complaint-edit-empty-375x812')
    await setViewport(360, 800)
    const compact = await snapshot()
    assert.equal(compact.horizontalOverflow, false)
    assert.equal(compact.title, 'Quejas')
    await screenshot('complaint-edit-empty-360x800')

    await setViewport(375, 812)
    await fillDetails(' ')
    const whitespace = await snapshot()
    assert.equal(whitespace.counter, '1/100')
    assert.equal(whitespace.submitDisabled, true)
    await fillDetails('A')
    const oneCharacter = await snapshot()
    assert.equal(oneCharacter.counter, '1/100')
    assert.equal(oneCharacter.submitDisabled, false)
    await fillDetails('B'.repeat(101))
    const oneHundred = await snapshot()
    assert.equal(oneHundred.details.length, 100)
    assert.equal(oneHundred.counter, '100/100')
    assert.equal(oneHundred.submitDisabled, false)
    await screenshot('complaint-edit-filled-100-375x812')
    results.scenarios.input = { whitespace, oneCharacter, oneHundred }

    feedbackResponse = successEnvelope()
    feedbackHttpStatus = 200
    feedbackDelayMs = 500
    await openPage()
    await fillDetails('Controlled complaint details')
    const bridgeBeforeSubmit = await evaluate(`window.__complaintEditBridge.events.length`)
    await click('.complaint-edit-submit')
    await click('.complaint-edit-submit')
    await waitForExpression(`location.hash === '#/complainHome'`)
    await waitForExpression(`document.body.textContent.includes(${JSON.stringify(SUCCESS_TEXT)})`)
    const successState = await snapshot()
    assert.equal(successState.hash, '#/complainHome')
    assert.equal(feedbackRequests.length, 1)
    const successRequest = sanitizeFeedbackRequest(feedbackRequests[0])
    assert.deepEqual(successRequest, {
      method: 'POST',
      path: FEEDBACK_PATH,
      query: '',
      agency: 'DineroPro',
      question: 'Recordatorio de problemas de pago',
      details: 'Controlled complaint details',
      userIdPresent: true,
      tokenPresent: true,
      gpsEmpty: true,
      imageFieldsAbsent: true,
    })
    const successBridge = await evaluate(`window.__complaintEditBridge.events.slice(${bridgeBeforeSubmit}).map((entry) => entry.type)`)
    assert.deepEqual(successBridge, ['showLoading', 'hideLoading'])
    await screenshot('complaint-edit-success-toast-375x812')
    results.scenarios.success = { successState, request: successRequest, bridge: successBridge }
    feedbackDelayMs = 0
    await wait(2300)

    feedbackResponse = businessFailureEnvelope('Controlled failure')
    await openPage()
    await fillDetails('Keep this controlled detail')
    await click('.complaint-edit-submit')
    await waitForExpression(`document.body.textContent.includes('Controlled failure')`)
    const failure = await snapshot()
    assert.equal(failure.hash, VALID_HASH)
    assert.equal(failure.details, 'Keep this controlled detail')
    assert.equal(failure.submitDisabled, false)
    assert.equal(feedbackRequests.length, 1)
    assert.equal((await evaluate(`document.body.textContent.includes(${JSON.stringify(SUCCESS_TEXT)})`)), false)
    results.scenarios.businessFailure = failure

    feedbackResponse = successEnvelope()
    await wait(2300)
    feedbackRequests.length = 0
    await click('.complaint-edit-submit')
    await waitForExpression(`location.hash === '#/complainHome'`)
    assert.equal(feedbackRequests.length, 1)
    await wait(2300)

    feedbackHttpStatus = 500
    await openPage()
    await fillDetails('Request failure details')
    await click('.complaint-edit-submit')
    await waitForExpression(`document.body.textContent.includes(${JSON.stringify(REQUEST_FAILURE_TEXT)})`)
    const requestFailure = await snapshot()
    assert.equal(requestFailure.hash, VALID_HASH)
    assert.equal(requestFailure.details, 'Request failure details')
    assert.equal((await evaluate(`document.body.textContent.includes(${JSON.stringify(SUCCESS_TEXT)})`)), false)

    feedbackHttpStatus = 200
    await openPage()
    const visibleBackBefore = await evaluate(`({ hash: location.hash, state: history.state, length: history.length })`)
    await click('.complaint-edit-back')
    await wait(500)
    const visibleBackAfter = await evaluate(`({ hash: location.hash, state: history.state, length: history.length })`)
    assert.equal(feedbackRequests.length, 0)
    assert.equal(visibleBackAfter.hash === '#/complainHome' || visibleBackAfter.hash === '#/home', true)
    results.scenarios.visibleBack = { before: visibleBackBefore, after: visibleBackAfter }


    feedbackDelayMs = 700
    feedbackRequests.length = 0
    await openPage()
    await fillDetails('Late controlled response')
    const bridgeBeforeLate = await evaluate(`window.__complaintEditBridge.events.length`)
    await click('.complaint-edit-submit')
    await click('.complaint-edit-back')
    await waitForExpression(`location.hash === '#/complainHome'`)
    await wait(1000)
    const lateState = await evaluate(`({
      hash: location.hash,
      toastVisible: document.body.textContent.includes(${JSON.stringify(SUCCESS_TEXT)}),
      bridge: window.__complaintEditBridge.events.slice(${bridgeBeforeLate}).map((entry) => entry.type),
    })`)
    assert.deepEqual(lateState, {
      hash: '#/complainHome',
      toastVisible: false,
      bridge: ['showLoading', 'hideLoading'],
    })
    results.scenarios.lateResponse = lateState
    feedbackDelayMs = 0

    const keyboardViewport = { width: 390, height: 544 }
    await openPage()
    await setViewport(keyboardViewport.width, keyboardViewport.height)
    await evaluate(`document.querySelector('#complaint-edit-details').focus()`)
    await wait(200)
    const keyboard = await evaluate(`(() => {
      const scroll = document.querySelector('.complaint-edit-scroll')
      const input = document.querySelector('#complaint-edit-details')
      const submit = document.querySelector('.complaint-edit-submit')
      input.scrollIntoView({ block: 'center' })
      const scrollRect = scroll.getBoundingClientRect()
      const inputRect = input.getBoundingClientRect()
      const submitRect = submit.getBoundingClientRect()
      return {
        scrollable: scroll.scrollHeight > scroll.clientHeight,
        inputTop: inputRect.top,
        inputBottom: inputRect.bottom,
        inputVisible: inputRect.top >= scrollRect.top && inputRect.bottom <= scrollRect.bottom,
        submitVisible: submitRect.top >= 0 && submitRect.bottom <= innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }
    })()`)
    assert.equal(keyboard.scrollable, true)
    assert.equal(keyboard.inputVisible, true)
    assert.equal(keyboard.submitVisible, true)
    assert.equal(keyboard.horizontalOverflow, false)
    await screenshot('complaint-edit-keyboard-sim-390x544')
    results.scenarios.keyboardSimulation = keyboard

    await navigate('#/home')
    await setViewport(375, 812)
    await evaluate(`location.hash = '#/complainEdit?type=DineroPro&question=Recordatorio%20de%20problemas%20de%20pago&extra=1'`)
    await waitForExpression(`location.hash === '#/home'`)
    results.scenarios.invalidQuery = { hash: await evaluate('location.hash') }

    results.scenarios.empty = empty
    results.scenarios.geometry = geometry
    results.scenarios.compact = compact
    results.scenarios.requestFailure = requestFailure
    results.requests = requestHistory.map((entry) => entry.path === FEEDBACK_PATH
      ? sanitizeFeedbackRequest(entry)
      : { method: entry.method, path: entry.path, query: entry.query })
    results.bridge = await evaluate('window.__complaintEditBridge.events')
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
