<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { createHomeController, createNoopPageLoadingAdapter } from '../index.js'
import { createLocalHomeViewProvider } from '../providers/localHomeViewProvider.js'
import CreditSummary from '../components/CreditSummary.vue'
import HomeBroadcast from '../components/HomeBroadcast.vue'
import HomeError from '../components/HomeError.vue'
import HomePrimaryAction from '../components/HomePrimaryAction.vue'
import HomeSteps from '../components/HomeSteps.vue'
import ProductSelection from '../components/ProductSelection.vue'

const viewProvider = ref(null)
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
const pullDistance = ref(0)
const dragging = ref(false)
const mode = computed(() => state.value.viewMode || 'apply')
const data = computed(() => state.value.viewData)
const broadcastItem = computed(() => data.value?.broadcast?.items?.[state.value.broadcastIndex] || null)
const refreshState = computed(() => {
  if (state.value.isRefreshPending || state.value.pageStatus === 'refreshing') return 'refreshing'
  if (pullDistance.value >= 64) return 'ready'
  return pullDistance.value > 0 ? 'pulling' : 'idle'
})
let unsubscribe
let touchStartY = 0
let touchStartX = 0

function onTouchStart(event) {
  if (event.touches.length !== 1 || event.currentTarget.scrollTop > 0 || state.value.isRefreshPending) return
  touchStartY = event.touches[0].clientY
  touchStartX = event.touches[0].clientX
  dragging.value = true
}

function onTouchMove(event) {
  if (!dragging.value || event.touches.length !== 1) return
  const delta = event.touches[0].clientY - touchStartY
  if (Math.abs(event.touches[0].clientX - touchStartX) > Math.abs(delta)) {
    dragging.value = false
    pullDistance.value = 0
    return
  }
  if (delta <= 0) return
  pullDistance.value = Math.min(delta * 0.45, 84)
  if (pullDistance.value > 0) event.preventDefault()
}

function onTouchEnd() {
  if (!dragging.value) return
  const shouldRefresh = pullDistance.value >= 64
  dragging.value = false
  pullDistance.value = 0
  if (shouldRefresh) controller.refresh()
}

function selectAmount(amountKey) { controller.selectAmount(amountKey) }
function selectTerm(termKey) { controller.selectTerm(termKey) }
function retry() { controller.retry() }
function handleVisibilityChange() {
  if (document.hidden) controller.hide()
  else controller.show()
}

onMounted(async () => {
  unsubscribe = controller.subscribe((nextState) => { state.value = nextState })
  controller.show()
  window.updateHomeView = controller.updateHomeView
  window.addEventListener('pagehide', controller.hide)
  window.addEventListener('pageshow', controller.show)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  const requestedMode = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get('scenario')
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
  <main
    class="home-page"
    :class="`home-page--${mode}`"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
  >
    <div class="home-page__frame">
      <HomeBroadcast :item="broadcastItem" :refresh-state="refreshState" />

      <div v-if="state.pageStatus === 'error'" class="home-page__state">
        <HomeError v-if="state.errorData" :error="state.errorData" :pending="state.isRetryPending" @retry="retry" />
        <div v-else class="home-error-symbol" role="alert" :data-diagnostic-code="state.diagnosticCode" aria-label="Error">!</div>
      </div>

      <template v-else-if="data">
        <div class="home-page__content" :style="{ transform: `translateY(${pullDistance}px)` }">
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
</template>

<style src="./homePage.css"></style>
