<script setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { Loading, PullRefresh, Skeleton } from 'vant'
import 'vant/es/pull-refresh/style'
import 'vant/es/skeleton/style'
import { createHomeController } from '../index.js'
import { createNativePageLoadingAdapter } from '../pageLoadingPort.js'
import { createLocalHomeViewProvider } from '../providers/localHomeViewProvider.js'
import CreditSummary from '../components/CreditSummary.vue'
import HomeBroadcast from '../components/HomeBroadcast.vue'
import HomeError from '../components/HomeError.vue'
import HomePrimaryAction from '../components/HomePrimaryAction.vue'
import HomeSteps from '../components/HomeSteps.vue'
import ProductSelection from '../components/ProductSelection.vue'
import MultiPushHome from '../components/MultiPushHome.vue'
import HomeOverlayNotice from '../components/HomeOverlayNotice.vue'
import { APP_MODE, appModeState, setMultiPushTabs } from '../../shell/appModeStore.js'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { createNativeAppInfoBootstrap } from '../../../shared/globalStore/nativeAppInfoBootstrap.js'
import { createNativeTokenBootstrap } from '../../../shared/globalStore/nativeTokenBootstrap.js'
import { createNativeThirdPartySdkIdentifiersBootstrap } from '../../../shared/globalStore/nativeThirdPartySdkIdentifiersBootstrap.js'
import { getNativeAppInfo } from '../../../shared/bridge/nativeAppInfo.js'
import { getNativeCachedToken } from '../../../shared/bridge/nativePersistentCache.js'
import { getThirdPartySdkIdentifiers } from '../../../shared/bridge/nativeThirdPartySdkIdentifiers.js'

defineOptions({ name: 'HomePage' })

const viewProvider = ref(null)
const globalStore = useGlobalStore()
const controller = createHomeController({
  loadingPort: createNativePageLoadingAdapter(),
  onOperation(operation) {
    window.dispatchEvent(new CustomEvent('dinero-pro:home-operation', { detail: operation }))
    viewProvider.value?.handleOperation(operation)
  },
  onDiagnostic(diagnostic) {
    window.dispatchEvent(new CustomEvent('dinero-pro:home-diagnostic', { detail: diagnostic }))
  },
})
controller.updateHomeView({ requestId: `home-setup-${Date.now()}`, pageStatus: 'loading' })
const state = ref(controller.getState())
const isRefreshing = ref(false)
const mode = computed(() => state.value.viewMode || 'apply')
const data = computed(() => state.value.viewData)
const multiPushData = computed(() => state.value.multiPushViewData)
const broadcastItem = computed(() => data.value?.broadcast?.items?.[state.value.broadcastIndex] || null)
const isMultiPush = computed(() => state.value.homeMode === 'multi_push')
const overlayNotice = computed(() => state.value.overlayNotice)

function syncMainTabs(nextState) {
  if (nextState?.homeMode === 'multi_push' && Array.isArray(nextState.multiPushViewData?.tabs)) {
    setMultiPushTabs(nextState.multiPushViewData.tabs)
  } else if (nextState?.homeMode === 'cash_loan') {
    setMultiPushTabs([])
  }
}

let unsubscribe
let hasBeenActivated = false
let isDisposed = false
void initializeHomeProvider()

function refresh() {
  if (state.value.isRefreshPending) return
  isRefreshing.value = true
  controller.refresh()
}

function selectAmount(amountKey) { controller.selectAmount(amountKey) }
function selectTerm(termKey) { controller.selectTerm(termKey) }
function handleMultiPushAction(action) {
  if (action?.type === 'PRIMARY_ACTION') return controller.primaryAction()
  if (action?.type === 'REFRESH_CREDIT') return controller.refreshCredit()
  if (action?.type === 'TOGGLE_PRODUCT_SELECTION') return controller.toggleProductSelection(action.productId, action.selected)
  if (action?.type === 'SUBMIT_SELECTED_PRODUCTS') return controller.submitSelectedProducts(action.productIds)
}
function handleVisibilityChange() {
  if (document.hidden) controller.hide()
  else controller.show()
}

onActivated(() => {
  controller.show()
  if (hasBeenActivated) viewProvider.value?.reload?.()
  hasBeenActivated = true
})

onDeactivated(() => {
  controller.hide()
})

