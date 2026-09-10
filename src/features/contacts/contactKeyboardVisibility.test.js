import assert from 'node:assert/strict'
import test from 'node:test'
import { createContactKeyboardVisibility } from './contactKeyboardVisibility.js'

function createHarness() {
  const frames = new Map()
  const timers = new Map()
  let sequence = 0
  const absoluteTargetTop = 900
  const scrollElement = {
    clientHeight: 812,
    scrollTop: 0,
    contains: (element) => element === target,
    getBoundingClientRect: () => ({ top: 0, bottom: 812 }),
  }
  const target = {
    getBoundingClientRect: () => ({
      top: absoluteTargetTop - scrollElement.scrollTop,
      bottom: absoluteTargetTop - scrollElement.scrollTop + 56,
    }),
  }
  const visibility = createContactKeyboardVisibility({
    getScrollElement: () => scrollElement,
    requestFrame(callback) { sequence += 1; frames.set(sequence, callback); return sequence },
    cancelFrame(id) { frames.delete(id) },
    setTimer(callback) { sequence += 1; timers.set(sequence, callback); return sequence },
    clearTimer(id) { timers.delete(id) },
  })
  return { frames, scrollElement, target, timers, visibility }
}

test('moves a focused contact name near the top without keyboard geometry', () => {
  const harness = createHarness()
  harness.visibility.focus(harness.target)
  assert.equal(harness.frames.size, 1)
  assert.equal(harness.timers.size, 2)

  const frame = [...harness.frames.values()][0]
  harness.frames.clear()
  frame()
  assert.equal(harness.scrollElement.scrollTop, 740)

  const settled = [...harness.timers.values()]
  harness.timers.clear()
  settled.forEach((callback) => callback())
  assert.equal(harness.scrollElement.scrollTop, 740)
})

test('cancels pending focus work on blur and dispose', () => {
  const harness = createHarness()
  harness.visibility.focus(harness.target)
  harness.visibility.blur(harness.target)
  assert.equal(harness.frames.size, 0)
  assert.equal(harness.timers.size, 0)
  assert.equal(harness.scrollElement.scrollTop, 0)

  harness.visibility.focus(harness.target)
  harness.visibility.dispose()
  assert.equal(harness.frames.size, 0)
  assert.equal(harness.timers.size, 0)
})
