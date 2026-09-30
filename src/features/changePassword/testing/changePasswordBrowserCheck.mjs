import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const DEFAULT_BASE_URL = 'http://127.0.0.1:4173/'
const UPDATE_PASSWORD_PATH = '/eRM/YUIT/OSFMH2lEUWYSTH'
const API_HOST = 'https://fixtures.invalid'
const API_HOST_CACHE_KEY = 'DineroPro:global:api-host'
const MOBILE_CACHE_KEY = 'DineroPro:global:mobile'
const MOBILE_VALUE = 'redacted-mobile'
const OLD_PASSWORD = 'o'.repeat(8)
const PASSWORD_5 = 'p'.repeat(5)
const PASSWORD_6 = 'p'.repeat(6)
const PASSWORD_16 = 'p'.repeat(16)
const PASSWORD_17 = 'p'.repeat(17)
const MISMATCH_PASSWORD = 'm'.repeat(7)
const PUBLIC_NETWORK_FAILURE = 'Unable to complete the network request.'
const MISMATCH_MESSAGE = 'Las dos contraseñas son incoherentes'
const SUCCESS_MESSAGE = 'Éxito'
const BUSINESS_FAILURE_MESSAGE = 'Controlled business failure'
const SUCCESS_RESPONSE = Object.freeze({
  cyiUgNvO2EPltj: { atY3WWbXIN: 2000 },
  pl9xRlV: '',
  nl3H3VULXxvbt: { yjDnG: 'redacted-token' },
  hvdBeTYSwEKmok: { exMykk: 'redacted-user' },
})
const BUSINESS_FAILURE_RESPONSE = Object.freeze({
  cyiUgNvO2EPltj: { atY3WWbXIN: 1001 },
  pl9xRlV: 'Controlled business failure',
})

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
    await wait(80)
  }
  throw new Error('Timed out while waiting for browser state.')
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
}function buildInjectionSource() {
  return `(() => {
    const check = window.__changePasswordCheck = {
      events: [],
      errors: 0,
      toastAppearances: 0,
    };
    const toastElements = new WeakSet();
    const record = (type, detail = {}) => {
      check.events.push({ type, at: performance.now(), detail });
    };
    window.addEventListener('error', () => { check.errors += 1; });
    window.addEventListener('unhandledrejection', () => { check.errors += 1; });
    window.addEventListener('hashchange', () => {
      record('navigation', { hash: location.hash.slice(0, 80) });
    });

    const bridge = window.plahub = window.plahub || {};
    bridge.showLoading = () => {
      record('loading:show');
      return JSON.stringify({ action: 'showLoading', status: 'success', message: 'ok' });
    };
    bridge.hideLoading = () => {
      record('loading:hide');
      return JSON.stringify({ action: 'hideLoading', status: 'success', message: 'ok' });
    };
    bridge.handlePersistentCache = (payload) => {
      let config;
      try {
        config = JSON.parse(payload);
      } catch {
        record('native:invalid');
        return JSON.stringify({ action: 'persistent_cache_handle', requestId: '', status: 'error', message: 'invalid' });
      }

      const knownKeys = { Token: 'token', UserId: 'userId', LoginPhoneNumber: 'mobile' };
      const key = knownKeys[config.cacheKey] || 'unknown';
      const operation = config.operation === 'get' || config.operation === 'set' ? config.operation : 'unknown';
      record('native:' + operation, {
        key,
        valueLength: typeof config.cacheValue === 'string' ? config.cacheValue.length : 0,
      });

      const reply = {
        action: 'persistent_cache_handle',
        requestId: String(config.requestId || ''),
        operation,
        cacheKey: String(config.cacheKey || ''),
        status: 'completed',
        message: 'ok',
        cacheValue: '',
        hit: false,
        storagePolicy: 'persistent',
        expiresAtMillis: 0,
      };
      window.setTimeout(() => {
        try {
          const pathText = String(config.replyHandler || '');
          const callback = pathText.split('.').slice(1).reduce((value, property) => value && value[property], window);
          if (typeof callback === 'function') callback(reply);
        } catch {}
      }, 0);

      return JSON.stringify({
        action: 'persistent_cache_handle',
        requestId: String(config.requestId || ''),
        status: 'accepted',
        message: 'accepted',
      });
    };

    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItemPatched(key, value) {
      const keyText = String(key);
      if (keyText === 'DineroPro:global:token') record('global:set', { key: 'token' });
      if (keyText === 'DineroPro:global:user-id') record('global:set', { key: 'userId' });
      return originalSetItem.call(this, keyText, value);
    };

    const trackToast = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
      const toast = node.matches('.van-toast') ? node : node.querySelector('.van-toast');
      if (!toast || toastElements.has(toast)) return;
      toastElements.add(toast);
      check.toastAppearances += 1;
      record('toast');
    };
    const observer = new MutationObserver((records) => {
      records.forEach((mutation) => mutation.addedNodes.forEach(trackToast));
    });
    const observeDocument = () => {
      if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.documentElement) observeDocument();
    else window.addEventListener('DOMContentLoaded', observeDocument, { once: true });
  })();`
}

