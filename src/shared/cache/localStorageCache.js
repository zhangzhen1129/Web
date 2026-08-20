const APPLICATION_PREFIX = 'DineroPro:'
const KEY_SEGMENT_PATTERN = /^[a-z]+(?:-[a-z]+)*$/

function resolveStorage() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function createStorageKey(logicalKey) {
  if (typeof logicalKey !== 'string') {
    return null
  }

  const segments = logicalKey.split(':')
  if (segments.length !== 2 || !segments.every((segment) => KEY_SEGMENT_PATTERN.test(segment))) {
    return null
  }

  return `${APPLICATION_PREFIX}${logicalKey}`
}

function createFeaturePrefix(feature) {
  if (typeof feature !== 'string' || !KEY_SEGMENT_PATTERN.test(feature)) {
    return null
  }

  return `${APPLICATION_PREFIX}${feature}:`
}

function stringifyEnvelope(envelope) {
  return JSON.stringify(envelope, (_property, item) => {
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') {
      throw new TypeError('Cache value is not JSON serializable')
    }

    if (typeof item === 'number' && !Number.isFinite(item)) {
      throw new TypeError('Cache value is not JSON serializable')
    }

    return item
  })
}

function isValidEnvelope(envelope) {
  if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return false
  }

  if (!Object.keys(envelope).every((property) => property === 'version' || property === 'value' || property === 'expiresAt')) {
    return false
  }

  if (!Object.hasOwn(envelope, 'version') || !Object.hasOwn(envelope, 'value') || !isPositiveInteger(envelope.version)) {
    return false
  }

  if (Object.hasOwn(envelope, 'expiresAt') && (!Number.isSafeInteger(envelope.expiresAt) || envelope.expiresAt <= 0)) {
    return false
  }

  return true
}

function discard(storage, storageKey) {
  try {
    storage.removeItem(storageKey)
  } catch {
    // Invalid cache entries must not interrupt the caller's recovery path.
  }
}

export function set(key, value, options) {
  const storageKey = createStorageKey(key)
  if (!storageKey || !options || !isPositiveInteger(options.version)) {
    return false
  }

  const hasTtl = Object.hasOwn(options, 'ttlMs')
  if (hasTtl && !isPositiveInteger(options.ttlMs)) {
    return false
  }

  try {
    const envelope = { version: options.version, value }
    if (hasTtl) {
      const expiresAt = Date.now() + options.ttlMs
      if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
        return false
      }
      envelope.expiresAt = expiresAt
    }

    const serialized = stringifyEnvelope(envelope)
    const storage = resolveStorage()
    if (!storage) {
      return false
    }
    storage.setItem(storageKey, serialized)
    return true
  } catch {
    return false
  }
}

export function get(key, fallback, options) {
  const storageKey = createStorageKey(key)
  if (!storageKey || !options || !isPositiveInteger(options.version)) {
    return fallback
  }

  const storage = resolveStorage()
  if (!storage) {
    return fallback
  }

  try {
    const serialized = storage.getItem(storageKey)
    if (serialized === null) {
      return fallback
    }

    const envelope = JSON.parse(serialized)
    if (!isValidEnvelope(envelope) || envelope.version !== options.version || (Object.hasOwn(envelope, 'expiresAt') && Date.now() >= envelope.expiresAt)) {
      discard(storage, storageKey)
      return fallback
    }

    return envelope.value
  } catch {
    discard(storage, storageKey)
    return fallback
  }
}

export function remove(key) {
  const storageKey = createStorageKey(key)
  if (!storageKey) {
    return false
  }

  const storage = resolveStorage()
  if (!storage) {
    return false
  }

  try {
    storage.removeItem(storageKey)
    return true
  } catch {
    return false
  }
}

function clearByPrefix(prefix) {
  const storage = resolveStorage()
  if (!storage) {
    return false
  }

  try {
    const matchingKeys = []
    for (let index = 0; index < storage.length; index += 1) {
      const storageKey = storage.key(index)
      if (storageKey?.startsWith(prefix)) {
        matchingKeys.push(storageKey)
      }
    }

    matchingKeys.forEach((storageKey) => storage.removeItem(storageKey))
    return true
  } catch {
    return false
  }
}

export function clearFeature(feature) {
  const prefix = createFeaturePrefix(feature)
  return prefix ? clearByPrefix(prefix) : false
}

export function clearAll() {
  return clearByPrefix(APPLICATION_PREFIX)
}
