<script setup>
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
    <MainTabShell />
  </div>
</template>
