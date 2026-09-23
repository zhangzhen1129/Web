import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
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
  const port = 9700 + Math.floor(Math.random() * 200)
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

function profileResponse(maskedMobile) {
  return {
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    oi: '',
    mwQMMTLZBtRYyQO: maskedMobile,
  }
}

function redDotResponse(showRedDot) {
  return {
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    oi: '',
    aewM: showRedDot,
  }
}

function deletionResponse() {
  return {
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    oi: '',
    data: {},
  }
}

const DELETE_DIALOG_VISIBLE = `(() => {
  const dialog = document.querySelector('.mine-delete-dialog')
  if (!dialog) return false
  const style = getComputedStyle(dialog)
  return style.display !== 'none' && style.visibility !== 'hidden' && dialog.getBoundingClientRect().height > 0
})()`

async function main() {
  const baseUrl = readArgument('--base-url', 'http://127.0.0.1:4175/?apiHost=https%3A%2F%2Ffixtures.invalid')
  const browserExecutable = readArgument('--browser')
  const outputDirectory = path.resolve(readArgument('--output-dir'))
  if (!browserExecutable) throw new Error('Missing --browser')
  if (!outputDirectory) throw new Error('Missing --output-dir')

  await mkdir(outputDirectory, { recursive: true })
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'mine-browser-'))
  const { browserProcess, webSocketUrl } = await connectDebugger(browserExecutable, profileDirectory)
  const client = await createProtocolClient(webSocketUrl)
  const browserErrors = []
  const requestCounts = { profile: 0, redDot: 0, deletion: 0 }
  let profileFixture = profileResponse('678****989')
  let redDotFixture = redDotResponse(true)
  let deletionResponseDelayMs = 0

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
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('DineroPro:global:api-host', JSON.stringify({ version: 1, value: 'https://fixtures.invalid' }));
        window.__mineLoadingCalls = [];
        window.plahub = {
          showLoading() { window.__mineLoadingCalls.push('show'); },
          hideLoading() { window.__mineLoadingCalls.push('hide'); },
        };`,
    })
    await send('Fetch.enable', {
      patterns: [{ urlPattern: 'https://fixtures.invalid/*', requestStage: 'Request' }],
    })

    client.on('Fetch.requestPaused', async (event, eventSessionId) => {
      if (eventSessionId !== sessionId) return
      const requestUrl = new URL(event.request.url)
      const isPreflight = event.request.method === 'OPTIONS'
      let fixture = {}

      if (requestUrl.pathname === '/eBw/IEsD/ywzs') {
        if (!isPreflight) requestCounts.profile += 1
        fixture = profileFixture
      } else if (requestUrl.pathname === '/n5V/78R7/S1221NY09yUP44TB34UNT') {
        if (!isPreflight) requestCounts.redDot += 1
        fixture = redDotFixture
      } else if (requestUrl.pathname === '/tEH/THDG/ANvNJS') {
        if (!isPreflight) requestCounts.deletion += 1
        fixture = deletionResponse()
      }

      if (!isPreflight && requestUrl.pathname === '/tEH/THDG/ANvNJS' && deletionResponseDelayMs > 0) {
        await wait(deletionResponseDelayMs)
      }

      await send('Fetch.fulfillRequest', {
        requestId: event.requestId,
        responseCode: 200,
        responseHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Access-Control-Allow-Headers', value: '*' },
          { name: 'Access-Control-Allow-Methods', value: '*' },
        ],
        body: isPreflight ? '' : Buffer.from(JSON.stringify(fixture)).toString('base64'),
      }).catch(() => {})
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

    async function openMine({ width = 375, height = 812, expectedPhone, expectedRedDot }) {
      await setViewport(width, height)
      const navigationUrl = new URL(baseUrl)
      navigationUrl.searchParams.set('run', String(Date.now()))
      navigationUrl.hash = '#/mine'
      await send('Page.navigate', { url: navigationUrl.toString() })
      await waitForValue(() => evaluate('document.readyState === "complete" && Boolean(document.querySelector("#app"))'))
      await waitForValue(() => evaluate('Boolean(document.querySelector(".mine-page"))'))
      await wait(1000)
      const actual = await evaluate(`({
        phoneText: document.querySelector('.mine-profile__phone')?.textContent.trim() ?? null,
        redDotCount: document.querySelectorAll('.mine-menu__red-dot').length,
        pageText: document.querySelector('.mine-page')?.textContent ?? '',
        location: location.href,
      })`)
      assert.equal(actual.phoneText, expectedPhone, JSON.stringify({ actual, requestCounts }))
      assert.equal(actual.redDotCount, expectedRedDot ? 1 : 0, JSON.stringify({ actual, requestCounts }))
    }

    async function readPageMetrics() {
      return evaluate(`(() => {
        const icons = Array.from(document.querySelectorAll('.mine-menu__icon, .mine-profile__avatar img'))
        const rect = document.querySelector('.mine-page').getBoundingClientRect()
        return {
          width: window.innerWidth,
          height: window.innerHeight,
          documentWidth: document.documentElement.scrollWidth,
          pageWidth: rect.width,
          pageHeight: rect.height,
          phoneText: document.querySelector('.mine-profile__phone')?.textContent.trim() ?? '',
          menuCount: document.querySelectorAll('.mine-menu__item').length,
          redDotCount: document.querySelectorAll('.mine-menu__red-dot').length,
          loadingCallCount: window.__mineLoadingCalls?.length ?? 0,
          loadingOverlayCount: document.querySelectorAll('[data-dinero-browser-loading]').length,
          iconsLoaded: icons.every((icon) => icon.complete && icon.naturalWidth > 0),
          labels: Array.from(document.querySelectorAll('.mine-menu__label')).map((node) => node.textContent.trim()),
          textContent: document.querySelector('.mine-page').textContent,
        }
      })()`)
    }

    process.stdout.write('stage: initial mine\n')
    await openMine({ expectedPhone: '678****989', expectedRedDot: true })
    process.stdout.write('stage: initial mine loaded\n')
    const baseMetrics = await readPageMetrics()
    assert.equal(baseMetrics.menuCount, 6, JSON.stringify(baseMetrics))
    assert.equal(baseMetrics.redDotCount, 1)
    assert.equal(baseMetrics.loadingCallCount, 0, JSON.stringify(baseMetrics))
    assert.equal(baseMetrics.loadingOverlayCount, 0, JSON.stringify(baseMetrics))
    assert.equal(baseMetrics.iconsLoaded, true)
    assert.deepEqual(baseMetrics.labels, [
      'Todos los pedidos',
      'Información de la tarjeta',
      'Servicio al cliente',
      'Quejas',
      'Configuración',
      'Eliminar',
    ])
    assert.ok(baseMetrics.documentWidth <= baseMetrics.width, JSON.stringify(baseMetrics))
    assert.equal(requestCounts.profile, 1)
    assert.equal(requestCounts.redDot, 1)
    await screenshot('mine-default-375x812')
    process.stdout.write('stage: default screenshot\n')

    await setViewport(360, 800)
    await wait(100)
    const compactMetrics = await readPageMetrics()
    assert.ok(compactMetrics.documentWidth <= compactMetrics.width, JSON.stringify(compactMetrics))
    assert.equal(compactMetrics.menuCount, 6)
    await screenshot('mine-default-360x800')
    process.stdout.write('stage: compact screenshot\n')

    await setViewport(375, 812)
    await evaluate(`document.querySelectorAll('.mine-menu__item')[5].click()`)
    await waitForValue(() => evaluate(DELETE_DIALOG_VISIBLE))
    await wait(350)
    const dialogState = await evaluate(`(() => {
      const dialog = document.querySelector('.mine-delete-dialog')
      const rect = dialog.getBoundingClientRect()
      return {
        text: dialog.textContent,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        bodyOverflow: getComputedStyle(document.body).overflow,
      }
    })()`)
    assert.match(dialogState.text, /Déjame pensar de nuevo/)
    assert.match(dialogState.text, /Confirmar eliminación/)
    assert.ok(dialogState.left >= 0 && dialogState.left + dialogState.width <= 375)
    assert.ok(dialogState.top >= 0 && dialogState.top + dialogState.height <= 812)
    await screenshot('mine-delete-dialog-375x812')
    process.stdout.write('stage: dialog screenshot\n')

    await evaluate(`document.querySelector('.mine-popup-overlay').click()`)
    await wait(100)
    assert.equal(await evaluate(DELETE_DIALOG_VISIBLE), true)

    const historyBeforeBack = await evaluate(`({ length: history.length, state: history.state, href: location.href })`)
    await evaluate(`history.back()`).catch(() => {})
    await waitForValue(() => evaluate(`!${DELETE_DIALOG_VISIBLE}`))
    const backState = await evaluate(`({
      dialog: ${DELETE_DIALOG_VISIBLE},
      href: location.href,
      historyState: window.history.state,
      historyLength: history.length,
    })`)
    assert.equal(backState.dialog, false, JSON.stringify({ historyBeforeBack, backState }))
    assert.equal(await evaluate('location.hash.startsWith("#/mine")'), true)
    assert.equal(requestCounts.deletion, 0)
    process.stdout.write('stage: back closed dialog\n')

    await evaluate(`document.querySelectorAll('.mine-menu__item')[5].click()`)
    await waitForValue(() => evaluate(DELETE_DIALOG_VISIBLE))
    await wait(350)
    await evaluate(`window.__mineTerminalRisk = []; window.addEventListener('dinero-pro:mine-terminal-risk', (event) => window.__mineTerminalRisk.push(event.detail.code))`)
    deletionResponseDelayMs = 350
    await evaluate(`document.querySelector('.mine-delete-dialog__confirm').click()`)
    await waitForValue(() => evaluate('window.__mineLoadingCalls.includes("show")'))
    assert.deepEqual(await evaluate('window.__mineLoadingCalls'), ['show'])
    await waitForValue(() => evaluate('window.__mineTerminalRisk.length > 0'))
    deletionResponseDelayMs = 0
    assert.equal(requestCounts.deletion, 1)
    const deletionLoadingCalls = await evaluate('window.__mineLoadingCalls')
    const deletionLoadingOverlayCount = await evaluate('document.querySelectorAll("[data-dinero-browser-loading]").length')
    assert.deepEqual(deletionLoadingCalls, ['show', 'hide'])
    assert.equal(deletionLoadingOverlayCount, 0)
    assert.deepEqual(await evaluate('window.__mineTerminalRisk'), ['LOGOUT_FAILED'])
    assert.equal(await evaluate('Boolean(document.querySelector(".van-toast"))'), false)
    assert.equal(await evaluate('localStorage.getItem("DineroPro:global:mobile")'), null)
    await screenshot('mine-delete-confirmed-375x812')
    process.stdout.write('stage: deletion confirmed\n')

    await evaluate(`localStorage.setItem('DineroPro:global:mobile', JSON.stringify({ version: 1, value: '678123989' }))`)
    profileFixture = profileResponse('')
    redDotFixture = redDotResponse(false)
    process.stdout.write('stage: fallback navigation\n')
    await openMine({ expectedPhone: '678****989', expectedRedDot: false })
    process.stdout.write('stage: fallback loaded\n')
    const fallbackMetrics = await readPageMetrics()
    assert.equal(fallbackMetrics.redDotCount, 0)
    assert.equal(fallbackMetrics.phoneText, '678****989')
    assert.equal(fallbackMetrics.loadingCallCount, 0, JSON.stringify(fallbackMetrics))
    assert.equal(fallbackMetrics.loadingOverlayCount, 0, JSON.stringify(fallbackMetrics))
    assert.doesNotMatch(fallbackMetrics.textContent, /678123989/)
    await screenshot('mine-fallback-masked-375x812')

    assert.deepEqual(browserErrors, [])
    const report = {
      status: 'passed',
      browserErrors,
      requestCounts,
      baseMetrics,
      compactMetrics,
      dialogState,
      deletionLoadingCalls,
      deletionLoadingOverlayCount,
      fallbackMetrics,
      screenshots: [
        'mine-default-375x812.png',
        'mine-default-360x800.png',
        'mine-delete-dialog-375x812.png',
        'mine-delete-confirmed-375x812.png',
        'mine-fallback-masked-375x812.png',
      ],
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
