const SETTLE_DELAYS_MS = Object.freeze([320, 700])
const MIN_TARGET_TOP_PX = 24
const MAX_TARGET_TOP_PX = 160
const TARGET_TOP_RATIO = 0.2

function targetTopFor(scrollElement) {
  return Math.min(
    MAX_TARGET_TOP_PX,
    Math.max(MIN_TARGET_TOP_PX, scrollElement.clientHeight * TARGET_TOP_RATIO),
  )
}

export function createContactKeyboardVisibility({
  getScrollElement = () => document.querySelector('.app'),
  requestFrame = (callback) => window.requestAnimationFrame(callback),
  cancelFrame = (frameId) => window.cancelAnimationFrame(frameId),
  setTimer = (callback, delay) => window.setTimeout(callback, delay),
  clearTimer = (timerId) => window.clearTimeout(timerId),
} = {}) {
  let activeElement = null
  let frameId = null
  const timerIds = new Set()
  let disposed = false

  function clearPending() {
    if (frameId !== null) cancelFrame(frameId)
    frameId = null
    timerIds.forEach(clearTimer)
    timerIds.clear()
  }

  function reveal() {
    if (disposed || !activeElement) return
    const scrollElement = getScrollElement()
    if (
      !scrollElement
      || !scrollElement.contains(activeElement)
      || typeof scrollElement.getBoundingClientRect !== 'function'
      || typeof activeElement.getBoundingClientRect !== 'function'
    ) return

    const scrollRect = scrollElement.getBoundingClientRect()
    const activeRect = activeElement.getBoundingClientRect()
    const nextScrollTop = scrollElement.scrollTop
      + activeRect.top
      - scrollRect.top
      - targetTopFor(scrollElement)
    scrollElement.scrollTop = Math.max(0, nextScrollTop)
  }

  function schedule(target) {
    if (disposed || !target) return
    clearPending()
    activeElement = target
    frameId = requestFrame(() => {
      frameId = null
      reveal()
    })
    SETTLE_DELAYS_MS.forEach((delay) => {
      const timerId = setTimer(() => {
        timerIds.delete(timerId)
        reveal()
      }, delay)
      timerIds.add(timerId)
    })
  }

  return Object.freeze({
    focus: schedule,
    blur(target) {
      if (target !== activeElement) return
      activeElement = null
      clearPending()
    },
    dispose() {
      if (disposed) return
      disposed = true
      activeElement = null
      clearPending()
    },
  })
}
