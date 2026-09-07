<script setup>
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import UnifiedHomeView from '../ui/UnifiedHomeView.vue'
import { createHomeFlowController, createHomeHostService, createHomeRouteConsumer } from '../index.js'
import { createDataCollectionService } from '../../dataCollection/index.js'
import { createMultiPushApplicationService } from '../services/multiPushApplicationService.js'
import { createHomeBrowserPort } from '../homeBrowserPort.js'
import { createHomeDataProvider } from '../providers/homeDataProvider.js'
import { APP_MODE, setAppMode, setHomeTabs } from '../../shell/appModeStore.js'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'

defineOptions({ name: 'HomePage' })

const globalStore = useGlobalStore()
const router = useRouter()
const homeView = ref(null)
const viewProvider = ref(null)
const flowScopeId = `home-flow-${Date.now().toString(36)}`
const browserPort = createHomeBrowserPort()
const homeRouteConsumer = createHomeRouteConsumer({ router })
const homeHostService = createHomeHostService({ globalStore })
const dataCollectionService = createDataCollectionService()
const multiPushApplicationService = createMultiPushApplicationService({ store: globalStore })
let flowController = null
let hasBeenActivated = false
let isDisposed = false
let needsBrowserReturnReload = false

function syncMainTabs(payload) {
  if (payload?.homeMode === 'multi_push' && Array.isArray(payload.tabs)) {
    setAppMode(APP_MODE.MULTI_PUSH)
    setHomeTabs(payload.tabs)
  } else if (payload?.homeMode === 'cash_loan' && Array.isArray(payload.tabs)) {
    setAppMode(APP_MODE.CASH_LOAN)
    setHomeTabs(payload.tabs)
  }
}

function updateHomeView(payload) {
  if (isDisposed) return
  syncMainTabs(payload)
  homeView.value?.updateHomeView(payload)
}

function handleHomeOperation(operation) {
  browserPort.emitOperation(operation)
  if (!flowController || isDisposed) return
  void flowController.handleHomeOperation({ flowScopeId, operation })
}

function handleHomeDiagnostic(diagnostic) {
  browserPort.emitDiagnostic(diagnostic)
}

function handlePageHide() {
  needsBrowserReturnReload = true
}

function handlePageShow() {
  if (!needsBrowserReturnReload || !flowController || isDisposed) return
  needsBrowserReturnReload = false
  void flowController.activateHome({ flowScopeId, reason: 'history_restore' })
}

function handleVisibilityChange() {}

onMounted(() => {
  viewProvider.value = createHomeDataProvider({ store: globalStore })
  flowController = createHomeFlowController({
    hostService: homeHostService,
    dataCollectionService,
    multiPushApplicationService,
    dataProvider: viewProvider.value,
    updateHomeView,
    emitHomeRouteIntent(routeIntent, context) {
      void homeRouteConsumer.consumeHomeRouteIntent({
        ...context,
        routeIntent,
        currentRoute: router.currentRoute.value,
      })
    },
  })
  browserPort.mount({
    updateHomeView,
    onPageHide: handlePageHide,
    onPageShow: handlePageShow,
    onVisibilityChange: handleVisibilityChange,
  })
  void flowController.startHomeFlow({ flowScopeId })
})

onActivated(() => {
  if (hasBeenActivated) void flowController?.activateHome({ flowScopeId, reason: 'return_from_tab' })
  hasBeenActivated = true
})

onDeactivated(() => {
  needsBrowserReturnReload = false
})

onBeforeUnmount(() => {
  isDisposed = true
  flowController?.disposeHomeFlow({ flowScopeId })
  browserPort.unmount()
  viewProvider.value?.destroy?.()
  hasBeenActivated = false
  needsBrowserReturnReload = false
})
</script>

<template>
  <UnifiedHomeView
    ref="homeView"
    :show-tabs="false"
    @emit-home-operation="handleHomeOperation"
    @diagnostic="handleHomeDiagnostic"
  />
</template>
