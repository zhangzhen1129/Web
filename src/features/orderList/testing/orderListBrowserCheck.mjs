import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

function readArgument(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const ORDER_LIST_PATH = '/bev/Bgq3E/y7FiRay'

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
  const port = 9600 + Math.floor(Math.random() * 400)
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

const STATUS_TEXT = Object.freeze({
  10: 'Pendiente de aplicar',
  20: 'Revisando',
  21: 'Revisando',
  30: 'Aprobado',
  40: 'Rechazado',
  70: 'Desembolsando',
  80: 'Reembolsando',
  90: 'Atrasado',
  100: 'Completado',
  101: 'Completado',
  110: 'Fracaso',
})

function order(orderNo, orderStatus, overrides = {}) {
  const isRepayment = orderStatus === 80 || orderStatus === 90
  return {
    repaymentAmount: isRepayment ? 1500 + orderStatus : 0,
    productIconImageUrl: 'https://fixtures.invalid/icon.png',
    orderNo,
    orderBillId: `BILL-${orderNo}`,
    productId: `PRODUCT-${orderNo}`,
    productName: `Prestamo ${orderStatus}`,
    approvalAmount: isRepayment ? '0' : '1500',
    orderStatus,
    applyTime: '2025-11-20',
    examinePassTime: '2025-11-02',
    loanTime: '2025-11-03',
    repaymentTime: orderStatus === 90 ? '2025-11-10' : '2025-11-20',
    orderStatusStr: `Action ${orderStatus}`,
    ...overrides,
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

function allStatusOrders() {
  return [10, 20, 21, 30, 40, 70, 80, 90, 100, 101, 110].map((status) => order(`ORDER-${status}`, status))
}

async function main() {
  const baseUrl = readArgument('--base-url', 'http://127.0.0.1:4173/?apiHost=https%3A%2F%2Ffixtures.invalid')
  const browserExecutable = readArgument('--browser')
  const outputDirectory = path.resolve(readArgument('--output-dir'))
  if (!browserExecutable) throw new Error('Missing --browser')
  if (!outputDirectory) throw new Error('Missing --output-dir')

  await mkdir(outputDirectory, { recursive: true })
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'order-list-browser-'))
  const { browserProcess, webSocketUrl } = await connectDebugger(browserExecutable, profileDirectory)
  const client = await createProtocolClient(webSocketUrl)
  const browserErrors = []
  const requestLog = []
  let fixture = response([])
  let fixtureDelayMs = 0
  let fixtureStatus = 200
  const results = {}

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
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem('DineroPro:global:api-host', JSON.stringify({ version: 1, value: 'https://fixtures.invalid' })) } catch {}`,
    })
    await send('Fetch.enable', {
      patterns: [
        { urlPattern: 'https://fixtures.invalid/*', requestStage: 'Request' },
      ],
    })
    client.on('Fetch.requestPaused', (event, eventSessionId) => {
      if (eventSessionId !== sessionId) return
      const requestUrl = new URL(event.request.url)
      const isIcon = requestUrl.pathname === '/icon.png'
      const isPreflight = event.request.method === 'OPTIONS'
      if (!isIcon && !isPreflight) requestLog.push(`${event.request.method} ${requestUrl.pathname}`)

      const fulfill = () => send('Fetch.fulfillRequest', {
        requestId: event.requestId,
        responseCode: isIcon ? 200 : fixtureStatus,
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

    async function waitForHash(fragment, timeoutMs = 8000) {
      const startedAt = Date.now()
      let hash = ''
      while (Date.now() - startedAt < timeoutMs) {
        hash = await evaluate('location.hash')
        if (hash.includes(fragment)) return hash
        await wait(100)
      }
      throw new Error(`Hash never contained "${fragment}"; last hash was "${hash}"`)
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

    async function openOrderList(nextFixture, {
      width = 375,
      height = 812,
      delayMs = 0,
      status = 200,
      waitForTerminal = true,
    } = {}) {
      fixture = nextFixture
      fixtureDelayMs = delayMs
      fixtureStatus = status
      await setViewport(width, height)
      const navigationUrl = new URL(baseUrl)
      navigationUrl.searchParams.set('run', String(Date.now()))
      navigationUrl.hash = '#/orderList'
      await send('Page.navigate', { url: navigationUrl.toString() })
      await waitForValue(() => evaluate('document.readyState === "complete" && Boolean(document.querySelector("#app"))'))
      await waitForValue(() => evaluate('Boolean(document.querySelector(".order-list-page"))'))
      await waitForValue(() => evaluate(waitForTerminal
        ? 'Boolean(document.querySelector(".order-list-items, .order-list-empty, .order-list-error"))'
        : 'Boolean(document.querySelector(".order-list-loading"))'))
      await wait(150)
    }

    const layoutProbe = `(() => {
      const cards = [...document.querySelectorAll('.order-card')].map((card) => {
        const title = card.querySelector('.order-card__title')
        const badge = card.querySelector('.order-card__badge--corner')
        const titleRect = title.getBoundingClientRect()
        const badgeRect = badge.getBoundingClientRect()
        const cardRect = card.getBoundingClientRect()
        const page = document.querySelector('.order-list-page__refresh')
        return {
          status: badge.textContent.trim(),
          badgeColor: getComputedStyle(badge).backgroundColor,
          product: title.textContent.trim(),
          amount: card.querySelector('.order-card__amount').textContent.trim(),
          date: card.querySelector('.order-card__date').textContent.trim(),
          action: card.querySelector('.order-card__action').textContent.trim(),
          titleRight: Math.round(titleRect.right),
          badgeLeft: Math.round(badgeRect.left),
          overflowRight: Math.round(cardRect.right) > Math.round(page.getBoundingClientRect().right),
        }
      })
      const pageRect = document.querySelector('.order-list-page__refresh').getBoundingClientRect()
      return {
        cards,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        scrollContainers: [...document.querySelectorAll('.order-list-page, .order-list-page__refresh')].length,
        pageWidth: Math.round(pageRect.width),
      }
    })()`

    fixture = response(allStatusOrders())
    await openOrderList(fixture, { delayMs: 3000, waitForTerminal: false })
    results.loading = await evaluate(`(() => ({
      skeletonCount: document.querySelectorAll('.order-list-skeleton-card').length,
      hasFilter: Boolean(document.querySelector('.order-list-filters')),
      hasCard: Boolean(document.querySelector('.order-card')),
      hasEmpty: Boolean(document.querySelector('.order-list-empty')),
      hasError: Boolean(document.querySelector('.order-list-error')),
    }))()`)
    await screenshot('order-list-loading-375x812')
    assert.equal(results.loading.skeletonCount, 4)
    assert.equal(results.loading.hasFilter, false)
    assert.equal(results.loading.hasCard, false)
    assert.equal(results.loading.hasEmpty, false)
    assert.equal(results.loading.hasError, false)

    await waitForValue(() => evaluate('Boolean(document.querySelector(".order-list-items"))'))
    await wait(200)

    results.list = await evaluate(layoutProbe)
    results.list.filters = await evaluate(`(() => [...document.querySelectorAll('.order-list-filter')].map((button) => ({
      text: button.textContent.trim(),
      active: button.getAttribute('aria-pressed') === 'true',
    })))()`)
    await screenshot('order-list-list-375x812')

    assert.deepEqual(results.list.filters, [
      { text: 'Por pagar', active: true },
      { text: 'Revisión', active: false },
      { text: 'Historial', active: false },
    ])
    assert.deepEqual(results.list.cards.map((card) => card.status), ['Reembolsando', 'Atrasado'])
    assert.equal(results.list.horizontalOverflow, false)
    for (const card of results.list.cards) {
      assert.ok(card.titleRight <= card.badgeLeft + 1, `title overlaps badge: ${card.product}`)
      assert.equal(card.overflowRight, false)
    }
    assert.deepEqual(
      results.list.cards.map((card) => card.badgeColor),
      ['rgb(255, 124, 0)', 'rgb(246, 71, 5)'],
    )

    await evaluate(`document.querySelectorAll('.order-list-filter')[1].click()`)
    await wait(150)
    results.reviewing = await evaluate(layoutProbe)
    results.reviewing.filters = await evaluate(`(() => [...document.querySelectorAll('.order-list-filter')].map((button) => button.getAttribute('aria-pressed') === 'true'))()`)
    await screenshot('order-list-reviewing-375x812')
    assert.deepEqual(
      results.reviewing.cards.map((card) => card.status),
      ['Pendiente de aplicar', 'Revisando', 'Revisando', 'Aprobado', 'Rechazado', 'Desembolsando', 'Fracaso'],
    )
    assert.deepEqual(results.reviewing.filters, [false, true, false])
    assert.deepEqual(
      results.reviewing.cards.map((card) => card.badgeColor),
      [
        'rgb(255, 188, 65)',
        'rgb(241, 37, 168)',
        'rgb(241, 37, 168)',
        'rgb(4, 202, 28)',
        'rgb(246, 71, 5)',
        'rgb(21, 93, 252)',
        'rgb(246, 71, 5)',
      ],
    )
    for (const card of results.reviewing.cards) {
      assert.ok(card.titleRight <= card.badgeLeft + 1, `title overlaps badge: ${card.product}`)
    }

    await evaluate(`document.querySelectorAll('.order-list-filter')[2].click()`)
    await wait(150)
    results.history = await evaluate(layoutProbe)
    await screenshot('order-list-history-375x812')
    assert.deepEqual(results.history.cards.map((card) => card.status), ['Completado', 'Completado'])
    assert.deepEqual(
      results.history.cards.map((card) => [card.amount, card.date]),
      [['S/ 1500', '2025-11-20'], ['S/ 1500', '2025-11-20']],
    )

    await evaluate(`document.querySelectorAll('.order-list-filter')[0].click()`)
    await wait(150)
    results.backToPending = await evaluate(layoutProbe)
    assert.deepEqual(results.backToPending.cards.map((card) => card.status), ['Reembolsando', 'Atrasado'])

    results.overdue = results.backToPending.cards[1]
    results.overdueStyle = await evaluate(`(() => {
      const card = document.querySelectorAll('.order-card')[1]
      const action = card.querySelector('.order-card__action')
      const date = card.querySelector('.order-card__date')
      return {
        actionBackground: getComputedStyle(action).backgroundImage,
        dateBackground: getComputedStyle(date).backgroundColor,
        dateColor: getComputedStyle(date).color,
        titleWeight: getComputedStyle(card.querySelector('.order-card__title')).fontWeight,
      }
    })()`)
    assert.match(results.overdueStyle.actionBackground, /linear-gradient/)
    assert.equal(results.overdueStyle.dateBackground, 'rgb(255, 238, 238)')
    assert.equal(results.overdueStyle.dateColor, 'rgb(231, 0, 11)')
    assert.equal(results.overdueStyle.titleWeight, '500')

    await setViewport(360, 800)
    await wait(200)
    results.narrow = await evaluate(layoutProbe)
    await screenshot('order-list-list-360x800')
    assert.equal(results.narrow.horizontalOverflow, false)
    for (const card of results.narrow.cards) {
      assert.ok(card.titleRight <= card.badgeLeft + 1, `title overlaps badge: ${card.product}`)
      assert.equal(card.overflowRight, false)
    }

    await openOrderList(response([]))
    results.empty = await evaluate(`(() => ({
      hasFilter: Boolean(document.querySelector('.order-list-filters')),
      hasEmpty: Boolean(document.querySelector('.order-list-empty')),
      message: document.querySelector('.order-list-empty__text')?.textContent.trim() ?? '',
      action: document.querySelector('.order-list-empty__action')?.textContent.trim() ?? '',
    }))()`)
    await screenshot('order-list-empty-375x812')
    assert.equal(results.empty.hasFilter, false)
    assert.equal(results.empty.hasEmpty, true)
    assert.equal(results.empty.message, 'Ningún pedido de préstamo')
    assert.equal(results.empty.action, 'Aplicar ahora')

    await openOrderList(response([order('ORDER-10', 10)]))
    results.filteredEmpty = await evaluate(`(() => ({
      hasFilter: Boolean(document.querySelector('.order-list-filters')),
      hasEmpty: Boolean(document.querySelector('.order-list-empty')),
      hasError: Boolean(document.querySelector('.order-list-error')),
    }))()`)
    await screenshot('order-list-filtered-empty-375x812')
    assert.equal(results.filteredEmpty.hasFilter, true)
    assert.equal(results.filteredEmpty.hasEmpty, true)
    assert.equal(results.filteredEmpty.hasError, false)

    await openOrderList(response('not-an-array'))
    results.error = await evaluate(`(() => ({
      hasError: Boolean(document.querySelector('.order-list-error')),
      hasEmpty: Boolean(document.querySelector('.order-list-empty')),
      text: document.querySelector('.order-list-error p')?.textContent.trim() ?? '',
    }))()`)
    await screenshot('order-list-error-375x812')
    assert.equal(results.error.hasError, true)
    assert.equal(results.error.hasEmpty, false)
    assert.equal(results.error.text, 'error')

    await openOrderList(response(allStatusOrders()))
    const requestsBeforeRefresh = requestLog.filter((entry) => entry.includes(ORDER_LIST_PATH)).length
    fixture = response([order('ORDER-90', 90)])
    await evaluate(`(() => {
      const page = document.querySelector('.order-list-page__refresh')
      const touch = (y) => [{ x: 187, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }]
      page.scrollTop = 0
      return true
    })()`)
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 187, y: 120, radiusX: 4, radiusY: 4, force: 1, id: 1 }] })
    for (const y of [150, 190, 230, 270, 310]) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 187, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }] })
      await wait(30)
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await wait(150)
    results.refreshing = await evaluate(`(() => ({
      hasSkeleton: Boolean(document.querySelector('.order-list-skeleton-card')),
      hasCard: Boolean(document.querySelector('.order-card')),
      refreshing: Boolean(document.querySelector('.van-pull-refresh__head')),
    }))()`)
    await screenshot('order-list-refresh-375x812')
    await waitForValue(() => evaluate('document.querySelectorAll(".order-card").length === 1'))
    await wait(200)
    results.refreshed = await evaluate(layoutProbe)
    const requestsAfterRefresh = requestLog.filter((entry) => entry.includes(ORDER_LIST_PATH)).length
    assert.equal(results.refreshing.hasSkeleton, false)
    assert.equal(results.refreshing.hasCard, true)
    assert.equal(requestsAfterRefresh, requestsBeforeRefresh + 1)
    assert.deepEqual(results.refreshed.cards.map((card) => card.status), ['Atrasado'])
    await screenshot('order-list-refreshed-375x812')

    await evaluate(`(() => {
      const app = window.__orderListNavigation ?? (window.__orderListNavigation = { push: [], replace: [] })
      return true
    })()`)
    await openOrderList(response([order('ORDER-80', 80)]))
    await evaluate(`document.querySelector('.order-card__action').click()`)
    await waitForHash('orderDetail')
    results.navigation = await evaluate(`(() => ({
      hash: location.hash,
      orderDetailPage: Boolean(document.querySelector('.order-detail-page')),
    }))()`)
    assert.match(results.navigation.hash, /orderDetail\?orderId=ORDER-80/)

    await openOrderList(response([order('ORDER-10', 10)]))
    await evaluate(`document.querySelectorAll('.order-list-filter')[1].click()`)
    await waitForValue(() => evaluate(`Boolean(document.querySelector('.order-card__action'))`))
    await evaluate(`document.querySelector('.order-card__action').click()`)
    await waitForHash('/home')
    results.homeNavigation = await evaluate(`location.hash`)
    assert.match(results.homeNavigation, /#\/home/)

    await openOrderList(response([]))
    await evaluate(`document.querySelector('.order-list-empty__action').click()`)
    await waitForHash('/home')
    results.emptyNavigation = await evaluate(`location.hash`)
    assert.match(results.emptyNavigation, /#\/home/)

    results.requestLog = requestLog
    results.browserErrors = browserErrors
    assert.equal(browserErrors.length, 0)
    assert.ok(requestLog.some((entry) => entry === `POST ${ORDER_LIST_PATH}`))
    assert.ok(requestLog.every((entry) => entry.startsWith('POST ')))
    assert.ok(requestLog.every((entry) => !entry.includes('?')))

    await writeFile(path.join(outputDirectory, 'browser-check.json'), JSON.stringify(results, null, 2))
    process.stdout.write(`${JSON.stringify({ status: 'passed', outputDirectory, requests: requestLog.length }, null, 2)}\n`)
  } finally {
    client.close()
    browserProcess.kill()
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
})
