<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HomeTabs from './features/home/components/HomeTabs.vue'
import { ROUTE_PATH } from './router/index.js'
import { appModeState, shouldShowRepaymentTab } from './features/shell/appModeStore.js'
import { hideNativeTabBar } from './features/shell/nativeTabBar.js'

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

const route = useRoute()
const router = useRouter()
const tabScrollPositions = new Map()

const tabDefinitions = computed(() => appModeState.homeTabs
  .filter((tab) => tab.enabled !== false && (tab.key !== 'repayment' || shouldShowRepaymentTab()))
  .map((tab) => ({ ...tab, routePath: tab.key === 'home' ? ROUTE_PATH.HOME : tab.key === 'repayment' ? ROUTE_PATH.REPAYMENT : ROUTE_PATH.MINE })))

const tabs = computed(() => tabDefinitions.value.map((tab) => ({
  ...tab,
  enabled: true,
  active: route.meta.tabKey === tab.key,
})))

const showMainTabs = computed(() => route.meta.showTab === true)

function replaceTab(tab) {
  if (!tab.enabled || tab.active) return
  saveCurrentTabScrollPosition()
  router.replace(tab.routePath)
  if (tab.routePath === ROUTE_PATH.HOME) {
    window.setTimeout(restoreHomeScrollPosition, 0)
    window.setTimeout(restoreHomeScrollPosition, 120)
  }
}

function saveCurrentTabScrollPosition() {
  if (route.path === ROUTE_PATH.HOME) tabScrollPositions.set(route.path, getPageScrollTop())
}

function getPageScrollTop() {
  return document.querySelector('.app')?.scrollTop ?? 0
}

function setPageScrollTop(scrollTop) {
  const scrollContainer = document.querySelector('.app')
  if (scrollContainer) scrollContainer.scrollTop = scrollTop
}

function restoreHomeScrollPosition() {
  const scrollTop = tabScrollPositions.get(ROUTE_PATH.HOME) ?? 0
  setPageScrollTop(scrollTop)
  nextTick(() => {
    if (route.path === ROUTE_PATH.HOME) setPageScrollTop(scrollTop)
    window.setTimeout(() => {
      if (route.path === ROUTE_PATH.HOME) setPageScrollTop(scrollTop)
    }, 120)
  })
}

function ensureRouteAllowed() {
  if (route.path === ROUTE_PATH.REPAYMENT && !shouldShowRepaymentTab(appModeState.mode)) router.replace(ROUTE_PATH.HOME)
}

onMounted(() => {
  hideNativeTabBar()
  ensureRouteAllowed()
})

watch(() => appModeState.mode, ensureRouteAllowed)
watch(() => route.path, ensureRouteAllowed)

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
    <RouterView />
    <HomeTabs v-if="showMainTabs" :tabs="tabs" @navigate="replaceTab" />
  </div>
</template>
