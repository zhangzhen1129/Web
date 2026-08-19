<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HomeTabs from '../home/components/HomeTabs.vue'
import { ROUTE_PATH } from '../../router/index.js'
import { appModeState, readInitialAppMode, setAppMode, shouldShowRepaymentTab } from './appModeStore.js'
import { hideNativeTabBar } from './nativeTabBar.js'

const route = useRoute()
const router = useRouter()
const tabScrollPositions = new Map()

const tabDefinitions = computed(() => [
  { key: 'home', text: 'Préstamos', iconResourceKey: 'home', routePath: ROUTE_PATH.HOME },
  ...(shouldShowRepaymentTab(appModeState.mode)
    ? [{ key: 'repayment', text: 'Reembolso', iconResourceKey: 'repayment', routePath: ROUTE_PATH.REPAYMENT }]
    : []),
  { key: 'account', text: 'Mi cuenta', iconResourceKey: 'account', routePath: ROUTE_PATH.MINE },
])

const tabs = computed(() => tabDefinitions.value.map((tab) => ({
  ...tab,
  enabled: true,
  active: route.meta.tabKey === tab.key,
})))

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
  if (route.path === ROUTE_PATH.HOME) {
    tabScrollPositions.set(route.path, getPageScrollTop())
  }
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
  if (route.path === ROUTE_PATH.REPAYMENT && !shouldShowRepaymentTab(appModeState.mode)) {
    router.replace(ROUTE_PATH.HOME)
  }
}

onMounted(() => {
  hideNativeTabBar()
  setAppMode(readInitialAppMode(route.query.appMode))
  if (import.meta.env.DEV) window.updateAppMode = setAppMode
  ensureRouteAllowed()
})

watch(() => appModeState.mode, ensureRouteAllowed)
watch(() => route.query.appMode, (nextMode) => {
  if (nextMode !== undefined) setAppMode(readInitialAppMode(nextMode))
})
watch(() => route.path, ensureRouteAllowed)

onBeforeUnmount(() => {
  if (import.meta.env.DEV && window.updateAppMode === setAppMode) delete window.updateAppMode
})
</script>

<template>
  <div class="main-tab-shell">
    <div class="main-tab-shell__viewport">
      <RouterView v-slot="{ Component }">
        <KeepAlive :include="shouldShowRepaymentTab(appModeState.mode)
          ? ['HomePage', 'RepaymentPage', 'MinePage']
          : ['HomePage', 'MinePage']">
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </div>
    <HomeTabs :tabs="tabs" @navigate="replaceTab" />
  </div>
</template>
