import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const DEFAULT_BASE_URL = 'http://127.0.0.1:4173/'
const PROFILE_PATH = '/eBw/IEsD/ywzs'
const API_HOST = 'https://fixtures.invalid'

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

async function stopBrowser(browserProcess) {
  if (!browserProcess || browserProcess.exitCode !== null) return
  if (process.platform === 'win32' && browserProcess.pid) {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(browserProcess.pid), '/t', '/f'], { stdio: 'ignore' })
      killer.once('exit', resolve)
      killer.once('error', resolve)
    })
    return
  }
  browserProcess.kill()
  await Promise.race([
    new Promise((resolve) => browserProcess.once('exit', resolve)),
    wait(2000),
  ])
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

function buildProfileResponse(mode) {
  const returnCode = mode === 'business' ? 1001 : 2000
  const response = {
    cyiUgNvO2EPltj: { atY3WWbXIN: returnCode },
    pl9xRlV: mode === 'business' ? 'Controlled business failure' : '',
    oi: '',
    mwQMMTLZBtRYyQO: '980****00',
    cr4J0NYuPYL7XNY2t0ON2: 0,
    anGXn8yIrcnlz1Ag5eq1E: 0,
    dkxogovrTwwH0vsK1Mts: 0,
  }
  if (mode !== 'invalid') response.mgIYwYHHpgHkDfsOas8 = { ray1gAyEuzj: mode === 'password1' ? 1 : 0 }
  return response
}

function buildInjectionSource() {
  return `(() => {
    const check = {
      physicalBackCalls: [],
      physicalBackEnabled: false,
      physicalBackRequestId: null,
      physicalBackCallback: '',
      logoutCalls: 0,
      clearedAtLogout: false,
      errors: [],
      settingsBridgeDiagnostics: [],
    };
    window.__settingsCheck = check;
    window.addEventListener('error', (event) => check.errors.push(String(event.message || 'error')));
    window.addEventListener('unhandledrejection', (event) => check.errors.push(String(event.reason || 'rejection')));
    window.addEventListener('dinero-pro:settings-bridge-diagnostic', (event) => {
      check.settingsBridgeDiagnostics.push({
        code: String(event.detail?.code || 'UNKNOWN'),
        capability: String(event.detail?.capability || 'unknown'),
      });
    });
    const bridge = window.plahub = window.plahub || {};
    bridge.setPhysicalBackInterceptConfig = (payload) => {
      const config = JSON.parse(payload);
      check.physicalBackCalls.push(config);
      check.physicalBackEnabled = config.enabled === true;
      check.physicalBackRequestId = config.enabled ? config.requestId : null;
      check.physicalBackCallback = config.enabled ? String(config.callbackPath || '') : '';
      return JSON.stringify({
        action: 'setPhysicalBackInterceptConfig',
        requestId: config.requestId,
        status: 'success',
        message: 'ok',
      });
    };
    bridge.logoutToOtpLogin = () => {
      check.logoutCalls += 1;
      const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
      check.clearedAtLogout = keys.every((key) => !String(key).startsWith('DineroPro:'));
      return true;
    };
    try {
      localStorage.setItem('DineroPro:global:token', JSON.stringify({ version: 1, value: 'redacted-token' }));
      localStorage.setItem('DineroPro:global:user-id', JSON.stringify({ version: 1, value: 'redacted-user' }));
      localStorage.setItem('DineroPro:global:mobile', JSON.stringify({ version: 1, value: 'redacted-mobile' }));
    } catch {}
  })();`
}

