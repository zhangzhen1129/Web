<script setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { Loading, PullRefresh, Skeleton, showToast } from 'vant'
import 'vant/es/loading/style'
import 'vant/es/pull-refresh/style'
import 'vant/es/skeleton/style'
import 'vant/es/toast/style'
import lockIcon from '../../../assets/home/lock.svg'
import minusIcon from '../../../assets/home/minus.svg'
import plusIcon from '../../../assets/home/plus.svg'
import productChevron from '../../../assets/home/product-chevron.svg'
import productDialogClose from '../../../assets/home/product-dialog-close.svg'
import refreshIcon from '../../../assets/home/refresh.svg'
import { HOME_MODE, HOME_OPERATION_TYPE, HOME_PAGE_STATUS, MULTI_PUSH_VARIANT } from './homeUiContract.js'
import { getHomeStepIcon, getHomeTabIcon } from './homeUiResources.js'
import { createHomeUiSession } from './homeUiSession.js'
import { homeUiText } from './homeUiText.js'

defineOptions({ name: 'UnifiedHomeView' })

const props = defineProps({
  initialPayload: { type: Object, default: null },
  requestIdFactory: { type: Function, default: undefined },
})
const emit = defineEmits(['emitHomeOperation', 'diagnostic'])
const session = createHomeUiSession({
  createRequestId: props.requestIdFactory,
  onOperation: (operation) => emit('emitHomeOperation', operation),
  onDiagnostic: (diagnostic) => emit('diagnostic', diagnostic),
})
const state = ref(session.getState())
const pullRefreshing = ref(false)
let unsubscribe = session.subscribe((nextState) => {
  state.value = nextState
})
let handledToastId = null

const activeData = computed(() => state.value.homeMode === HOME_MODE.MULTI_PUSH
  ? state.value.multiPushViewData
  : state.value.viewData)
const broadcastItem = computed(() => activeData.value?.broadcast?.items?.[state.value.broadcastIndex] ?? null)
const productSelection = computed(() => state.value.viewData?.productSelection ?? null)
const creditSummary = computed(() => activeData.value?.creditSummary ?? null)
const primaryAction = computed(() => activeData.value?.primaryAction ?? null)
const products = computed(() => state.value.multiPushViewData?.products ?? [])
const selectedProductCount = computed(() => products.value.filter((product) => product.selected).length)
const selectedCountText = computed(() => {
  const template = state.value.multiPushViewData?.productSummary?.countTextTemplate ?? ''
  return template.replace('{count}', String(selectedProductCount.value))
})
const showProductSummary = computed(() => products.value.length > 0
  || state.value.multiPushViewData?.variant === MULTI_PUSH_VARIANT.ACTIVE_ONLY)
const isActiveOnly = computed(() => state.value.multiPushViewData?.variant === MULTI_PUSH_VARIANT.ACTIVE_ONLY)
const isPageBusy = computed(() => [HOME_PAGE_STATUS.LOADING, HOME_PAGE_STATUS.REFRESHING].includes(state.value.pageStatus))
const contentVisible = computed(() => [HOME_PAGE_STATUS.CONTENT, HOME_PAGE_STATUS.REFRESHING].includes(state.value.pageStatus))
const canDecreaseAmount = computed(() => canSelectAdjacentAmount('previous'))
const canIncreaseAmount = computed(() => canSelectAdjacentAmount('next'))

watch(
  () => props.initialPayload,
  (payload) => {
    if (payload) session.updateHomeView(payload)
  },
  { immediate: true },
)

watch(
  () => [state.value.pendingOperationType, state.value.pageStatus],
  ([operationType, pageStatus]) => {
    pullRefreshing.value = operationType === HOME_OPERATION_TYPE.REFRESH || pageStatus === HOME_PAGE_STATUS.REFRESHING
  },
  { immediate: true },
)

watch(() => state.value.toastNotice?.noticeId, (noticeId) => {
  if (!noticeId || noticeId === handledToastId) return
  handledToastId = noticeId
  showToast({ message: state.value.toastNotice.text, forbidClick: true })
}, { immediate: true })

function handleRefresh() {
  if (!session.refresh()) pullRefreshing.value = false
}

function selectedOption(options, selectedKey) {
  return options?.find((option) => option.key === selectedKey) ?? null
}

function adjacentAmount(direction) {
  session.selectAdjacentAmount(direction)
}

function canSelectAdjacentAmount(direction) {
  const selection = productSelection.value
  const options = selection?.amountOptions
  if (!Array.isArray(options)) return false
  const currentIndex = options.findIndex((option) => option.key === selection.selectedAmountKey)
  const step = direction === 'previous' ? -1 : 1
  for (let index = currentIndex + step; index >= 0 && index < options.length; index += step) {
    if (!options[index].disabled) return true
  }
  return false
}

