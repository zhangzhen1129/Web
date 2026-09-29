import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

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
  const port = 11300 + Math.floor(Math.random() * 300)
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

  return { send, close: () => socket.close() }
}

async function main() {
  const baseUrl = readArgument('--base-url', 'http://127.0.0.1:4173/')
  const browserExecutable = readArgument('--browser', DEFAULT_BROWSER)
  const outputArgument = readArgument('--output-dir')
  if (!outputArgument) throw new Error('Missing --output-dir')

  const outputDirectory = path.resolve(outputArgument)
  await mkdir(outputDirectory, { recursive: true })
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'help-center-browser-'))
  const screenshots = []
  const results = { baseUrl, browserExecutable, scenarios: {}, screenshots: [] }
  let browserProcess
  let client
  let sessionId

  try {
    const debuggerConnection = await connectDebugger(browserExecutable, profileDirectory)
    browserProcess = debuggerConnection.browserProcess
    client = await createProtocolClient(debuggerConnection.webSocketUrl)
    const target = await client.send('Target.createTarget', { url: 'about:blank' })
    const attached = await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
    await client.send('Target.activateTarget', { targetId: target.targetId })
    sessionId = attached.sessionId
    const send = (method, params = {}) => client.send(method, params, sessionId)
    await send('Emulation.setFocusEmulationEnabled', { enabled: true })

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__helpCenterCheck = { errors: [] };
        window.addEventListener('error', (event) => window.__helpCenterCheck.errors.push(String(event.message || 'error')));
        window.addEventListener('unhandledrejection', (event) => window.__helpCenterCheck.errors.push(String(event.reason || 'unhandledrejection')));`,
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
      await send('Emulation.setEmulatedMedia', { features: [] })
    }

    function routeUrl(hash) {
      const url = new URL(baseUrl)
      url.hash = hash
      return url.toString()
    }

    async function navigate(hash, width = 375, height = 812) {
      await setViewport(width, height)
      await send('Page.navigate', { url: routeUrl(hash) })
      await waitForExpression(`document.readyState === 'complete'`)
    }

    async function openHelpCenterFromHome(width = 375, height = 812) {
      await navigate('#/home', width, height)
      await evaluate(`location.hash = '#/helpCenter'`)
      await waitForExpression(`Boolean(document.querySelector('.help-center-page'))`)
      await wait(100)
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
    async function clickTwice(selector) {
      const clicked = await evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)})
        if (!element) return false
        element.click()
        element.click()
        return true
      })()`)
      assert.equal(clicked, true, `Missing element: ${selector}`)
    }


    async function pressEnterAt(index) {
      const focused = await evaluate(`(() => {
        const element = document.querySelectorAll('.help-center-faq__trigger')[${index}]
        if (!element) return false
        element.focus()
        return document.activeElement === element
      })()`)
      assert.equal(focused, true, `Unable to focus FAQ trigger at index: ${index}`)
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
    }

    async function snapshotPage() {
      return evaluate(`(() => {
        const page = document.querySelector('.help-center-page')
        const cards = [...document.querySelectorAll('.help-center-info__card')]
        const triggers = [...document.querySelectorAll('.help-center-faq__trigger')]
        const answers = [...document.querySelectorAll('.help-center-faq__answer')]
        const chevron = document.querySelector('.help-center-faq__chevron')
        return {
          hash: location.hash,
          title: document.querySelector('.help-center-header h1')?.textContent?.trim() || '',
          infoCards: cards.length,
          faqCount: triggers.length,
          expanded: triggers.map((trigger) => trigger.getAttribute('aria-expanded')),
          answerHidden: answers.map((answer) => answer.getAttribute('aria-hidden')),
          workHours: cards[0]?.textContent?.trim() || '',
          email: cards[1]?.textContent?.trim() || '',
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          pageClientHeight: page?.clientHeight || 0,
          pageScrollHeight: page?.scrollHeight || 0,
          chevronTransform: chevron ? getComputedStyle(chevron).transform : '',
        }
      })()`)
    }

    await openHelpCenterFromHome()
    const initial = await snapshotPage()
    assert.deepEqual(initial.expanded, ['false', 'false', 'false', 'false', 'false', 'false'])
    assert.equal(initial.infoCards, 2)
    assert.equal(initial.faqCount, 6)
    assert.equal(initial.title, 'Servicio al cliente')
    assert.match(initial.workHours, /De lunes a viernes/)
    assert.match(initial.workHours, /9\.00 a 19\.00 horas/)
    assert.equal(initial.email, 'my@data.com')
    assert.equal(initial.horizontalOverflow, false)
    await screenshot('help-center-initial-375x812')
    results.scenarios.initial = initial

    await click('.help-center-faq__trigger')
    await wait(80)
    await screenshot('help-center-transition-375x812')
    await wait(360)
    const expanded = await snapshotPage()
    assert.equal(expanded.expanded[0], 'true')
    assert.equal(expanded.answerHidden[0], 'false')
    assert.match(expanded.chevronTransform, /matrix/)
    await screenshot('help-center-expanded-375x812')
    results.scenarios.expanded = expanded

    await click('.help-center-faq__item:nth-of-type(1) .help-center-faq__trigger')
    await wait(80)
    await click('.help-center-faq__item:nth-of-type(1) .help-center-faq__trigger')
    await wait(360)
    const reverseMidAnimation = await snapshotPage()
    assert.equal(reverseMidAnimation.expanded[0], 'true')
    results.scenarios.reverseMidAnimation = reverseMidAnimation

    await click('.help-center-faq__item:nth-of-type(2) .help-center-faq__trigger')
    await wait(360)
    const independent = await snapshotPage()
    assert.equal(independent.expanded[0], 'true')
    assert.equal(independent.expanded[1], 'true')
    await click('.help-center-faq__item:nth-of-type(1) .help-center-faq__trigger')
    await wait(360)
    const independentAfterCollapse = await snapshotPage()
    assert.equal(independentAfterCollapse.expanded[0], 'false')
    assert.equal(independentAfterCollapse.expanded[1], 'true')
    results.scenarios.independent = independentAfterCollapse

    for (let index = 0; index < 5; index += 1) {
      await click('.help-center-faq__item:nth-of-type(3) .help-center-faq__trigger')
      await wait(20)
    }
    await wait(500)
    const rapidClicks = await snapshotPage()
    assert.equal(rapidClicks.expanded[2], 'true')
    results.scenarios.rapidClicks = rapidClicks

    await pressEnterAt(4)
    await wait(360)
    const keyboard = await snapshotPage()
    assert.equal(keyboard.expanded[4], 'true')
    results.scenarios.keyboard = keyboard

    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await click('.help-center-faq__item:nth-of-type(6) .help-center-faq__trigger')
    const reducedMotionDuration = await evaluate(`getComputedStyle(document.querySelector('.help-center-faq__answer')).transitionDuration`)
    await wait(20)
    const reducedMotion = await snapshotPage()
    assert.equal(reducedMotion.expanded[5], 'true')
    assert.match(reducedMotionDuration, /0\.001s|0s/)
    results.scenarios.reducedMotion = { duration: reducedMotionDuration, state: reducedMotion }

    await openHelpCenterFromHome(360, 800)
    const nonBaseViewport = await snapshotPage()
    assert.equal(nonBaseViewport.horizontalOverflow, false)
    await screenshot('help-center-initial-360x800')
    results.scenarios.nonBaseViewport = nonBaseViewport

    await navigate('#/helpCenter?extra=1')
    await waitForExpression(`Boolean(document.querySelector('.help-center-page'))`)
    const extraQuery = await snapshotPage()
    assert.equal(extraQuery.hash, '#/helpCenter?extra=1')
    assert.equal(extraQuery.infoCards, 2)
    assert.equal(extraQuery.faqCount, 6)
    results.scenarios.extraQuery = extraQuery

    await openHelpCenterFromHome()
    await clickTwice('.help-center-header__back')
    await waitForExpression(`location.hash === '#/home'`)
    results.scenarios.historyBack = { hash: await evaluate('location.hash') }

    await navigate('#/helpCenter')
    await waitForExpression(`Boolean(document.querySelector('.help-center-page'))`)
    await clickTwice('.help-center-header__back')
    await waitForExpression(`location.hash === '#/home'`)
    results.scenarios.noHistoryBack = { hash: await evaluate('location.hash') }
    results.errors = await evaluate('window.__helpCenterCheck.errors')
    assert.deepEqual(results.errors, [])
    results.screenshots = screenshots
    await writeFile(path.join(outputDirectory, 'browser-check.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({ ok: true, screenshots, scenarios: Object.keys(results.scenarios) }, null, 2))
  } finally {
    client?.close()
    await stopBrowser(browserProcess)
    await rm(profileDirectory, { recursive: true, force: true }).catch(() => {})
  }
}

await main()
