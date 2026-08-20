import assert from 'node:assert/strict'
import test from 'node:test'
import { clearAll, clearFeature, get, remove, set } from './localStorageCache.js'

class MemoryStorage {
  #entries = new Map()

  get length() {
    return this.#entries.size
  }

  key(index) {
    return [...this.#entries.keys()][index] ?? null
  }

  getItem(key) {
    return this.#entries.has(key) ? this.#entries.get(key) : null
  }

  setItem(key, value) {
    this.#entries.set(key, String(value))
  }

  removeItem(key) {
    this.#entries.delete(key)
  }
}

function useStorage(storage) {
  globalThis.window = { localStorage: storage }
}

function cacheKey(logicalKey) {
  return `DineroPro:${logicalKey}`
}

test.afterEach(() => {
  delete globalThis.window
})

test('writes and reads JSON values without changing their value', () => {
  useStorage(new MemoryStorage())
  const values = ['text', 42, true, null, ['one', 2], { label: 'value', nested: { ready: true } }]

  values.forEach((value, index) => {
    const key = `feature:item-${['text', 'number', 'boolean', 'null', 'array', 'object'][index]}`
    assert.equal(set(key, value, { version: 1 }), true)
    assert.deepEqual(get(key, 'fallback', { version: 1 }), value)
  })
})

test('returns fallback and discards missing, malformed, and invalid envelope entries', () => {
  const storage = new MemoryStorage()
  useStorage(storage)

  assert.equal(get('feature:missing', 'fallback', { version: 1 }), 'fallback')

  storage.setItem(cacheKey('feature:broken-json'), '{')
  assert.equal(get('feature:broken-json', 'fallback', { version: 1 }), 'fallback')
  assert.equal(storage.getItem(cacheKey('feature:broken-json')), null)

  storage.setItem(cacheKey('feature:broken-envelope'), JSON.stringify({ version: 1 }))
  assert.equal(get('feature:broken-envelope', 'fallback', { version: 1 }), 'fallback')
  assert.equal(storage.getItem(cacheKey('feature:broken-envelope')), null)
})

test('invalidates data when the schema version changes and permits a replacement value', () => {
  const storage = new MemoryStorage()
  useStorage(storage)

  assert.equal(set('feature:profile', { version: 'old' }, { version: 1 }), true)
  assert.equal(get('feature:profile', 'fallback', { version: 2 }), 'fallback')
  assert.equal(storage.getItem(cacheKey('feature:profile')), null)
  assert.equal(set('feature:profile', { version: 'new' }, { version: 2 }), true)
  assert.deepEqual(get('feature:profile', 'fallback', { version: 2 }), { version: 'new' })
})

test('applies TTL only when explicitly configured', () => {
  const storage = new MemoryStorage()
  useStorage(storage)
  const originalNow = Date.now
  let now = 1_000
  Date.now = () => now

  try {
    assert.equal(set('feature:permanent', 'saved', { version: 1 }), true)
    assert.equal(set('feature:temporary', 'saved', { version: 1, ttlMs: 500 }), true)
    assert.equal(Object.hasOwn(JSON.parse(storage.getItem(cacheKey('feature:permanent'))), 'expiresAt'), false)
    assert.equal(JSON.parse(storage.getItem(cacheKey('feature:temporary'))).expiresAt, 1_500)
    now = 1_499
    assert.equal(get('feature:permanent', 'fallback', { version: 1 }), 'saved')
    assert.equal(get('feature:temporary', 'fallback', { version: 1 }), 'saved')
    now = 1_500
    assert.equal(get('feature:permanent', 'fallback', { version: 1 }), 'saved')
    assert.equal(get('feature:temporary', 'fallback', { version: 1 }), 'fallback')
    assert.equal(storage.getItem(cacheKey('feature:temporary')), null)
  } finally {
    Date.now = originalNow
  }
})

test('removes only requested application and feature keys', () => {
  const storage = new MemoryStorage()
  useStorage(storage)
  ;[
    ['feature:current', 'current'],
    ['feature:other', 'other'],
    ['second:current', 'second'],
  ].forEach(([key, value]) => assert.equal(set(key, value, { version: 1 }), true))
  storage.setItem('other-application:feature:current', 'untouched')

  assert.equal(remove('feature:current'), true)
  assert.equal(remove('feature:current'), true)
  assert.equal(storage.getItem(cacheKey('feature:current')), null)
  assert.equal(storage.getItem(cacheKey('feature:other')), '{"version":1,"value":"other"}')

  assert.equal(clearFeature('feature'), true)
  assert.equal(clearFeature('feature'), true)
  assert.equal(storage.getItem(cacheKey('feature:other')), null)
  assert.notEqual(storage.getItem(cacheKey('second:current')), null)
  assert.equal(storage.getItem('other-application:feature:current'), 'untouched')

  assert.equal(clearAll(), true)
  assert.equal(clearAll(), true)
  assert.equal(storage.getItem(cacheKey('second:current')), null)
  assert.equal(storage.getItem('other-application:feature:current'), 'untouched')
})

test('contains storage, serialization, and quota failures within the cache boundary', () => {
  const accessDenied = {}
  Object.defineProperty(accessDenied, 'localStorage', {
    get() {
      throw new Error('access denied')
    },
  })
  globalThis.window = accessDenied
  assert.equal(get('feature:entry', 'fallback', { version: 1 }), 'fallback')
  assert.equal(set('feature:entry', 'value', { version: 1 }), false)
  assert.equal(remove('feature:entry'), false)
  assert.equal(clearFeature('feature'), false)
  assert.equal(clearAll(), false)

  const storage = new MemoryStorage()
  storage.setItem = () => {
    throw new Error('quota exceeded')
  }
  useStorage(storage)
  assert.equal(set('feature:entry', 'value', { version: 1 }), false)

  const serializableStorage = new MemoryStorage()
  useStorage(serializableStorage)
  assert.equal(set('feature:entry', { invalid: () => {} }, { version: 1 }), false)
  assert.equal(set('feature:entry', Symbol('invalid'), { version: 1 }), false)
  const circularValue = {}
  circularValue.self = circularValue
  assert.equal(set('feature:entry', circularValue, { version: 1 }), false)

  serializableStorage.getItem = () => {
    throw new Error('read denied')
  }
  serializableStorage.removeItem = () => {
    throw new Error('remove denied')
  }
  assert.equal(get('feature:entry', 'fallback', { version: 1 }), 'fallback')
  assert.equal(remove('feature:entry'), false)
})

test('rejects invalid logical keys and cache options without touching storage', () => {
  const storage = new MemoryStorage()
  useStorage(storage)

  assert.equal(set('Feature:entry', 'value', { version: 1 }), false)
  assert.equal(set('feature:entry', 'value', { version: 0 }), false)
  assert.equal(set('feature:entry', 'value', { version: 1, ttlMs: 0 }), false)
  assert.equal(get('feature:entry:extra', 'fallback', { version: 1 }), 'fallback')
  assert.equal(clearFeature('Feature'), false)
  assert.equal(storage.length, 0)
})
