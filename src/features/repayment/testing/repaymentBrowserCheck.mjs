import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

function readArgument(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const REPAYMENT_ORDER_LIST_PATH = '/vvf/lxako/rtSkmgvsbtqYojbxMopz'

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
  const port = 9400 + Math.floor(Math.random() * 400)
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

function order(orderNo, orderStatus, amount, productName) {
  return {
    repaymentAmount: amount,
    productIconImageUrl: 'https://fixtures.invalid/icon.png',
    orderNo,
    orderBillId: `BILL-${orderNo}`,
    productId: `PRODUCT-${orderNo}`,
    productName,
    approvalAmount: String(amount + 500),
    orderStatus,
    applyTime: '2025-11-01',
    examinePassTime: '2025-11-02',
    loanTime: '2025-11-03',
    repaymentTime: orderStatus === 90 ? '2025-11-10' : '2025-11-20',
    orderStatusStr: 'Pagar ahora',
  }
}

function response(orders, overrides = {}) {
  return {
    vaOsuw7s: 10,
    bgCAmh0f: { dlWr: 1 },
    cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
    pl9xRlV: '',
    oi: '',
    qrAbsjzu7WLU: { baIJ: orders },
    ...overrides,
  }
}

async function main() {
  const baseUrl = readArgument('--base-url', 'http://127.0.0.1:4173/?apiHost=https%3A%2F%2Ffixtures.invalid')
  const browserExecutable = readArgument('--browser')
  const outputDirectory = path.resolve(readArgument('--output-dir'))
  if (!browserExecutable) throw new Error('Missing --browser')
  if (!outputDirectory) throw new Error('Missing --output-dir')

  await mkdir(outputDirectory, { recursive: true })
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'repayment-browser-'))
  const { browserProcess, webSocketUrl } = await connectDebugger(browserExecutable, profileDirectory)
  const client = await createProtocolClient(webSocketUrl)
  const browserErrors = []
  let fixture = response([])
  let fixtureDelayMs = 0
  let requestCount = 0
  let repaymentRequestCount = 0
  const requestLog = []

  try {
    const target = await client.send('Target.createTarget', { url: 'about:blank' })
    const attached = await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
    const sessionId = attached.sessionId
    const send = (method, params = {}) => client.send(method, params, sessionId)
    const iconBase64 = (await readFile(new URL('../../../assets/home/multi-product-icon.png', import.meta.url))).toString('base64')

    client.on('Runtime.exceptionThrown', (event, eventSessionId) => {
      if (eventSessionId === sessionId) browserErrors.push(event.exceptionDetails.text)
    })
    client.on('Runtime.consoleAPICalled', (event, eventSessionId) => {
      if (eventSessionId === sessionId && event.type === 'error') browserErrors.push('console.error')
    })

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
    await send('Fetch.enable', {
      patterns: [
        { urlPattern: 'http://127.0.0.1:4173/vvf/*', requestStage: 'Request' },
        { urlPattern: 'https://fixtures.invalid/*', requestStage: 'Request' },
      ],
    })
    client.on('Fetch.requestPaused', (event, eventSessionId) => {
      if (eventSessionId !== sessionId) return
      const requestUrl = new URL(event.request.url)
      const isIcon = requestUrl.pathname === '/icon.png'
      const isPreflight = event.request.method === 'OPTIONS'
      if (!isIcon && !isPreflight) {
        requestCount += 1
        requestLog.push(`${event.request.method} ${requestUrl.pathname}`)
        if (requestUrl.pathname === REPAYMENT_ORDER_LIST_PATH) repaymentRequestCount += 1
      }
      const fulfill = () => send('Fetch.fulfillRequest', {
        requestId: event.requestId,
        responseCode: 200,
        responseHeaders: [
          { name: 'Content-Type', value: isIcon ? 'image/png' : 'application/json' },
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Access-Control-Allow-Headers', value: '*' },
          { name: 'Access-Control-Allow-Methods', value: '*' },
        ],
        body: isIcon ? iconBase64 : isPreflight ? '' : Buffer.from(JSON.stringify(fixture)).toString('base64'),
      }).catch(() => {})
      if (!isIcon && !isPreflight && fixtureDelayMs > 0) setTimeout(fulfill, fixtureDelayMs)
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

    async function switchToHomeAndBack() {
      await evaluate(`location.hash = '#/orderList'`)
      await wait(250)
      await evaluate(`location.hash = '#/repayment'`)
      await waitForValue(() => evaluate('Boolean(document.querySelector(".repayment-page"))'))
    }

    async function pullToRefresh() {
      const touchPoints = (y) => [{ x: 187, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }]
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints(140) })
      for (const y of [160, 190, 220, 250, 280]) {
        await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoints(y) })
        await wait(20)
      }
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await wait(60)
    }

    async function openRepayment(nextFixture, width = 375, height = 812, waitForTerminal = true) {
      fixture = nextFixture
      await setViewport(width, height)
      const navigationUrl = new URL(baseUrl)
      navigationUrl.searchParams.set('run', String(Date.now()))
      navigationUrl.hash = '#/home'
      await send('Page.navigate', { url: navigationUrl.toString() })
      await waitForValue(() => evaluate('document.readyState === "complete" && Boolean(document.querySelector("#app"))'))
      await waitForValue(() => evaluate('Boolean(document.querySelector(".unified-home"))'))
      await wait(250)
      await evaluate(`(async () => {
        const appMode = await import('/src/features/shell/appModeStore.js')
        const homeDataMapper = await import('/src/features/home/services/homeDataMapper.js')
        appMode.setAppMode('1')
        appMode.setHomeTabs(homeDataMapper.createHomeTabs('multi_push'))
        appMode.setRepaymentCount(0)
        location.hash = '#/repayment'
        return true
      })()`)
      await waitForValue(() => evaluate('Boolean(document.querySelector(".repayment-page"))'))
      await waitForValue(() => evaluate(waitForTerminal
        ? 'Boolean(document.querySelector(".repayment-page__list, .repayment-page__empty, .repayment-page__error"))'
        : 'Boolean(document.querySelector(".repayment-page__loading"))'))
      await evaluate(`(async () => {
        const appMode = await import('/src/features/shell/appModeStore.js')
        const homeDataMapper = await import('/src/features/home/services/homeDataMapper.js')
        appMode.setHomeTabs(homeDataMapper.createHomeTabs('multi_push'))
        return true
      })()`)
      return evaluate(`(async () => {
        const storeModule = await import('/src/shared/globalStore/globalStore.js')
        return {
        width: window.innerWidth,
        height: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        href: location.href,
        cardCount: document.querySelectorAll('.repaying-card, .overdue-card').length,
        repayingCount: document.querySelectorAll('.repaying-card').length,
        overdueCount: document.querySelectorAll('.overdue-card').length,
        emptyCount: document.querySelectorAll('.repayment-page__empty').length,
        errorCount: document.querySelectorAll('.repayment-page__error').length,
        loadingCount: document.querySelectorAll('.repayment-page__loading').length,
        errorText: document.querySelector('.repayment-page__error')?.textContent.trim() ?? null,
        emptyText: document.querySelector('.repayment-page__empty')?.textContent.trim() ?? null,
        firstStatus: document.querySelector('.repaying-card__status, .overdue-card__status')?.textContent.trim() ?? null,
        firstAmount: document.querySelector('.repaying-card__amount, .overdue-card__amount')?.textContent.trim() ?? null,
        firstDate: document.querySelector('.repaying-card__row:last-child span:last-child, .overdue-card__date')?.textContent.trim() ?? null,
      }})()`)
    }

    const listMetrics = await openRepayment(response([
      order('ORDER-80', 80, 1500, 'Préstamo Rápido'),
      order('ORDER-90', 90, 2300, 'Préstamo Express'),
    ]))
    assert.equal(listMetrics.cardCount, 2, JSON.stringify(listMetrics))
    assert.equal(listMetrics.repayingCount, 1)
    assert.equal(listMetrics.overdueCount, 1)
    assert.equal(listMetrics.firstStatus, 'Pendiente de pago')
    assert.equal(listMetrics.firstAmount, 'S/ 1500')
    assert.equal(listMetrics.firstDate, '2025-11-20')
    assert.ok(listMetrics.documentWidth <= listMetrics.width)
    assert.equal(await evaluate('document.querySelector(".home-tab__badge")?.textContent.trim()'), '2')
    await screenshot('repayment-list-375x812')

    fixture = response([
      order('ORDER-80-REFRESHED', 80, 1700, 'Préstamo Rápido Actualizado'),
    ])
    fixtureDelayMs = 700
    await switchToHomeAndBack()
    await waitForValue(() => evaluate('Boolean(document.querySelector(".browser-native-loading"))'))
    const preservedDuringRefresh = await evaluate(`({
      listCount: document.querySelectorAll('.repayment-page__list').length,
      skeletonCount: document.querySelectorAll('.repayment-page__loading').length,
      cardCount: document.querySelectorAll('.repaying-card, .overdue-card').length,
      title: document.querySelector('.repaying-card__title, .overdue-card__title')?.textContent.trim() ?? null,
    })`)
    assert.equal(preservedDuringRefresh.listCount, 1)
    assert.equal(preservedDuringRefresh.skeletonCount, 0)
    assert.equal(preservedDuringRefresh.cardCount, 2)
    assert.equal(preservedDuringRefresh.title, 'Préstamo Rápido')
    await screenshot('repayment-reactivation-loading-375x812')
    await waitForValue(() => evaluate(`document.querySelector('.repaying-card__title')?.textContent.trim() === 'Préstamo Rápido Actualizado'`))
    const refreshedState = await evaluate(`({
      listCount: document.querySelectorAll('.repayment-page__list').length,
      skeletonCount: document.querySelectorAll('.repayment-page__loading').length,
      cardCount: document.querySelectorAll('.repaying-card, .overdue-card').length,
      title: document.querySelector('.repaying-card__title')?.textContent.trim() ?? null,
    })`)
    assert.equal(refreshedState.listCount, 1)
    assert.equal(refreshedState.skeletonCount, 0)
    assert.equal(refreshedState.cardCount, 1)
    assert.equal(refreshedState.title, 'Préstamo Rápido Actualizado')
    await screenshot('repayment-reactivation-refreshed-375x812')
    fixtureDelayMs = 0

    const pullBaseMetrics = await openRepayment(response([
      order('ORDER-80', 80, 1500, 'Préstamo Rápido'),
    ]))
    assert.equal(pullBaseMetrics.cardCount, 1)
    fixture = response([order('ORDER-80-PULLED', 80, 1900, 'Préstamo Tirado')])
    fixtureDelayMs = 700
    const requestsBeforePull = repaymentRequestCount
    await pullToRefresh()
    await waitForValue(() => evaluate('Boolean(document.querySelector(".browser-native-loading"))'))
    const duringPull = await evaluate(`({
      listCount: document.querySelectorAll('.repayment-page__list').length,
      skeletonCount: document.querySelectorAll('.repayment-page__loading').length,
      errorCount: document.querySelectorAll('.repayment-page__error').length,
      cardCount: document.querySelectorAll('.repaying-card, .overdue-card').length,
      title: document.querySelector('.repaying-card__title')?.textContent.trim() ?? null,
    })`)
    assert.equal(duringPull.listCount, 1, JSON.stringify(duringPull))
    assert.equal(duringPull.skeletonCount, 0)
    assert.equal(duringPull.errorCount, 0)
    assert.equal(duringPull.cardCount, 1)
    assert.equal(duringPull.title, 'Préstamo Rápido')
    await screenshot('repayment-pull-refresh-loading-375x812')
    await waitForValue(() => evaluate(`document.querySelector('.repaying-card__title')?.textContent.trim() === 'Préstamo Tirado'`))
    await waitForValue(() => evaluate('!document.querySelector(".browser-native-loading")'))
    const afterPull = await evaluate(`({
      listCount: document.querySelectorAll('.repayment-page__list').length,
      skeletonCount: document.querySelectorAll('.repayment-page__loading').length,
      cardCount: document.querySelectorAll('.repaying-card, .overdue-card').length,
      title: document.querySelector('.repaying-card__title')?.textContent.trim() ?? null,
      trackTransform: document.querySelector('.repayment-page__refresh .van-pull-refresh__track')?.style.transform ?? null,
      badge: document.querySelector('.home-tab__badge')?.textContent.trim() ?? null,
    })`)
    assert.equal(afterPull.listCount, 1)
    assert.equal(afterPull.skeletonCount, 0)
    assert.equal(afterPull.cardCount, 1)
    assert.equal(afterPull.title, 'Préstamo Tirado')
    assert.equal(afterPull.trackTransform, '')
    assert.equal(afterPull.badge, '1')
    assert.equal(repaymentRequestCount - requestsBeforePull, 1, JSON.stringify(requestLog.slice(-6)))
    await screenshot('repayment-pull-refresh-refreshed-375x812')
    fixtureDelayMs = 0

    const errorPullMetrics = await openRepayment({
      cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
      pl9xRlV: 'No disponible',
    })
    assert.equal(errorPullMetrics.errorCount, 1)
    fixture = response([order('ORDER-80-RECOVERED', 80, 2100, 'Préstamo Recuperado')])
    fixtureDelayMs = 600
    // The business-failure Toast uses forbidClick, which blocks touch input
    // until the Toast auto-closes and releases the body lock class.
    await waitForValue(() => evaluate('!document.body.classList.contains("van-toast--unclickable")'))
    await pullToRefresh()
    const duringErrorPull = await evaluate(`({
      errorCount: document.querySelectorAll('.repayment-page__error').length,
      errorText: document.querySelector('.repayment-page__error')?.textContent.trim() ?? null,
      listCount: document.querySelectorAll('.repayment-page__list').length,
      skeletonCount: document.querySelectorAll('.repayment-page__loading').length,
    })`)
    assert.equal(duringErrorPull.errorCount, 1, JSON.stringify(duringErrorPull))
    assert.equal(duringErrorPull.errorText, 'No disponible')
    assert.equal(duringErrorPull.listCount, 0)
    assert.equal(duringErrorPull.skeletonCount, 0)
    await screenshot('repayment-pull-refresh-error-loading-375x812')
    await waitForValue(() => evaluate('Boolean(document.querySelector(".repayment-page__list"))'))
    const recoveredFromError = await evaluate(`({
      errorCount: document.querySelectorAll('.repayment-page__error').length,
      listCount: document.querySelectorAll('.repayment-page__list').length,
      cardCount: document.querySelectorAll('.repaying-card, .overdue-card').length,
      title: document.querySelector('.repaying-card__title')?.textContent.trim() ?? null,
      trackTransform: document.querySelector('.repayment-page__refresh .van-pull-refresh__track')?.style.transform ?? null,
    })`)
    assert.equal(recoveredFromError.errorCount, 0)
    assert.equal(recoveredFromError.listCount, 1)
    assert.equal(recoveredFromError.cardCount, 1)
    assert.equal(recoveredFromError.title, 'Préstamo Recuperado')
    assert.equal(recoveredFromError.trackTransform, '')
    await screenshot('repayment-pull-refresh-error-recovered-375x812')
    fixtureDelayMs = 0

    const compactMetrics = await openRepayment(response([
      order('ORDER-80', 80, 1500, 'Préstamo Rápido'),
      order('ORDER-90', 90, 2300, 'Préstamo Express'),
    ]), 360, 800)
    assert.ok(compactMetrics.documentWidth <= compactMetrics.width)
    await screenshot('repayment-list-360x800')

    fixtureDelayMs = 900
    const loadingMetrics = await openRepayment(response([
      order('ORDER-80', 80, 1500, 'Préstamo Rápido'),
    ]), 375, 812, false)
    assert.equal(loadingMetrics.loadingCount, 1)
    const requestsBeforeLoadingPull = repaymentRequestCount
    await pullToRefresh()
    await wait(200)
    assert.equal(repaymentRequestCount, requestsBeforeLoadingPull, JSON.stringify(requestLog.slice(-6)))
    assert.equal(
      await evaluate(`document.querySelector('.repayment-page__refresh .van-pull-refresh__track')?.style.transform ?? ''`),
      '',
    )
    await screenshot('repayment-loading-375x812')
    fixtureDelayMs = 0

    const emptyMetrics = await openRepayment(response([]))
    assert.equal(emptyMetrics.emptyCount, 1)
    assert.equal(await evaluate('document.querySelector(".repayment-page__empty-text")?.textContent.trim()'), 'Sin orden')
    assert.equal(await evaluate('document.querySelector(".repayment-page__empty-action")?.textContent.trim()'), 'Aplicar ahora')
    await screenshot('repayment-empty-375x812')

    const nullEmptyMetrics = await openRepayment(response(null))
    assert.equal(nullEmptyMetrics.emptyCount, 1)
    await screenshot('repayment-empty-null-375x812')

    const invalidMetrics = await openRepayment({
      cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
      qrAbsjzu7WLU: { baIJ: 'invalid' },
    })
    assert.equal(invalidMetrics.errorCount, 1)
    assert.equal(await evaluate('Boolean(document.querySelector(".van-toast"))'), false)
    await screenshot('repayment-invalid-no-toast-375x812')

    const businessFailureMetrics = await openRepayment({
      cyiUgNvO2EPltj: { atY3WWbXIN: 2001 },
      pl9xRlV: 'No disponible',
    })
    assert.equal(businessFailureMetrics.errorCount, 1)
    await waitForValue(() => evaluate('Boolean(document.querySelector(".van-toast"))'))
    assert.equal(await evaluate('document.querySelector(".repayment-page__error")?.textContent.trim()'), 'No disponible')
    await screenshot('repayment-error-375x812')

    await openRepayment(response([order('ORDER-80', 80, 1500, 'Préstamo Rápido')]))
    const badgeCases = [
      [0, null],
      [1, '1'],
      [99, '99'],
      [100, '99+'],
    ]
    for (const [count, expected] of badgeCases) {
      await evaluate(`(async () => {
        const appMode = await import('/src/features/shell/appModeStore.js')
        appMode.setRepaymentCount(${count})
        return true
      })()`)
      await wait(50)
      assert.equal(await evaluate('document.querySelector(".home-tab__badge")?.textContent.trim() ?? null'), expected)
    }
    const badgeStyle = await evaluate(`(() => {
      const badge = document.querySelector('.home-tab__badge')
      const style = getComputedStyle(badge)
      return {
        height: style.height,
        borderRadius: style.borderRadius,
        backgroundColor: style.backgroundColor,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        position: style.position,
      }
    })()`)
    const scale = 375 / 390
    assert.ok(Math.abs(Number.parseFloat(badgeStyle.height) - 14 * scale) < 0.05)
    assert.ok(Math.abs(Number.parseFloat(badgeStyle.borderRadius) - 7 * scale) < 0.05)
    assert.equal(badgeStyle.backgroundColor, 'rgb(255, 74, 67)')
    assert.ok(Math.abs(Number.parseFloat(badgeStyle.fontSize) - 10 * scale) < 0.05)
    assert.equal(badgeStyle.fontWeight, '700')
    assert.equal(badgeStyle.position, 'absolute')
    await screenshot('repayment-badge-selected-375x812')

    await evaluate(`location.hash = '#/home'`)
    await waitForValue(() => evaluate('Boolean(document.querySelector(".home-tabs"))'))
    await evaluate(`(async () => {
      const appMode = await import('/src/features/shell/appModeStore.js')
      appMode.setAppMode('1')
      appMode.setHomeTabs([
        { key: 'home', text: 'Préstamos', iconResourceKey: 'home', active: true, enabled: true },
        { key: 'repayment', text: 'Pedidos', iconResourceKey: 'repayment', active: false, enabled: true },
        { key: 'account', text: 'Mi cuenta', iconResourceKey: 'account', active: false, enabled: true },
      ])
      appMode.setRepaymentCount(100)
      return true
    })()`)
    await wait(50)
    assert.equal(await evaluate('document.querySelector(".home-tab__badge")?.textContent.trim()'), '99+')
    await screenshot('repayment-badge-unselected-375x812')

    assert.deepEqual(browserErrors, [])
    const report = {
      status: 'passed',
      browserErrors,
      screenshots: [
        'repayment-loading-375x812.png',
        'repayment-list-375x812.png',
        'repayment-reactivation-loading-375x812.png',
        'repayment-reactivation-refreshed-375x812.png',
        'repayment-pull-refresh-loading-375x812.png',
        'repayment-pull-refresh-refreshed-375x812.png',
        'repayment-pull-refresh-error-loading-375x812.png',
        'repayment-pull-refresh-error-recovered-375x812.png',
        'repayment-list-360x800.png',
        'repayment-empty-375x812.png',
        'repayment-empty-null-375x812.png',
        'repayment-invalid-no-toast-375x812.png',
        'repayment-error-375x812.png',
        'repayment-badge-selected-375x812.png',
        'repayment-badge-unselected-375x812.png',
      ],
      listMetrics,
      preservedDuringRefresh,
      refreshedState,
      pullBaseMetrics,
      duringPull,
      afterPull,
      errorPullMetrics,
      duringErrorPull,
      recoveredFromError,
      loadingMetrics,
      compactMetrics,
      emptyMetrics,
      nullEmptyMetrics,
      invalidMetrics,
      businessFailureMetrics,
      badgeStyle,
      repaymentRequestCount,
      requestLog,
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