function isProductToggleDisabled(product) {
  return !product.selectable || (product.selected && selectedProductCount.value <= 1)
}

function handleVisibilityChange() {
  if (document.hidden) session.hide()
  else session.show()
}

function handleOverlayKeydown(event) {
  if (event.key === 'Escape') session.dismissOverlayNotice()
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
  document.addEventListener('keydown', handleOverlayKeydown)
})
onActivated(session.show)
onDeactivated(session.hide)
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  document.removeEventListener('keydown', handleOverlayKeydown)
  unsubscribe?.()
  unsubscribe = null
  session.destroy()
})

defineExpose({
  updateHomeView(payload) {
    session.updateHomeView(payload)
  },
})
</script>

<template>
  <section class="unified-home" :aria-busy="isPageBusy">
    <PullRefresh
      v-model="pullRefreshing"
      class="unified-home__refresh"
      :disabled="state.dialogOpen"
      :head-height="52"
      :pull-distance="72"
      @refresh="handleRefresh"
    >
      <template #pulling><Loading type="spinner" size=".8rem" /></template>
      <template #loosing><Loading type="spinner" size=".8rem" /></template>
      <template #loading><Loading type="spinner" size=".8rem" /></template>

      <div class="unified-home__viewport">
        <div v-if="state.pageStatus === HOME_PAGE_STATUS.LOADING || state.pageStatus === HOME_PAGE_STATUS.ERROR" class="unified-home__state">
          <Skeleton class="unified-home__skeleton" :row="15" :title="false" animate />
          <p v-if="state.pageStatus === HOME_PAGE_STATUS.ERROR && state.errorData" class="unified-home__error" role="alert">
            {{ state.errorData.messageText }}
          </p>
        </div>

        <template v-else-if="contentVisible">
          <div v-if="broadcastItem" class="unified-home__broadcast" aria-live="polite">
            <span class="unified-home__broadcast-dot" aria-hidden="true"></span>
            <Transition name="unified-home-broadcast" mode="out-in">
              <span :key="broadcastItem.key" class="unified-home__broadcast-text">{{ broadcastItem.text }}</span>
            </Transition>
          </div>

          <div class="unified-home__content" :class="`unified-home__content--${state.homeMode}`">
            <section v-if="activeData?.steps?.length" class="unified-home__steps" aria-labelledby="unified-home-steps-title">
              <h1 id="unified-home-steps-title">{{ homeUiText.quickStepsTitle }}</h1>
              <ol>
                <li v-for="step in activeData.steps" :key="step.key">
                  <img v-if="getHomeStepIcon(step.iconResourceKey)" :src="getHomeStepIcon(step.iconResourceKey)" alt="" />
                  <span>{{ step.text }}</span>
                </li>
              </ol>
            </section>

            <template v-if="state.homeMode === HOME_MODE.CASH_LOAN">
              <section v-if="productSelection" class="unified-home__amount-card" :aria-label="homeUiText.creditLimitTitle">
                <h2>{{ homeUiText.creditLimitTitle }}</h2>
                <div class="unified-home__amount-controls">
                  <button
                    type="button"
                    :disabled="!canDecreaseAmount"
                    :aria-label="homeUiText.decreaseAmountLabel"
                    @click="adjacentAmount('previous')"
                  >
                    <img :src="minusIcon" alt="" />
                  </button>
                  <strong>{{ selectedOption(productSelection.amountOptions, productSelection.selectedAmountKey)?.text }}</strong>
                  <button
                    type="button"
                    :disabled="!canIncreaseAmount"
                    :aria-label="homeUiText.increaseAmountLabel"
                    @click="adjacentAmount('next')"
                  >
                    <img :src="plusIcon" alt="" />
                  </button>
                </div>
              </section>

              <section v-if="productSelection?.termOptions" class="unified-home__term-card" :aria-label="homeUiText.loanTermTitle">
                <h2>{{ homeUiText.loanTermTitle }}</h2>
                <div role="radiogroup">
                  <button
                    v-for="option in productSelection.termOptions"
                    :key="option.key"
                    type="button"
                    role="radio"
                    :aria-checked="option.key === productSelection.selectedTermKey"
                    :class="{ 'is-selected': option.key === productSelection.selectedTermKey }"
                    :disabled="option.disabled"
                    @click="session.selectTerm(option.key)"
                  >{{ option.text }}</button>
                </div>
              </section>
            </template>

            <section v-if="creditSummary" class="unified-home__credit" :aria-label="creditSummary.availableLabelText">
              <div class="unified-home__credit-main">
                <h2>{{ creditSummary.availableLabelText }}</h2>
                <img v-if="creditSummary.locked" class="unified-home__credit-state" :src="lockIcon" alt="" />
                <button
                  v-else-if="creditSummary.refreshEnabled"
                  class="unified-home__credit-state"
                  type="button"
                  :disabled="state.pendingOperationType === HOME_OPERATION_TYPE.REFRESH_CREDIT"
                  :aria-label="creditSummary.availableLabelText"
                  @click="session.refreshCredit"
                ><img :src="refreshIcon" alt="" /></button>
                <strong>{{ creditSummary.availableText }}</strong>
              </div>
              <div class="unified-home__credit-details">
                <div><span>{{ creditSummary.totalLabelText }}</span><strong>{{ creditSummary.totalText }}</strong></div>
                <div><span>{{ creditSummary.usedLabelText }}</span><strong>{{ creditSummary.usedText }}</strong></div>
              </div>
            </section>

            <button
              v-if="state.homeMode === HOME_MODE.MULTI_PUSH && showProductSummary"
              class="unified-home__product-summary"
              type="button"
              :disabled="products.length === 0"
              @click="session.openProductDialog"
            >
              <strong>{{ homeUiText.productSummaryTitle }}</strong>
              <span :class="{ 'is-empty': isActiveOnly && products.length === 0 }">{{ selectedCountText }}</span>
              <img :src="productChevron" alt="" />
            </button>

            <div v-if="primaryAction" class="unified-home__primary-wrap">
              <p v-if="primaryAction.supportingText" class="unified-home__primary-hint">{{ primaryAction.supportingText }}</p>
              <button
                class="unified-home__primary"
                type="button"
                :disabled="!primaryAction.enabled || primaryAction.loading"
                :aria-busy="primaryAction.loading"
                @click="session.primaryAction"
              >
                <Loading v-if="primaryAction.loading" type="spinner" size=".45rem" />
                <span>{{ primaryAction.text }}</span>
              </button>
            </div>
          </div>
        </template>
      </div>
    </PullRefresh>

    <nav v-if="state.tabs.length" class="unified-home__tabs" :style="{ '--tab-count': state.tabs.length }" :aria-label="homeUiText.primaryNavigationLabel">
      <button
        v-for="tab in state.tabs"
        :key="tab.key"
        type="button"
        :disabled="!tab.enabled || tab.active"
        :class="{ 'is-active': tab.active }"
        :aria-current="tab.active ? 'page' : undefined"
        @click="session.selectTab(tab.key)"
      >
        <img v-if="getHomeTabIcon(tab)" :src="getHomeTabIcon(tab)" alt="" />
        <span>{{ tab.text }}</span>
      </button>
    </nav>

    <div v-if="state.dialogOpen" class="unified-home__dialog" role="presentation" @wheel.stop @touchmove.stop>
      <section class="unified-home__dialog-sheet" role="dialog" aria-modal="true">
        <button
          class="unified-home__dialog-close"
          type="button"
          :aria-label="homeUiText.closeProductDialogLabel"
          @click="session.closeProductDialog"
        >
          <img :src="productDialogClose" alt="" />
        </button>
        <div class="unified-home__product-list">
          <button
            v-for="product in products"
            :key="product.productId"
            class="unified-home__product"
            :class="{ 'is-selected': product.selected }"
            type="button"
            :disabled="!product.selectable"
            :aria-disabled="isProductToggleDisabled(product)"
            :aria-pressed="product.selected"
            @click="session.toggleProductSelection(product.productId)"
          >
            <img class="unified-home__product-icon" :src="product.iconUrl" alt="" />
            <span v-if="product.isReloan" class="unified-home__reloan">{{ homeUiText.reloanLabel }}</span>
            <strong class="unified-home__product-name">{{ product.name }}</strong>
            <span class="unified-home__product-amount-label">{{ homeUiText.productLoanAmountLabel }}</span>
            <span class="unified-home__product-amount">{{ product.loanAmountText }}</span>
            <span class="unified-home__product-date-label">{{ homeUiText.productDueDateLabel }}</span>
            <span class="unified-home__product-date">{{ product.dueDateText }}</span>
          </button>
        </div>
        <div class="unified-home__dialog-action">
          <button type="button" :disabled="selectedProductCount < 1" @click="session.submitSelectedProducts">
            {{ homeUiText.submitProductsLabel }}
          </button>
          <span>{{ selectedCountText }}</span>
        </div>
      </section>
    </div>

    <Transition name="unified-home-overlay">
      <div
        v-if="state.overlayNotice && state.overlayVisible"
        class="unified-home__overlay"
        role="presentation"
        @click.self="session.dismissOverlayNotice"
      >
        <div class="unified-home__overlay-dialog" role="dialog" aria-modal="true" @click.stop>{{ state.overlayNotice.text }}</div>
      </div>
    </Transition>
  </section>
</template>

<style src="./unifiedHomeView.css"></style>