async function main() {
  const baseUrl = readArgument('--base-url', DEFAULT_BASE_URL)
  const browserExecutable = readArgument('--browser', DEFAULT_BROWSER)
  const outputArgument = readArgument('--output-dir')
  if (!outputArgument) throw new Error('Missing --output-dir')

  const outputDirectory = path.resolve(outputArgument)
  await mkdir(outputDirectory, { recursive: true })
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'settings-browser-'))
  const report = { status: 'running', scenarios: {}, requestCounts: {}, screenshots: [] }
  let browserProcess
  let client
  let profileMode = 'password0'
  let requestCount = 0
  let totalRequestCount = 0

  try {
    const debuggerConnection = await connectDebugger(browserExecutable, profileDirectory)
    browserProcess = debuggerConnection.browserProcess
    client = await createProtocolClient(debuggerConnection.webSocketUrl)
    const target = await client.send('Target.createTarget', { url: 'about:blank' })
    const attached = await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
    await client.send('Target.activateTarget', { targetId: target.targetId })
    const sessionId = attached.sessionId
    const send = (method, params = {}) => client.send(method, params, sessionId)

    client.on('Fetch.requestPaused', async (params, eventSessionId) => {
      if (eventSessionId !== sessionId) return
      try {
        if (!params.request.url.includes(PROFILE_PATH)) {
          await client.send('Fetch.continueRequest', { requestId: params.requestId }, sessionId)
          return
        }

        const corsHeaders = [
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
          { name: 'Access-Control-Allow-Headers', value: '*' },
        ]
        if (params.request.method === 'OPTIONS') {
          await client.send('Fetch.fulfillRequest', {
            requestId: params.requestId,
            responseCode: 204,
            responseHeaders: corsHeaders,
            body: '',
          }, sessionId)
          return
        }

        requestCount += 1
        totalRequestCount += 1
        if (profileMode === 'request') {
          await client.send('Fetch.failRequest', {
            requestId: params.requestId,
            errorReason: 'Failed',
          }, sessionId)
          return
        }

        const body = Buffer.from(JSON.stringify(buildProfileResponse(profileMode)), 'utf8').toString('base64')
        await client.send('Fetch.fulfillRequest', {
          requestId: params.requestId,
          responseCode: 200,
          responseHeaders: [...corsHeaders, { name: 'Content-Type', value: 'application/json' }],
          body,
        }, sessionId)
      } catch (error) {
        report.fetchError = String(error)
      }
    })

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
    await send('Page.addScriptToEvaluateOnNewDocument', { source: buildInjectionSource() })
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 1,
      mobile: true,
    })

    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Evaluation failed')
      return result.result.value
    }

    const waitForExpression = (expression, timeoutMs = 15000) => waitForValue(
      () => evaluate(expression),
      timeoutMs,
    )

    const screenshot = async (name) => {
      await evaluate("(() => { const panel = document.querySelector('#__vconsole'); if (panel) panel.style.display = 'none'; return true; })()")
      const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile(path.join(outputDirectory, `${name}.png`), Buffer.from(result.data, 'base64'))
      report.screenshots.push(`${name}.png`)
    }

    const click = async (selector) => {
      const clicked = await evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return false;
        element.click();
        return true;
      })()`)
      assert.equal(clicked, true, `Missing selector: ${selector}`)
    }

    const visibleExpression = (selector) => `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().height > 0;
    })()`

    const navigateHome = async () => {
      await evaluate("location.hash = '#/home'")
      await waitForExpression("location.hash === '#/home'")
      await waitForExpression("Boolean(document.querySelector('.app'))")
      await waitForExpression("!document.querySelector('.settings-page')")
      await wait(160)
    }

    const openSettings = async (mode) => {
      profileMode = mode
      requestCount = 0
      await navigateHome()
      await evaluate("location.hash = '#/settings'")
      await waitForExpression("Boolean(document.querySelector('.settings-page'))")
      try {
        await waitForExpression(
          mode === 'password1'
            ? "Boolean(document.querySelector('[data-action=\"change-password\"]'))"
            : "Boolean(document.querySelector('[data-action=\"create-password\"]'))",
        )
      } catch (error) {
        report.debug = await evaluate(`(() => ({
          mode: ${JSON.stringify(mode)},
          hash: location.hash,
          text: document.querySelector('.settings-page')?.textContent || '',
          createCount: document.querySelectorAll('[data-action="create-password"]').length,
          changeCount: document.querySelectorAll('[data-action="change-password"]').length,
          errors: window.__settingsCheck?.errors || [],
        }))()`)
        report.debug.requestCount = requestCount
        process.stderr.write(`DEBUG ${JSON.stringify(report.debug)}\n`)
        throw error
      }
      await wait(120)
    }

    const openAppUrl = new URL(baseUrl)
    if (!openAppUrl.searchParams.has('apiHost')) openAppUrl.searchParams.set('apiHost', API_HOST)
    openAppUrl.hash = '/home'
    await send('Page.navigate', { url: openAppUrl.toString() })
    await waitForExpression("Boolean(document.querySelector('.app'))")
    await wait(100)

    await openSettings('password0')
    let snapshot = await evaluate(`(() => ({
      createCount: document.querySelectorAll('[data-action="create-password"]').length,
      changeCount: document.querySelectorAll('[data-action="change-password"]').length,
      legalCount: document.querySelectorAll('[data-action="legal"]').length,
      logoutText: document.querySelector('[data-action="logout"]')?.textContent.trim() || '',
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }))()`)
    assert.deepEqual(snapshot, {
      createCount: 1,
      changeCount: 0,
      legalCount: 1,
      logoutText: 'Cerrar sesión',
      horizontalOverflow: false,
    })
    report.scenarios.password0 = { ...snapshot, requestCount }
    await screenshot('settings-password0-375x812')

    await click('[data-action="create-password"]')
    await waitForExpression("location.hash === '#/createPassword'")
    report.scenarios.createPasswordRoute = await evaluate('location.hash')
    await evaluate('history.back()')
    await waitForExpression("location.hash === '#/settings'")
    await waitForExpression("Boolean(document.querySelector('.settings-page'))")

    await openSettings('password1')
    snapshot = await evaluate(`(() => ({
      createCount: document.querySelectorAll('[data-action="create-password"]').length,
      changeCount: document.querySelectorAll('[data-action="change-password"]').length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }))()`)
    assert.deepEqual(snapshot, { createCount: 0, changeCount: 1, horizontalOverflow: false })
    report.scenarios.password1 = { ...snapshot, requestCount }
    await screenshot('settings-password1-375x812')

    await click('[data-action="change-password"]')
    await waitForExpression("location.hash === '#/retrievePassword'")
    report.scenarios.retrievePasswordRoute = await evaluate('location.hash')
    await evaluate('history.back()')
    await waitForExpression("location.hash === '#/settings'")
    await waitForExpression("Boolean(document.querySelector('.settings-page'))")

    await openSettings('business')
    snapshot = await evaluate(`(() => ({
      createCount: document.querySelectorAll('[data-action="create-password"]').length,
      changeCount: document.querySelectorAll('[data-action="change-password"]').length,
      toastVisible: Boolean(document.querySelector('.van-toast')),
    }))()`)
    assert.equal(snapshot.createCount, 1)
    assert.equal(snapshot.changeCount, 0)
    report.scenarios.businessFailure = { ...snapshot, requestCount }

    await openSettings('request')
    await waitForExpression("Boolean(document.querySelector('.van-toast'))")
    snapshot = await evaluate(`(() => ({
      createCount: document.querySelectorAll('[data-action="create-password"]').length,
      changeCount: document.querySelectorAll('[data-action="change-password"]').length,
      toastText: document.querySelector('.van-toast')?.textContent.trim() || '',
    }))()`)
    assert.equal(snapshot.createCount, 1)
    assert.equal(snapshot.changeCount, 0)
    assert.ok(snapshot.toastText.length > 0)
    report.scenarios.requestFailure = { ...snapshot, requestCount }
    await waitForValue(() => evaluate(`!${visibleExpression('.van-toast')}`), 6000)

    await openSettings('password0')
    await click('[data-action="legal"]')
    await waitForExpression(visibleExpression('.settings-dialog--protocol'))
    await wait(350)
    snapshot = await evaluate(`(() => ({
      text: document.querySelector('.settings-dialog--protocol')?.textContent || '',
      overlayColor: getComputedStyle(document.querySelector('.settings-popup-overlay')).backgroundColor,
      closeVisible: Boolean(document.querySelector('[data-action="close-protocol"]')),
      transitionDuration: getComputedStyle(document.querySelector('.settings-protocol-popup')).transitionDuration,
      transitionProperty: getComputedStyle(document.querySelector('.settings-protocol-popup')).transitionProperty,
    }))()`)
    assert.match(snapshot.text, /Condiciones del servicio/)
    assert.match(snapshot.text, /Política de privacidad/)
    assert.match(snapshot.overlayColor, /0, 0, 0, 0\.7/)
    assert.equal(snapshot.closeVisible, true)
    assert.notEqual(snapshot.transitionDuration, '0s')
    assert.match(snapshot.transitionProperty, /opacity|transform/)
    report.scenarios.protocolDialog = snapshot
    await screenshot('settings-protocol-375x812')

    await evaluate("document.querySelector('.settings-popup-overlay').click()")
    await waitForValue(() => evaluate(`!${visibleExpression('.settings-dialog--protocol')}`))
    assert.equal(await evaluate("location.hash === '#/settings'"), true)

    await click('[data-action="legal"]')
    await waitForExpression(visibleExpression('.settings-dialog--protocol'))
    await wait(350)
    await click('[data-action="close-protocol"]')
    await waitForValue(() => evaluate(`!${visibleExpression('.settings-dialog--protocol')}`))

    await click('[data-action="legal"]')
    await waitForExpression(visibleExpression('.settings-dialog--protocol'))
    await wait(350)
    await click('[data-action="terms"]')
    await waitForExpression("location.hash === '#/terms'")
    report.scenarios.termsRoute = await evaluate('location.hash')
    await evaluate('history.back()')
    await waitForExpression("location.hash === '#/settings'")
    await waitForExpression("Boolean(document.querySelector('.settings-page'))")

    await click('[data-action="legal"]')
    await waitForExpression(visibleExpression('.settings-dialog--protocol'))
    await wait(350)
    await click('[data-action="privacy"]')
    await waitForExpression("location.hash === '#/privacy'")
    report.scenarios.privacyRoute = await evaluate('location.hash')
    await evaluate('history.back()')
    await waitForExpression("location.hash === '#/settings'")
    await waitForExpression("Boolean(document.querySelector('.settings-page'))")

    await click('[data-action="logout"]')
    await waitForExpression(visibleExpression('.settings-dialog--logout'))
    await wait(350)
    snapshot = await evaluate(`(() => ({
      text: document.querySelector('.settings-dialog--logout')?.textContent || '',
      overlayColor: getComputedStyle(document.querySelector('.settings-popup-overlay')).backgroundColor,
      logoutCalls: window.__settingsCheck.logoutCalls,
      transitionDuration: getComputedStyle(document.querySelector('.settings-logout-popup')).transitionDuration,
      transitionProperty: getComputedStyle(document.querySelector('.settings-logout-popup')).transitionProperty,
      dialogRect: (() => {
        const rect = document.querySelector('.settings-dialog--logout')?.getBoundingClientRect();
        return rect ? { width: rect.width, left: rect.left } : null;
      })(),
    }))()`)
    assert.match(snapshot.text, /¿Está seguro de cerrar sesión\?/)
    assert.match(snapshot.text, /OK/)
    assert.match(snapshot.text, /Cancelar/)
    assert.match(snapshot.overlayColor, /0, 0, 0, 0\.7/)
    assert.equal(snapshot.logoutCalls, 0)
    assert.notEqual(snapshot.transitionDuration, '0s')
    assert.match(snapshot.transitionProperty, /opacity|transform/)
    assert.ok(Math.abs(snapshot.dialogRect.width - 328.846125) < 0.1)
    assert.ok(Math.abs(snapshot.dialogRect.left - 23.0769375) < 0.1)
    report.scenarios.logoutDialog = snapshot
    await screenshot('settings-logout-375x812')

    await click('[data-action="cancel-logout"]')
    await waitForValue(() => evaluate(`!${visibleExpression('.settings-dialog--logout')}`))
    assert.equal(await evaluate('window.__settingsCheck.logoutCalls'), 0)

    await click('[data-action="logout"]')
    await waitForExpression(visibleExpression('.settings-dialog--logout'))
    await wait(350)
    await evaluate("document.querySelector('.settings-popup-overlay').click()")
    await waitForValue(() => evaluate(`!${visibleExpression('.settings-dialog--logout')}`))
    assert.equal(await evaluate('window.__settingsCheck.logoutCalls'), 0)

    await openSettings('password0')
    await waitForExpression('window.__settingsCheck.physicalBackEnabled === true')
    const physicalBefore = await evaluate('window.__settingsCheck.physicalBackCalls.slice()')
    assert.equal(physicalBefore.at(-1).enabled, true)
    await evaluate(`(() => {
      const check = window.__settingsCheck;
      const pathText = check.physicalBackCallback;
      const callback = pathText.split('.').slice(1).reduce((value, key) => value && value[key], window);
      if (typeof callback !== 'function') return false;
      callback({
        action: 'physicalBackIntercepted',
        requestId: check.physicalBackRequestId,
        status: 'intercepted',
        message: 'ok',
      });
      return true;
    })()`)
    await waitForExpression("location.hash === '#/home'")
    await waitForExpression('window.__settingsCheck.physicalBackEnabled === false')
    report.scenarios.physicalBack = {
      hash: await evaluate('location.hash'),
      enabled: await evaluate('window.__settingsCheck.physicalBackEnabled'),
    }

    await openSettings('password0')
    await waitForExpression('window.__settingsCheck.physicalBackEnabled === true')
    await evaluate("location.hash = '#/home'")
    await waitForExpression("!document.querySelector('.settings-page')")
    await waitForExpression('window.__settingsCheck.physicalBackEnabled === false')
    report.scenarios.routeLeaveRelease = {
      hash: await evaluate('location.hash'),
      enabled: await evaluate('window.__settingsCheck.physicalBackEnabled'),
    }

    await openSettings('password0')
    await click('.settings-page__back')
    await waitForExpression("location.hash === '#/home'")
    await waitForExpression('window.__settingsCheck.physicalBackEnabled === false')
    report.scenarios.visibleBack = {
      hash: await evaluate('location.hash'),
      enabled: await evaluate('window.__settingsCheck.physicalBackEnabled'),
    }
    assert.equal(report.scenarios.visibleBack.hash, '#/home')
    assert.equal(report.scenarios.visibleBack.enabled, false)

    await openSettings('password0')
    await evaluate("history.replaceState({ ...history.state, back: null }, '', location.href)")
    await click('.settings-page__back')
    await waitForExpression("location.hash === '#/home'")
    report.scenarios.topBackWithoutHistory = { hash: await evaluate('location.hash') }
    assert.equal(report.scenarios.topBackWithoutHistory.hash, '#/home')

    await openSettings('password0')
    await click('[data-action="logout"]')
    await waitForExpression(visibleExpression('.settings-dialog--logout'))
    await evaluate(`(() => {
      const check = window.__settingsCheck;
      const pathText = check.physicalBackCallback;
      const callback = pathText.split('.').slice(1).reduce((value, key) => value && value[key], window);
      if (typeof callback !== 'function') return false;
      callback({
        action: 'physicalBackIntercepted',
        requestId: check.physicalBackRequestId,
        status: 'intercepted',
        message: 'ok',
      });
      return true;
    })()`)
    await waitForExpression("location.hash === '#/home'")
    await waitForExpression('window.__settingsCheck.physicalBackEnabled === false')
    report.scenarios.physicalBackWithDialog = {
      hash: await evaluate('location.hash'),
      dialogVisible: await evaluate(`${visibleExpression('.settings-dialog--logout')}`),
      enabled: await evaluate('window.__settingsCheck.physicalBackEnabled'),
    }
    assert.equal(report.scenarios.physicalBackWithDialog.hash, '#/home')
    assert.equal(report.scenarios.physicalBackWithDialog.dialogVisible, false)
    assert.equal(report.scenarios.physicalBackWithDialog.enabled, false)

    await openSettings('password0')
    await evaluate("location.hash = '#/home'")
    await waitForExpression("!document.querySelector('.settings-page')")
    await evaluate('window.plahub.setPhysicalBackInterceptConfig = undefined')
    await openSettings('password0')
    await waitForExpression("Boolean(document.querySelector('.settings-page'))")
    await click('.settings-page__back')
    await waitForExpression("location.hash === '#/home'")
    report.scenarios.bridgeUnavailableTopBack = {
      hash: await evaluate('location.hash'),
      diagnostics: await evaluate('window.__settingsCheck.settingsBridgeDiagnostics.slice()'),
    }
    assert.equal(report.scenarios.bridgeUnavailableTopBack.hash, '#/home')
    assert.equal(report.scenarios.bridgeUnavailableTopBack.diagnostics.at(-1).code, 'BRIDGE_UNAVAILABLE')
    await evaluate(`window.plahub.setPhysicalBackInterceptConfig = (payload) => {
      const config = JSON.parse(payload);
      const check = window.__settingsCheck;
      check.physicalBackCalls.push(config);
      check.physicalBackEnabled = config.enabled === true;
      check.physicalBackRequestId = config.enabled ? config.requestId : null;
      check.physicalBackCallback = config.enabled ? String(config.callbackPath || '') : '';
      return JSON.stringify({ action: 'setPhysicalBackInterceptConfig', requestId: config.requestId, status: 'success', message: 'ok' });
    }`)

    await openSettings('password0')
    await click('[data-action="logout"]')
    await waitForExpression(visibleExpression('.settings-dialog--logout'))
    await wait(350)
    await click('[data-action="confirm-logout"]')
    await waitForValue(() => evaluate('window.__settingsCheck.logoutCalls === 1'))
    await waitForValue(() => evaluate(`!${visibleExpression('.settings-dialog--logout')}`))
    snapshot = await evaluate(`(() => ({
      logoutCalls: window.__settingsCheck.logoutCalls,
      clearedAtLogout: window.__settingsCheck.clearedAtLogout,
      dialogVisible: ${visibleExpression('.settings-dialog--logout')},
      remainingCacheKeys: Object.keys(localStorage).filter((key) => key.startsWith('DineroPro:')),
    }))()`)
    assert.deepEqual(snapshot, {
      logoutCalls: 1,
      clearedAtLogout: true,
      dialogVisible: false,
      remainingCacheKeys: [],
    })
    report.scenarios.logoutConfirmed = snapshot

    await send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 800,
      deviceScaleFactor: 1,
      mobile: true,
    })
    await openSettings('password0')
    snapshot = await evaluate(`(() => ({
      createCount: document.querySelectorAll('[data-action="create-password"]').length,
      changeCount: document.querySelectorAll('[data-action="change-password"]').length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      viewport: { width: innerWidth, height: innerHeight },
    }))()`)
    assert.deepEqual(snapshot, {
      createCount: 1,
      changeCount: 0,
      horizontalOverflow: false,
      viewport: { width: 360, height: 800 },
    })
    report.scenarios.compactViewport = snapshot
    await screenshot('settings-password0-360x800')

    const runtimeErrors = await evaluate('window.__settingsCheck.errors')
    assert.deepEqual(runtimeErrors, [])
    report.status = 'passed'
    report.requestCounts = { total: totalRequestCount }
    report.errors = runtimeErrors
    await writeFile(path.join(outputDirectory, 'browser-check.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } finally {
    client?.close()
    await stopBrowser(browserProcess)
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {})
  }
}

await main()









