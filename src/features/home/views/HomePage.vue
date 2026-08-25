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
import { APP_MODE, appModeState } from '../../shell/appModeStore.js'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { requestNativeToken } from '../../../shared/globalStore/nativeTokenBootstrap.js'

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
const state = ref(controller.getState())
const isRefreshing = ref(false)
const mode = computed(() => state.value.viewMode || 'apply')
const data = computed(() => state.value.viewData)
const multiPushData = computed(() => state.value.multiPushViewData)
const broadcastItem = computed(() => data.value?.broadcast?.items?.[state.value.broadcastIndex] || null)
const isMultiPush = computed(() => state.value.homeMode === 'multi_push')

let unsubscribe
let hasBeenActivated = false

function refresh() {
  if (state.value.isRefreshPending) return
  isRefreshing.value = true
  controller.refresh()
}

function selectAmount(amountKey) { controller.selectAmount(amountKey) }
function selectTerm(termKey) { controller.selectTerm(termKey) }
function handleMultiPushAction(action) {
  if (action?.type === 'RETRY') return controller.retry()
  if (action?.type === 'APPLY' || action?.type === 'REPAY') controller.primaryAction()
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
  requestNativeToken(globalStore)
  unsubscribe = controller.subscribe((nextState) => {
    state.value = nextState
    if (!nextState.isRefreshPending && nextState.pageStatus !== 'refreshing') isRefreshing.value = false
  })
  controller.show()
  window.updateHomeView = controller.updateHomeView
  window.addEventListener('pagehide', controller.hide)
  window.addEventListener('pageshow', controller.show)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  const requestedMode = appModeState.mode === APP_MODE.MULTI_PUSH ? 'multi_push' : 'apply'
  viewProvider.value = createLocalHomeViewProvider(controller, { initialMode: requestedMode })
  viewProvider.value.start()
})

onBeforeUnmount(() => {
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
            <CreditSummary v-else-if="data.creditSummary" :summary="data.creditSummary" />
            <p v-if="data.statusNotice" class="status-notice" :class="`status-notice--${data.statusNotice.tone}`">
              {{ data.statusNotice.text }}
            </p>
            <HomePrimaryAction :action="data.primaryAction" @activate="controller.primaryAction" />
          </div>
        </template>
      </div>
    </main>
  </PullRefresh>
</template>

<style src="./homePage.css"></style>