function eventLabels(events) {
  return events
    .map((event) => {
      if (event.type === 'global:set') return `global:set:${event.detail?.key || 'unknown'}`
      if (event.type === 'native:set') return `native:set:${event.detail?.key || 'unknown'}`
      return event.type
    })
    .filter((label) => [
      'loading:show',
      'loading:hide',
      'request:start',
      'request:fulfilled',
      'global:set:token',
      'global:set:userId',
      'native:set:token',
      'native:set:userId',
      'toast',
    ].includes(label))
}

function countLabel(labels, label) {
  return labels.filter((value) => value === label).length
}

function safeFailure(error) {
  return { name: typeof error?.name === 'string' ? error.name : 'Error' }
}async function main() {
  const baseUrl = readArgument('--base-url', DEFAULT_BASE_URL)
  const browserExecutable = readArgument('--browser', DEFAULT_BROWSER)
  const outputArgument = readArgument('--output-dir')
  if (!outputArgument) throw new Error('Missing --output-dir.')

  const outputDirectory = path.resolve(outputArgument)
  await mkdir(outputDirectory, { recursive: true })
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'change-password-browser-'))
  const report = { status: 'running', scenarios: {}, requestCounts: {}, screenshots: [], errors: [] }

  let browserProcess
  let client
  let evaluate = async () => false
  let currentMode = 'success'
  let requestCount = 0
  let totalRequestCount = 0
  let pendingRequest = null
  let requestFulfilledAt = 0

  try {
    const debuggerConnection = await connectDebugger(browserExecutable, profileDirectory)
    browserProcess = debuggerConnection.browserProcess
    client = await createProtocolClient(debuggerConnection.webSocketUrl)
    const target = await client.send('Target.createTarget', { url: 'about:blank' })
    const attached = await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
    await client.send('Target.activateTarget', { targetId: target.targetId })
    const sessionId = attached.sessionId
    const send = (method, params = {}) => client.send(method, params, sessionId)

    const recordPageEvent = async (type, detail = {}) => {
      try {
        await send('Runtime.evaluate', {
          expression: `(() => {
            const check = window.__changePasswordCheck;
            if (!check) return false;
            check.events.push({
              type: ${JSON.stringify(type)},
              at: performance.now(),
              detail: ${JSON.stringify(detail)},
            });
            return true;
          })()`,
          returnByValue: true,
        })
      } catch {}
    }

    const corsHeaders = [
      { name: 'Access-Control-Allow-Origin', value: '*' },
      { name: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
      { name: 'Access-Control-Allow-Headers', value: '*' },
      { name: 'Content-Type', value: 'application/json' },
    ]

    const buildResponseBody = (mode) => Buffer.from(JSON.stringify(
      mode === 'business' ? BUSINESS_FAILURE_RESPONSE : SUCCESS_RESPONSE,
    ), 'utf8').toString('base64')

    const fulfillPendingRequest = async (mode = 'success') => {
      if (!pendingRequest) return false
      const requestId = pendingRequest
      pendingRequest = null
      requestFulfilledAt = Date.now()
      await recordPageEvent('request:fulfilled')
      try {
        await client.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: corsHeaders,
          body: buildResponseBody(mode),
        }, sessionId)
        return true
      } catch {
        return false
      }
    }

    client.on('Fetch.requestPaused', async (params, eventSessionId) => {
      if (eventSessionId !== sessionId) return
      let requestUrl
      try {
        requestUrl = new URL(params.request.url)
      } catch {
        await client.send('Fetch.continueRequest', { requestId: params.requestId }, sessionId).catch(() => {})
        return
      }
      if (requestUrl.pathname !== UPDATE_PASSWORD_PATH) {
        await client.send('Fetch.continueRequest', { requestId: params.requestId }, sessionId).catch(() => {})
        return
      }

      try {
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
        await recordPageEvent('request:start', { method: params.request.method })

        if (currentMode === 'request') {
          await wait(100)
          await recordPageEvent('request:failed')
          await client.send('Fetch.failRequest', {
            requestId: params.requestId,
            errorReason: 'Failed',
          }, sessionId)
          return
        }

        if (currentMode === 'delayed') {
          pendingRequest = params.requestId
          return
        }

        await wait(100)
        requestFulfilledAt = Date.now()
        await recordPageEvent('request:fulfilled')
        await client.send('Fetch.fulfillRequest', {
          requestId: params.requestId,
          responseCode: 200,
          responseHeaders: corsHeaders,
          body: buildResponseBody(currentMode),
        }, sessionId)
      } catch {
        report.fetchError = 'controlled request handling failed'
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

    evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
      if (result.exceptionDetails) throw new Error('Browser evaluation failed.')
      return result.result.value
    }

    const waitForExpression = (expression, timeoutMs = 15000) => waitForValue(
      () => evaluate(expression),
      timeoutMs,
    )

    const resetCheck = async () => {
      requestCount = 0
      pendingRequest = null
      await evaluate(`(() => {
        const check = window.__changePasswordCheck;
        if (!check) return false;
        check.events = [];
        check.errors = 0;
        check.toastAppearances = 0;
        return true;
      })()`)
    }

    const seedStorage = async (mobileValue) => {
      await evaluate(`(() => {
        const write = (key, value) => localStorage.setItem(key, JSON.stringify({ version: 1, value }));
        write(${JSON.stringify(API_HOST_CACHE_KEY)}, ${JSON.stringify(API_HOST)});
        const mobileValue = ${JSON.stringify(mobileValue)};
        if (mobileValue === null) localStorage.removeItem(${JSON.stringify(MOBILE_CACHE_KEY)});
        else write(${JSON.stringify(MOBILE_CACHE_KEY)}, mobileValue);
        return true;
      })()`)
    }

    const openPage = async (mode, mobileValue) => {
      currentMode = mode
      await evaluate("location.hash = '#/home'")
      await waitForExpression("!document.querySelector('.change-password-page')")
      await seedStorage(mobileValue)
      await evaluate("location.hash = '#/retrievePassword'")
      await send('Page.reload', { ignoreCache: true })
      await waitForExpression("Boolean(document.querySelector('.change-password-page'))")
      await waitForExpression("Boolean(document.querySelector('.change-password-submit'))")
      await wait(140)
      await resetCheck()
    }
    const setInput = async (selector, value) => {
      const changed = await evaluate(`(() => {
        const input = document.querySelector(${JSON.stringify(selector)});
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`)
      assert.equal(changed, true)
      await wait(20)
    }

    const clickSelector = async (selector) => {
      const clicked = await evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return false;
        element.click();
        return true;
      })()`)
      assert.equal(clicked, true)
    }

    const clickVisibilityFor = async (inputSelector) => {
      const clicked = await evaluate(`(() => {
        const input = document.querySelector(${JSON.stringify(inputSelector)});
        const button = input?.closest('.change-password-control')?.querySelector('.change-password-control__visibility');
        if (!button) return false;
        button.click();
        return true;
      })()`)
      assert.equal(clicked, true)
      await wait(20)
    }

    const fillValidForm = async () => {
      await setInput('#change-password-old', OLD_PASSWORD)
      await setInput('#change-password-new', PASSWORD_6)
      await setInput('#change-password-confirm', PASSWORD_6)
    }

    const readFormState = async (expectedMobile) => {
      const expected = expectedMobile === null ? '' : expectedMobile
      return evaluate(`(() => {
        const mobile = document.querySelector('.change-password-control__readonly-value');
        const mobileText = mobile?.textContent.trim() || '';
        const submit = document.querySelector('.change-password-submit');
        const oldInput = document.querySelector('#change-password-old');
        const newInput = document.querySelector('#change-password-new');
        const confirmInput = document.querySelector('#change-password-confirm');
        const images = Array.from(document.querySelectorAll(
          '.change-password-header__back img, .change-password-control__visibility img',
        ));
        return {
          route: location.hash,
          mobileEmpty: ${JSON.stringify(expected)}.length === 0 && mobileText !== ${JSON.stringify(expected)},
          mobileMatchesExpected: mobileText === ${JSON.stringify(expected)},
          mobileTextLength: mobileText.length,
          submitDisabled: Boolean(submit?.disabled),
          submitEnabled: Boolean(submit && !submit.disabled),
          oldType: oldInput?.type || '',
          oldVisibilityCount: oldInput?.closest('.change-password-control')?.querySelectorAll('.change-password-control__visibility').length ?? -1,
          newType: newInput?.type || '',
          confirmType: confirmInput?.type || '',
          newLength: newInput?.value.length ?? -1,
          confirmLength: confirmInput?.value.length ?? -1,
          visualAssetCount: images.length,
          visualAssetLoadFailures: images.filter((image) => !image.complete || image.naturalWidth <= 0).length,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      })()`)
    }

    const readToastState = async (expectedText = '') => evaluate(`(() => {
      const toast = document.querySelector('.van-toast');
      const text = toast?.textContent.trim() || '';
      return {
        toastAppearances: window.__changePasswordCheck?.toastAppearances || 0,
        toastVisible: Boolean(toast),
        toastTextLength: text.length,
        toastMatchesExpectedText: ${JSON.stringify(expectedText)} ? text === ${JSON.stringify(expectedText)} : false,
      };
    })()`)

    const readEvents = async () => evaluate('window.__changePasswordCheck?.events || []')

    const maskSensitiveVisuals = async () => {
      await evaluate(`(() => {
        const mobile = document.querySelector('.change-password-control__readonly-value');
        if (mobile) {
          mobile.style.color = 'transparent';
          mobile.style.background = '#d8d8d8';
          mobile.style.borderRadius = '4px';
          mobile.style.textShadow = 'none';
        }
        document.querySelectorAll('.change-password-control__input').forEach((input) => {
          input.style.filter = 'blur(4px)';
        });
        return true;
      })()`)
    }

    const screenshot = async (name, options = {}) => {
      await evaluate("(() => { const panel = document.querySelector('#__vconsole'); if (panel) panel.style.display = 'none'; return true; })()")
      if (options.maskSensitive !== false) await maskSensitiveVisuals()
      const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile(path.join(outputDirectory, `${name}.png`), Buffer.from(result.data, 'base64'))
      report.screenshots.push(`${name}.png`)
    }
    const appUrl = new URL(baseUrl)
    if (!appUrl.searchParams.has('apiHost')) appUrl.searchParams.set('apiHost', API_HOST)
    appUrl.hash = '/home'
    await send('Page.navigate', { url: appUrl.toString() })
    await waitForExpression("Boolean(document.querySelector('.app'))")
    await wait(120)

    await openPage('success', null)
    await screenshot('change-password-empty-375x812', { maskSensitive: false })
    await fillValidForm()
    let snapshot = await readFormState(null)
    assert.equal(snapshot.mobileEmpty, true)
    assert.equal(snapshot.submitDisabled, true)
    report.scenarios.mobileEmptyDisabled = snapshot

    await openPage('success', MOBILE_VALUE)
    snapshot = await readFormState(MOBILE_VALUE)
    assert.equal(snapshot.mobileMatchesExpected, true)
    assert.equal(snapshot.visualAssetCount, 3)
    assert.equal(snapshot.visualAssetLoadFailures, 0)
    report.scenarios.mobileHydrated = snapshot

    await setInput('#change-password-old', OLD_PASSWORD)
    const boundaryCases = []
    const boundaryFixtures = [
      { name: 'empty', next: '', confirm: '', expectedEnabled: false },
      { name: 'length-5', next: PASSWORD_5, confirm: PASSWORD_5, expectedEnabled: false },
      { name: 'length-6', next: PASSWORD_6, confirm: PASSWORD_6, expectedEnabled: true },
      { name: 'length-16', next: PASSWORD_16, confirm: PASSWORD_16, expectedEnabled: true },
      { name: 'length-17', next: PASSWORD_17, confirm: PASSWORD_17, expectedEnabled: false },
      { name: 'confirm-17', next: PASSWORD_6, confirm: PASSWORD_17, expectedEnabled: false },
    ]
    for (const fixture of boundaryFixtures) {
      await setInput('#change-password-new', fixture.next)
      await setInput('#change-password-confirm', fixture.confirm)
      snapshot = await readFormState(MOBILE_VALUE)
      assert.equal(snapshot.submitEnabled, fixture.expectedEnabled)
      boundaryCases.push({
        name: fixture.name,
        newLength: snapshot.newLength,
        confirmLength: snapshot.confirmLength,
        submitEnabled: snapshot.submitEnabled,
      })
    }
    report.scenarios.lengthBoundaries = boundaryCases

    await openPage('success', MOBILE_VALUE)
    await fillValidForm()
    snapshot = await readFormState(MOBILE_VALUE)
    assert.equal(snapshot.oldType, 'text')
    assert.equal(snapshot.oldVisibilityCount, 0)
    assert.equal(snapshot.newType, 'password')
    assert.equal(snapshot.confirmType, 'password')
    await clickVisibilityFor('#change-password-new')
    let visibilityState = await readFormState(MOBILE_VALUE)
    assert.equal(visibilityState.newType, 'text')
    assert.equal(visibilityState.confirmType, 'password')
    await clickVisibilityFor('#change-password-confirm')
    visibilityState = await readFormState(MOBILE_VALUE)
    assert.equal(visibilityState.newType, 'text')
    assert.equal(visibilityState.confirmType, 'text')
    await clickVisibilityFor('#change-password-new')
    visibilityState = await readFormState(MOBILE_VALUE)
    assert.equal(visibilityState.newType, 'password')
    assert.equal(visibilityState.confirmType, 'text')
    report.scenarios.passwordVisibility = {
      originalVisibilityButtonCount: snapshot.oldVisibilityCount,
      originalType: snapshot.oldType,
      finalNewType: visibilityState.newType,
      finalConfirmType: visibilityState.confirmType,
      independent: true,
    }

    await openPage('success', MOBILE_VALUE)
    await setInput('#change-password-old', OLD_PASSWORD)
    await setInput('#change-password-new', PASSWORD_6)
    await setInput('#change-password-confirm', MISMATCH_PASSWORD)
    requestCount = 0
    await clickSelector('.change-password-submit')
    await waitForValue(async () => (await readToastState()).toastAppearances === 1)
    let toastState = await readToastState(MISMATCH_MESSAGE)
    snapshot = await readFormState(MOBILE_VALUE)
    assert.equal(requestCount, 0)
    assert.equal(toastState.toastVisible, true)
    assert.equal(toastState.toastAppearances, 1)
    assert.equal(toastState.toastMatchesExpectedText, true)
    let labels = eventLabels(await readEvents())
    assert.equal(countLabel(labels, 'loading:show'), 0)
    assert.equal(snapshot.route, '#/retrievePassword')
    report.scenarios.mismatch = {
      route: snapshot.route,
      requestCount,
      toastAppearances: toastState.toastAppearances,
      toastVisible: toastState.toastVisible,
      loadingShowCount: countLabel(labels, 'loading:show'),
    }
    await openPage('success', MOBILE_VALUE)
    await fillValidForm()
    requestCount = 0
    await clickSelector('.change-password-submit')
    await waitForValue(() => Promise.resolve(requestCount === 1))
    await wait(250)
    assert.equal(await evaluate('location.hash'), '#/retrievePassword')
    await waitForExpression("location.hash === '#/home'", 5000)
    const successObservedAt = Date.now()
    toastState = await readToastState(SUCCESS_MESSAGE)
    const successEvents = await readEvents()
    labels = eventLabels(successEvents)
    const expectedSuccessLabels = [
      'loading:show',
      'request:start',
      'request:fulfilled',
      'global:set:token',
      'global:set:userId',
      'native:set:token',
      'native:set:userId',
      'loading:hide',
      'toast',
    ]
    const relevantSuccessLabels = labels.slice(0, expectedSuccessLabels.length)
    report.scenarios.success = {
      route: await evaluate('location.hash'),
      requestCount,
      loadingShowCount: countLabel(relevantSuccessLabels, 'loading:show'),
      loadingHideCount: countLabel(relevantSuccessLabels, 'loading:hide'),
      globalSetKeys: successEvents.filter((event) => event.type === 'global:set').map((event) => event.detail?.key || 'unknown'),
      nativeSetKeys: successEvents.filter((event) => event.type === 'native:set').map((event) => event.detail?.key || 'unknown'),
      nativeSetValueLengths: successEvents
        .filter((event) => event.type === 'native:set')
        .map((event) => event.detail?.valueLength || 0),
      toastAppearances: toastState.toastAppearances,
      toastVisible: toastState.toastVisible,
      order: relevantSuccessLabels,
      returnDelayMs: successObservedAt - requestFulfilledAt,
    }
    assert.deepEqual(relevantSuccessLabels, expectedSuccessLabels)
    assert.equal(toastState.toastAppearances, 1)
    assert.equal(toastState.toastVisible, true)
    assert.equal(toastState.toastMatchesExpectedText, true)
    assert.equal(countLabel(relevantSuccessLabels, 'loading:show'), 1)
    assert.equal(countLabel(relevantSuccessLabels, 'loading:hide'), 1)
    assert.equal(countLabel(relevantSuccessLabels, 'native:set:token'), 1)
    assert.equal(countLabel(relevantSuccessLabels, 'native:set:userId'), 1)
    assert.ok(successObservedAt - requestFulfilledAt >= 700)

    await openPage('business', MOBILE_VALUE)
    await fillValidForm()
    requestCount = 0
    await clickSelector('.change-password-submit')
    await waitForValue(async () => (await readToastState()).toastAppearances === 1)
    await wait(120)
    snapshot = await readFormState(MOBILE_VALUE)
    toastState = await readToastState(BUSINESS_FAILURE_MESSAGE)
    labels = eventLabels(await readEvents())
    assert.equal(snapshot.route, '#/retrievePassword')
    assert.equal(requestCount, 1)
    assert.equal(toastState.toastVisible, true)
    assert.equal(toastState.toastAppearances, 1)
    assert.equal(toastState.toastMatchesExpectedText, true)
    assert.equal(countLabel(labels, 'loading:hide'), 1)
    assert.equal(countLabel(labels, 'native:set:token'), 0)
    assert.equal(countLabel(labels, 'native:set:userId'), 0)
    assert.equal(countLabel(labels, 'navigation'), 0)
    report.scenarios.businessFailure = {
      route: snapshot.route,
      requestCount,
      loadingHideCount: countLabel(labels, 'loading:hide'),
      toastAppearances: toastState.toastAppearances,
      toastVisible: toastState.toastVisible,
      stayedOnPage: true,
    }

    await openPage('request', MOBILE_VALUE)
    await fillValidForm()
    requestCount = 0
    await clickSelector('.change-password-submit')
    await waitForValue(async () => (await readToastState()).toastAppearances === 1)
    await wait(120)
    snapshot = await readFormState(MOBILE_VALUE)
    toastState = await readToastState(PUBLIC_NETWORK_FAILURE)
    labels = eventLabels(await readEvents())
    assert.equal(snapshot.route, '#/retrievePassword')
    assert.equal(requestCount, 1)
    assert.equal(toastState.toastVisible, true)
    assert.equal(toastState.toastAppearances, 1)
    assert.equal(toastState.toastMatchesExpectedText, true)
    assert.equal(countLabel(labels, 'loading:hide'), 1)
    assert.equal(countLabel(labels, 'navigation'), 0)
    report.scenarios.requestFailure = {
      route: snapshot.route,
      requestCount,
      loadingHideCount: countLabel(labels, 'loading:hide'),
      toastAppearances: toastState.toastAppearances,
      toastVisible: toastState.toastVisible,
      publicNormalizedToast: toastState.toastMatchesExpectedText,
      stayedOnPage: true,
    }
    await openPage('delayed', MOBILE_VALUE)
    await fillValidForm()
    requestCount = 0
    await clickSelector('.change-password-submit')
    await waitForValue(() => Promise.resolve(requestCount === 1))
    await waitForValue(async () => countLabel(eventLabels(await readEvents()), 'loading:show') === 1)
    await wait(120)
    await clickSelector('.change-password-header__back')
    await waitForExpression("location.hash === '#/home'", 5000)
    await wait(100)
    const pageLabels = eventLabels(await readEvents()).filter((label) => label.startsWith('loading:')).slice(0, 2)
    assert.deepEqual(pageLabels, ['loading:show', 'loading:hide'])
    const eventsAtLeave = await readEvents()
    const lateReleaseAccepted = await fulfillPendingRequest('success')
    await wait(260)
    const eventsAfterLateRelease = await readEvents()
    const lateLabels = eventLabels(eventsAfterLateRelease.slice(eventsAtLeave.length))
    assert.equal(await evaluate('location.hash'), '#/home')
    assert.equal(requestCount, 1)
    assert.equal(countLabel(lateLabels, 'loading:hide'), 0)
    assert.equal(countLabel(lateLabels, 'native:set:token'), 0)
    assert.equal(countLabel(lateLabels, 'native:set:userId'), 0)
    assert.equal(countLabel(lateLabels, 'toast'), 0)
    report.scenarios.leavingDuringDelayedRequest = {
      routeAfterLeave: '#/home',
      requestCount,
      loadingShowCount: countLabel(pageLabels, 'loading:show'),
      loadingHideCount: countLabel(pageLabels, 'loading:hide'),
      nativeTokenSetCount: countLabel(lateLabels, 'native:set:token'),
      nativeUserIdSetCount: countLabel(lateLabels, 'native:set:userId'),
      toastCount: countLabel(lateLabels, 'toast'),
      lateReleaseAccepted,
      lateEffectsIgnored: true,
    }

    await openPage('success', MOBILE_VALUE)
    await fillValidForm()
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 1,
      mobile: true,
    })
    await wait(120)
    let visualState = await readFormState(MOBILE_VALUE)
    assert.equal(visualState.visualAssetCount, 3)
    assert.equal(visualState.visualAssetLoadFailures, 0)
    assert.equal(visualState.horizontalOverflow, false)
    await screenshot('change-password-375x812')
    report.scenarios.viewport375 = visualState

    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 420,
      deviceScaleFactor: 1,
      mobile: true,
    })
    await wait(120)
    const keyboardState = await evaluate(`(() => {
      const page = document.querySelector('.change-password-page');
      const submit = document.querySelector('.change-password-submit');
      if (!page || !submit) return null;
      page.scrollTop = page.scrollHeight;
      const rect = submit.getBoundingClientRect();
      return {
        scrollable: page.scrollHeight > page.clientHeight,
        submitReachable: rect.bottom <= window.innerHeight + 1,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    })()`)
    assert.equal(keyboardState.scrollable, true)
    assert.equal(keyboardState.submitReachable, true)
    assert.equal(keyboardState.horizontalOverflow, false)
    report.scenarios.keyboardViewport = keyboardState

    await send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 800,
      deviceScaleFactor: 1,
      mobile: true,
    })
    await wait(120)
    visualState = await readFormState(MOBILE_VALUE)
    assert.equal(visualState.visualAssetCount, 3)
    assert.equal(visualState.visualAssetLoadFailures, 0)
    assert.equal(visualState.horizontalOverflow, false)
    await screenshot('change-password-360x800')
    report.scenarios.viewport360 = visualState

    const runtimeErrors = await evaluate('window.__changePasswordCheck?.errors || 0')
    assert.equal(runtimeErrors, 0)
    report.errors = [runtimeErrors]
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'
    report.failure = safeFailure(error)
    throw error
  } finally {
    report.requestCounts = { total: totalRequestCount }
    try {
      await writeFile(path.join(outputDirectory, 'browser-check.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    } catch {}
    client?.close()
    await stopBrowser(browserProcess)
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {})
  }
}

await main().catch((error) => {
  process.stderr.write(`Change password browser verification failed: ${safeFailure(error).name}\n`)
  process.exitCode = 1
})