onMounted(async () => {
  unsubscribe = controller.subscribe((nextState) => {
    state.value = nextState
    syncMainTabs(nextState)
    if (!nextState.isRefreshPending && nextState.pageStatus !== 'refreshing') isRefreshing.value = false
  })
  state.value = controller.getState()
  syncMainTabs(state.value)
  controller.show()
  window.updateHomeView = controller.updateHomeView
  window.addEventListener('pagehide', controller.hide)
  window.addEventListener('pageshow', controller.show)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

function runInitializationStep(factory, requestFn) {
  return new Promise((resolve) => {
    let settled = false
    try {
      const bootstrap = factory((consumer) => requestFn((reply) => {
        consumer(reply)
        if (!settled) { settled = true; resolve() }
      }))
      const requestId = bootstrap.request(globalStore)
      if (!requestId && !settled) { settled = true; resolve() }
    } catch {
      if (!settled) { settled = true; resolve() }
    }
  })
}

async function initializeHomeProvider() {
  globalStore.hydrateGlobal()
  await runInitializationStep(createNativeAppInfoBootstrap, getNativeAppInfo)
  await runInitializationStep(createNativeTokenBootstrap, getNativeCachedToken)
  await runInitializationStep(createNativeThirdPartySdkIdentifiersBootstrap, getThirdPartySdkIdentifiers)
  if (isDisposed) return
  const currentMode = appModeState.mode === APP_MODE.MULTI_PUSH ? 'multi_push' : 'apply'
  const initialViewMode = import.meta.env.DEV
    ? new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('viewMode')
    : null
  if (!viewProvider.value) viewProvider.value = createLocalHomeViewProvider(controller, {
    initialMode: initialViewMode === 'rejected' ? 'rejected' : currentMode,
  })
  viewProvider.value.start()
}

onBeforeUnmount(() => {
  isDisposed = true
  window.removeEventListener('pagehide', controller.hide)
  window.removeEventListener('pageshow', controller.show)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  if (window.updateHomeView === controller.updateHomeView) delete window.updateHomeView
  unsubscribe?.()
  viewProvider.value?.destroy?.()
  controller.destroy()
  hasBeenActivated = false
})

watch(() => appModeState.mode, (nextMode) => {
  viewProvider.value?.setHomeMode(nextMode === APP_MODE.MULTI_PUSH ? 'multi_push' : 'apply')
})
</script>

<template>
  <PullRefresh
    v-model="isRefreshing"
    :head-height="52"
    :pull-distance="72"
    @refresh="refresh"
  >
    <template #pulling>
      <Loading type="spinner" size=".8rem" />
    </template>
    <template #loosing>
      <Loading type="spinner" size=".8rem" />
    </template>
    <template #loading>
      <Loading type="spinner" size=".8rem" />
    </template>
    <main v-if="state.pageStatus === 'loading' || state.pageStatus === 'error'" class="home-page home-page--loading" aria-busy="true">
      <div class="home-page__frame">
        <Skeleton
          class="home-page__skeleton"
          :class="{ 'home-page__skeleton--refreshing': isRefreshing }"
          :row="15"
          :title="false"
          animate
        />
        <HomeError v-if="state.pageStatus === 'error' && state.errorData" class="home-page__error-overlay" :error="state.errorData" />
      </div>
    </main>
    <MultiPushHome
      v-else-if="isMultiPush"
      :data="multiPushData"
      :broadcast-index="state.broadcastIndex"
      :credit-refresh-pending="state.isCreditRefreshPending"
      @action="handleMultiPushAction"
    />
    <main v-else class="home-page" :class="`home-page--${mode}`" :aria-busy="false">
      <div class="home-page__frame">
        <HomeBroadcast :item="broadcastItem" />

        <template v-if="data">
          <div class="home-page__content">
            <HomeSteps :title="data.titleText" :steps="data.steps" />
            <ProductSelection
              v-if="data.productSelection"
              :product="data.productSelection"
              @select-amount="selectAmount"
              @select-term="selectTerm"
            />
            <CreditSummary
              v-else-if="data.creditSummary"
              :summary="data.creditSummary"
              :refresh-pending="state.isCreditRefreshPending"
              @refresh="controller.refreshCredit"
            />
            <p v-if="data.statusNotice" class="status-notice" :class="`status-notice--${data.statusNotice.tone}`">
              {{ data.statusNotice.text }}
            </p>
            <HomePrimaryAction :action="data.primaryAction" @activate="controller.primaryAction" />
          </div>
        </template>
      </div>
    </main>
  </PullRefresh>
  <HomeOverlayNotice :notice="overlayNotice" />
</template>

<style src="./homePage.css"></style>
