import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

function readArgument(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function wait(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay))
}

async function waitForValue(readValue, timeoutMs = 10000) {
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
  const port = 9300 + Math.floor(Math.random() * 500)
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

async function main() {
  const baseUrl = readArgument('--base-url', 'http://127.0.0.1:5173/home-preview.html')
  const browserExecutable = readArgument('--browser')
  const outputDirectory = path.resolve(readArgument('--output-dir', 'home-ui-browser-output'))
  if (!browserExecutable) throw new Error('Missing --browser')
  await mkdir(outputDirectory, { recursive: true })
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'unified-home-browser-'))
  const { browserProcess, webSocketUrl } = await connectDebugger(browserExecutable, profileDirectory)
  const client = await createProtocolClient(webSocketUrl)
  const browserErrors = []

  try {
    const target = await client.send('Target.createTarget', { url: 'about:blank' })
    const attached = await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
    const sessionId = attached.sessionId
    const send = (method, params = {}) => client.send(method, params, sessionId)
    const mockIconBase64 = (await readFile(new URL('../../../assets/home/multi-product-icon.png', import.meta.url))).toString('base64')
    client.on('Runtime.exceptionThrown', (event, eventSessionId) => {
      if (eventSessionId === sessionId) browserErrors.push(event.exceptionDetails.text)
    })
    client.on('Runtime.consoleAPICalled', (event, eventSessionId) => {
      if (eventSessionId === sessionId && event.type === 'error') browserErrors.push('console.error')
    })
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Fetch.enable', { patterns: [{ urlPattern: 'https://fixtures.invalid/*', requestStage: 'Request' }] })
    client.on('Fetch.requestPaused', (event, eventSessionId) => {
      if (eventSessionId !== sessionId) return
      send('Fetch.fulfillRequest', {
        requestId: event.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'image/png' }],
        body: mockIconBase64,
      })
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

    async function navigate(query, viewport = { width: 375, height: 812 }) {
      await setViewport(viewport.width, viewport.height)
      await send('Page.navigate', { url: `${baseUrl}?${query}` })
      await waitForValue(() => evaluate('document.readyState === "complete" && Boolean(window.unifiedHomePreview)'))
      await wait(250)
      await evaluate(`document.querySelector('.unified-home__refresh')?.scrollTo(0, 0)`)
      return evaluate(`({
        width: window.innerWidth,
        height: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        pageScrollContainers: [...document.querySelectorAll('*')].filter((element) => {
          const style = getComputedStyle(element)
          return ['auto', 'scroll'].includes(style.overflowY) && element.scrollHeight > element.clientHeight
        }).map((element) => element.className),
        rootCount: document.querySelectorAll('.unified-home').length,
        amountSourceCount: document.querySelectorAll('.unified-home__amount-card, .unified-home__credit').length,
      })`)
    }

    async function screenshot(name) {
      const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
      await writeFile(path.join(outputDirectory, `${name}.png`), Buffer.from(result.data, 'base64'))
    }

    const results = []
    const rootScenarios = [
      'cash-apply',
      'cash-reviewing',
      'cash-disbursing',
      'cash-repaying',
      'cash-rejected',
      'multi-active-only',
      'multi-processing-only',
      'multi-available-only',
      'multi-available-active',
    ]
    for (const scenario of rootScenarios) {
      const metrics = await navigate(`scenario=${scenario}`)
      assert.equal(metrics.width, 375)
      assert.equal(metrics.height, 812)
      assert.ok(metrics.documentWidth <= metrics.width, `${scenario} has horizontal overflow`)
      assert.ok(metrics.pageScrollContainers.length <= 1, `${scenario} has multiple page scroll containers`)
      assert.equal(metrics.rootCount, 1)
      assert.equal(metrics.amountSourceCount, 1)
      await screenshot(`${scenario}-375x812`)
      results.push({ scenario, viewport: '375x812', metrics })
    }

    const compactMetrics = await navigate('scenario=cash-apply', { width: 360, height: 800 })
    assert.ok(compactMetrics.documentWidth <= compactMetrics.width, 'compact viewport has horizontal overflow')
    await screenshot('cash-apply-360x800')
    results.push({ scenario: 'cash-apply', viewport: '360x800', metrics: compactMetrics })

    for (const tabKey of ['repayment', 'account']) {
      await navigate(`scenario=cash-apply&tab=${tabKey}`)
      assert.equal(await evaluate(`document.querySelector('.unified-home__tabs .is-active span').textContent`), tabKey === 'repayment' ? 'Reembolso' : 'Mi cuenta')
      await screenshot(`tab-${tabKey}-375x812`)
    }

    await navigate('scenario=multi-available-only')
    await evaluate(`document.querySelector('.unified-home__product-summary').click()`)
    assert.equal(await evaluate(`Boolean(document.querySelector('.unified-home__dialog'))`), true)
    assert.equal(await evaluate(`[...document.querySelectorAll('.unified-home__product-icon')].every((image) => image.complete && image.naturalWidth > 0)`), true)
    await evaluate(`document.querySelectorAll('.unified-home__product')[1].click()`)
    const dialogInteractionState = await evaluate(`({
      count: document.querySelector('.unified-home__dialog-action span').textContent,
      selected: document.querySelectorAll('.unified-home__product')[1].classList.contains('is-selected'),
      disabled: document.querySelectorAll('.unified-home__product')[1].disabled,
      operations: window.unifiedHomePreview.operationLog,
      diagnostics: window.unifiedHomePreview.diagnosticLog,
    })`)
    assert.deepEqual(dialogInteractionState, {
      count: '4 productos',
      selected: false,
      disabled: false,
      operations: [{ requestId: 'home-browser-1', type: 'toggle_product_selection', data: { productId: 'product-2', selected: false } }],
      diagnostics: [],
    })
    await evaluate(`document.querySelector('.unified-home__dialog-close').click()`)
    await evaluate(`document.querySelector('.unified-home__product-summary').click()`)
    assert.equal(await evaluate(`document.querySelector('.unified-home__dialog-action span').textContent`), '4 productos')
    await screenshot('multi-product-dialog-375x812')
    assert.deepEqual(await evaluate('window.unifiedHomePreview.operationLog'), [
      { requestId: 'home-browser-1', type: 'toggle_product_selection', data: { productId: 'product-2', selected: false } },
    ])

    await navigate('scenario=cash-apply')
    await evaluate(`document.querySelector('.unified-home__amount-controls button').click()`)
    await evaluate(`document.querySelector('.unified-home__primary').click()`)
    await evaluate(`document.querySelectorAll('.unified-home__tabs button')[2].click()`)
    assert.deepEqual((await evaluate('window.unifiedHomePreview.operationLog')).map((operation) => operation.type), [
      'select_amount',
      'primary_action',
      'select_tab',
    ])

    await navigate('scenario=overlay')
    await screenshot('overlay-375x812')
    await evaluate(`document.querySelector('.unified-home__overlay-dialog').click()`)
    assert.equal(await evaluate(`Boolean(document.querySelector('.unified-home__overlay'))`), true)
    await evaluate(`document.querySelector('.unified-home__overlay').click()`)
    await wait(250)
    assert.equal(await evaluate(`Boolean(document.querySelector('.unified-home__overlay'))`), false)

    for (const scenario of ['loading', 'error', 'toast']) {
      await navigate(`scenario=${scenario}`)
      if (scenario === 'loading') assert.equal(await evaluate(`document.querySelectorAll('.van-skeleton-paragraph').length`), 15)
      if (scenario === 'error') assert.equal(await evaluate(`document.querySelector('.unified-home__error').textContent.trim()`), 'No pudimos cargar esta información.')
      if (scenario === 'toast') assert.equal(await evaluate(`Boolean(document.querySelector('.van-toast'))`), true)
      await screenshot(`${scenario}-375x812`)
    }

    assert.deepEqual(browserErrors, [])
    const report = {
      status: 'passed',
      browserErrors,
      screenshots: rootScenarios.length + 8,
      results,
    }
    await writeFile(path.join(outputDirectory, 'browser-check.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } finally {
    client.close()
    if (browserProcess.exitCode === null) {
      browserProcess.kill()
      await Promise.race([
        new Promise((resolve) => browserProcess.once('exit', resolve)),
        wait(2000),
      ])
    }
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}

await main()
