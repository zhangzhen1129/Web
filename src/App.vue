<script setup>
import { onBeforeUnmount, onMounted } from 'vue'

let safeAreaTimer

onMounted(() => {
  if (!import.meta.env.DEV) return

  safeAreaTimer = window.setTimeout(() => {
    const probe = document.querySelector('.safe-area-probe')
    const topInset = probe ? getComputedStyle(probe).paddingTop : 'unavailable'
    if (topInset !== 'unavailable' && Number.parseFloat(topInset) > 0) {
      document.documentElement.style.setProperty('--app-safe-area-top', topInset)
    }
    console.log('[safe-area] top inset', {
      topInset,
      effectiveTopInset: getComputedStyle(document.documentElement).getPropertyValue('--app-safe-area-top').trim(),
    })
  }, 1200)
})

onBeforeUnmount(() => {
  if (safeAreaTimer) window.clearTimeout(safeAreaTimer)
})

import MainTabShell from './features/shell/MainTabShell.vue'

function handleAppWheel(event) {
  if (event.deltaY === 0) return

  const scrollContainer = event.currentTarget
  const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? scrollContainer.clientHeight
      : 1
  const scrollTop = scrollContainer.scrollTop
  const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight
  const nextScrollTop = Math.min(maxScrollTop, Math.max(0, scrollTop + event.deltaY * multiplier))

  if (nextScrollTop === scrollTop) return
  scrollContainer.scrollTop = nextScrollTop
  event.preventDefault()
}
</script>

<template>
  <div class="app" @wheel="handleAppWheel">
    <div class="safe-area-probe" aria-hidden="true"></div>
    <MainTabShell />
  </div>
</template>
