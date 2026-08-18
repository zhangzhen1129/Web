<script setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HomeTabs from '../home/components/HomeTabs.vue'
import { ROUTE_PATH } from '../../router/index.js'
import { appModeState, readInitialAppMode, setAppMode, shouldShowRepaymentTab } from './appModeStore.js'
import { hideNativeTabBar } from './nativeTabBar.js'

const route = useRoute()
const router = useRouter()

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

const keptTabPageNames = computed(() => (
  shouldShowRepaymentTab(appModeState.mode)
    ? ['HomePage', 'RepaymentPage', 'MinePage']
    : ['HomePage', 'MinePage']
))

function replaceTab(tab) {
  if (!tab.enabled || tab.active) return
  router.replace(tab.routePath)
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
    <RouterView v-slot="{ Component }">
      <KeepAlive :include="keptTabPageNames">
        <component :is="Component" />
      </KeepAlive>
    </RouterView>
    <HomeTabs :tabs="tabs" @navigate="replaceTab" />
  </div>
</template>
