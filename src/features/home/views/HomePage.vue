<script setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { Loading, PullRefresh } from 'vant'
import { useRoute } from 'vue-router'
import 'vant/es/pull-refresh/style'
import { createHomeController, createNoopPageLoadingAdapter } from '../index.js'
import { createLocalHomeViewProvider } from '../providers/localHomeViewProvider.js'
import CreditSummary from '../components/CreditSummary.vue'
import HomeBroadcast from '../components/HomeBroadcast.vue'
import HomeError from '../components/HomeError.vue'
import HomePrimaryAction from '../components/HomePrimaryAction.vue'
import HomeSteps from '../components/HomeSteps.vue'
import ProductSelection from '../components/ProductSelection.vue'
import MultiPushHome from '../components/MultiPushHome.vue'
import { createLocalMultiPushHomeViewData } from '../providers/localMultiPushHomeViewData.js'
import { APP_MODE, appModeState } from '../../shell/appModeStore.js'

defineOptions({ name: 'HomePage' })

const viewProvider = ref(null)
const route = useRoute()
const controller = createHomeController({
  loadingPort: createNoopPageLoadingAdapter(),
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
const broadcastItem = computed(() => data.value?.broadcast?.items?.[state.value.broadcastIndex] || null)
const isMultiPush = computed(() => appModeState.mode === APP_MODE.MULTI_PUSH)
const multiPushScenario = computed(() => import.meta.env.DEV
  ? readHashQueryParam('scenario')
  : null)
const multiPushData = computed(() => (import.meta.env.DEV
  ? createLocalMultiPushHomeViewData(multiPushScenario.value)
  : null))

function readHashQueryParam(key) {
  const searchValue = new URLSearchParams(window.location.search).get(key)
  if (searchValue) return searchValue
  const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?').slice(1).join('?') : ''
  return new URLSearchParams(hashQuery).get(key)
}

let unsubscribe

function refresh() {
  if (state.value.isRefreshPending) return
  isRefreshing.value = true
  controller.refresh()
}

function selectAmount(amountKey) { controller.selectAmount(amountKey) }
function selectTerm(termKey) { controller.selectTerm(termKey) }
function retry() { controller.retry() }
function handleMultiPushAction(action) {
  window.dispatchEvent(new CustomEvent('dinero-pro:multi-push-action', { detail: action }))
}
function handleVisibilityChange() {
  if (document.hidden) controller.hide()
  else controller.show()
}

onActivated(() => {
  controller.show()
})

onDeactivated(() => {
  controller.hide()
})

onMounted(async () => {
  unsubscribe = controller.subscribe((nextState) => {
    state.value = nextState
    if (!nextState.isRefreshPending && nextState.pageStatus !== 'refreshing') isRefreshing.value = false
  })
  controller.show()
  window.updateHomeView = controller.updateHomeView
  window.addEventListener('pagehide', controller.hide)
  window.addEventListener('pageshow', controller.show)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  const requestedMode = import.meta.env.DEV
    ? route.query.scenario
    : 'apply'
  viewProvider.value = createLocalHomeViewProvider(controller, { initialMode: requestedMode })
  viewProvider.value.start()
})

onBeforeUnmount(() => {
  window.removeEventListener('pagehide', controller.hide)
  window.removeEventListener('pageshow', controller.show)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  if (window.updateHomeView === controller.updateHomeView) delete window.updateHomeView
  unsubscribe?.()
  controller.destroy()
})
</script>

<template>
  <MultiPushHome
    v-if="isMultiPush"
    :data="multiPushData"
    @action="handleMultiPushAction"
  />
  <PullRefresh
    v-else
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
    <main class="home-page" :class="`home-page--${mode}`">
      <div class="home-page__frame">
        <HomeBroadcast :item="broadcastItem" />

        <div v-if="state.pageStatus === 'error'" class="home-page__state">
          <HomeError v-if="state.errorData" :error="state.errorData" :pending="state.isRetryPending" @retry="retry" />
          <div v-else class="home-error-symbol" role="alert" :data-diagnostic-code="state.diagnosticCode" aria-label="Error">!</div>
        </div>

        <template v-else-if="data">
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
