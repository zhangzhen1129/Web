<script setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Loading, PullRefresh, Skeleton, showToast } from 'vant'
import 'vant/es/pull-refresh/style'
import 'vant/es/skeleton/style'
import 'vant/es/toast/style'
import { createHomeController, createHomeFlowController, createHomeHostService, createHomeRouteConsumer } from '../index.js'
import { createHomeBrowserPort } from '../homeBrowserPort.js'
import { createNoopPageLoadingAdapter } from '../pageLoadingPort.js'
import { createHomeDataProvider } from '../providers/homeDataProvider.js'
import CreditSummary from '../components/CreditSummary.vue'
import HomeBroadcast from '../components/HomeBroadcast.vue'
import HomePrimaryAction from '../components/HomePrimaryAction.vue'
import HomeSteps from '../components/HomeSteps.vue'
import ProductSelection from '../components/ProductSelection.vue'
import MultiPushHome from '../components/MultiPushHome.vue'
import HomeOverlayNotice from '../components/HomeOverlayNotice.vue'
import { APP_MODE, setAppMode, setHomeTabs } from '../../shell/appModeStore.js'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'

defineOptions({ name: 'HomePage' })

const viewProvider = ref(null)
const globalStore = useGlobalStore()
const router = useRouter()
const homeRouteConsumer = createHomeRouteConsumer({ router })
const homeHostService = createHomeHostService({ globalStore })
const flowScopeId = `home-flow-${Date.now().toString(36)}`
const browserPort = createHomeBrowserPort()
let flowController = null
let activeRefreshPromise = null
const controller = createHomeController({
  loadingPort: createNoopPageLoadingAdapter(),
  onOperation(operation) {
    browserPort.emitOperation(operation)
    const operationPromise = flowController
      ? Promise.resolve(flowController.handleHomeOperation({ flowScopeId, operation }))
      : Promise.resolve({ status: 'failed' })
    if (operation.type === 'refresh') activeRefreshPromise = operationPromise
    void operationPromise
  },
  onDiagnostic(diagnostic) {
    browserPort.emitDiagnostic(diagnostic)
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
let handledToastId = null

watch(() => state.value.toastNotice?.noticeId, (noticeId) => {
  if (!noticeId || noticeId === handledToastId) return
  handledToastId = noticeId
  const toast = state.value.toastNotice
  if (toast?.text) showToast({ message: toast.text, forbidClick: true })
})

function syncMainTabs(nextState) {
  if (nextState?.homeMode === 'multi_push' && Array.isArray(nextState.multiPushViewData?.tabs)) {
    setAppMode(APP_MODE.MULTI_PUSH)
    setHomeTabs(nextState.multiPushViewData.tabs)
  } else if (nextState?.homeMode === 'cash_loan' && Array.isArray(nextState.viewData?.tabs)) {
    setAppMode(APP_MODE.CASH_LOAN)
    setHomeTabs(nextState.viewData.tabs)
  }
}

let unsubscribe
let hasBeenActivated = false
let isDisposed = false
let needsBrowserReturnReload = false
void initializeHomeProvider()

async function refresh() {
  if (state.value.isRefreshPending) return
  isRefreshing.value = true
  controller.refresh()
  const operationPromise = activeRefreshPromise
  try {
    if (operationPromise) await operationPromise
  } finally {
    if (activeRefreshPromise === operationPromise) activeRefreshPromise = null
    isRefreshing.value = false
  }
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
  if (document.hidden) {
    controller.hide()
  }
  else controller.show()
}
function handlePageHide() {
  needsBrowserReturnReload = true
  controller.hide()
}

function handlePageShow() {
  controller.show()
  if (!needsBrowserReturnReload || !flowController) return
  needsBrowserReturnReload = false
  void flowController.activateHome({ flowScopeId, reason: 'history_restore' })
}

onActivated(() => {
  controller.show()
  if (hasBeenActivated) void flowController?.activateHome({ flowScopeId, reason: 'return_from_tab' })
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
  browserPort.mount({
    updateHomeView: controller.updateHomeView,
    onPageHide: handlePageHide,
    onPageShow: handlePageShow,
    onVisibilityChange: handleVisibilityChange,
  })
})

async function initializeHomeProvider() {
  if (isDisposed) return
  viewProvider.value = createHomeDataProvider({ store: globalStore })
  flowController = createHomeFlowController({
    hostService: homeHostService,
    dataProvider: viewProvider.value,
    updateHomeView: controller.updateHomeView,
    emitHomeRouteIntent(routeIntent, context) {
      void homeRouteConsumer.consumeHomeRouteIntent({
        ...context,
        routeIntent,
        currentRoute: router.currentRoute.value,
      })
    },
  })
  await flowController.startHomeFlow({ flowScopeId })
}

onBeforeUnmount(() => {
  isDisposed = true
  flowController?.disposeHomeFlow({ flowScopeId })
  browserPort.unmount()
  unsubscribe?.()
  viewProvider.value?.destroy?.()
  controller.destroy()
  hasBeenActivated = false
  needsBrowserReturnReload = false
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
  <HomeOverlayNotice :notice="overlayNotice" @close="controller.dismissOverlayNotice" />
</template>

<style src="./homePage.css"></style>
