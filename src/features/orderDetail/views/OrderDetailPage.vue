<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { showToast } from 'vant'
import 'vant/es/toast/style'
import { useRoute, useRouter } from 'vue-router'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { hideNativeLoading, showNativeLoading } from '../../../shared/bridge/nativeLoading.js'
import { openPrivacyAgreementInAppNat } from '../../../shared/bridge/nativePrivacyAgreement.js'
import { createOrderDetailController } from '../orderDetailController.js'
import { amountWithCurrency } from '../orderDetailDisplay.js'
import { ORDER_DETAIL_TEXT } from '../orderDetailText.js'
import { isBusinessRootState, isRepaymentRootState } from '../orderDetailState.js'
import { createOrderDetailServices } from '../services/orderDetailServices.js'
import backAsset from '../assets/back.svg'
import customerServiceAsset from '../assets/customer-service.svg'
import historyChevronAsset from '../assets/history-chevron.svg'
import noticeAsset from '../assets/notice.svg'
import statusCompletedAsset from '../assets/status-completed.svg'
import statusDisbursingAsset from '../assets/status-disbursing.svg'
import statusOverdueAsset from '../assets/status-overdue.svg'
import statusRejectedAsset from '../assets/status-rejected.svg'
import statusRepayingAsset from '../assets/status-repaying.svg'
import statusReviewingAsset from '../assets/status-reviewing.svg'
import statusTransferFailedAsset from '../assets/status-transfer-failed.svg'
import './orderDetailPage.css'

const route = useRoute()
const router = useRouter()
const globalStore = useGlobalStore()
const state = ref(null)

const STATUS_ICONS = Object.freeze({
  reviewing: statusReviewingAsset,
  rejected: statusRejectedAsset,
  disbursing: statusDisbursingAsset,
  repaying: statusRepayingAsset,
  overdue: statusOverdueAsset,
  completed: statusCompletedAsset,
  transfer_failed: statusTransferFailedAsset,
})

function showMessage(message) {
  if (!message) return
  showToast({ message, forbidClick: true })
}

const controller = createOrderDetailController({
  services: createOrderDetailServices({ getGlobalState: () => globalStore }),
  showNativeLoading,
  hideNativeLoading,
  openPaymentPage: openPrivacyAgreementInAppNat,
  onBusinessFailure: showMessage,
  onRequestFailure: showMessage,
  onNavigateBack() {
    const canGoBack = typeof window !== 'undefined' && Boolean(window.history.state?.back)
    if (canGoBack) router.back()
    else void router.replace({ name: 'home' })
  },
  onNavigateDeferDetail({ orderId }) {
    void router.push({ name: 'deferDetail', query: { orderId } })
  },
  onNavigateDeferHistory(query) {
    void router.push({ name: 'deferHistory', query })
  },
  onNavigateBankDetail({ orderId, type }) {
    void router.push({ name: 'bankDetail', query: { orderId, type } })
  },
  onNavigateHome() {
    void router.replace({ name: 'home' })
  },
  onNavigateHelpCenter() {
    void router.push({ name: 'helpCenter' })
  },
})

const unsubscribe = controller.subscribe((nextState) => { state.value = nextState })

onMounted(() => {
  const initialized = controller.initialize(route.query)
  if (!initialized) void router.replace({ name: 'home' })
})

onBeforeUnmount(() => {
  unsubscribe()
  controller.dispose()
})

const isBusinessState = computed(() => isBusinessRootState(state.value?.rootState))
const isError = computed(() => state.value?.rootState === 'error')
const isLoading = computed(() => state.value?.rootState === 'loading')
const statusIcon = computed(() => STATUS_ICONS[state.value?.rootState] ?? '')
const statusText = computed(() => ORDER_DETAIL_TEXT.status[state.value?.rootState] ?? null)
const isRepaymentState = computed(() => isRepaymentRootState(state.value?.rootState))
const showDisbursingNotice = computed(() => state.value?.rootState === 'disbursing')
const showPaymentAction = computed(() => (
  state.value?.rootState === 'repaying' || state.value?.rootState === 'overdue'
))
const showExtensionAction = computed(() => (
  showPaymentAction.value && state.value?.displayModel.extensionFlag === 1
))
const showReapplyAction = computed(() => state.value?.rootState === 'completed')
const showBankAction = computed(() => state.value?.rootState === 'transfer_failed')
const showHistory = computed(() => state.value?.historyVisible === true)
const historyCountText = computed(() => ORDER_DETAIL_TEXT.labels.extensionCountTemplate
  .replace('{count}', String(state.value?.historyCount ?? 0)))
const actionCount = computed(() => {
  if (showPaymentAction.value) return 2
  if (showReapplyAction.value || showBankAction.value) return 1
  return 0
})
const heroClass = computed(() => {
  if (state.value?.rootState === 'disbursing') return 'order-detail-hero--disbursing'
  if (state.value?.rootState === 'transfer_failed' || state.value?.rootState === 'overdue') {
    return 'order-detail-hero--tall'
  }
  return ''
})
</script>

<template>
  <main
    v-if="state"
    class="order-detail-page"
    :aria-busy="isLoading ? 'true' : 'false'"
  >
    <section class="order-detail-hero" :class="heroClass">
      <header class="order-detail-header">
        <button
          class="order-detail-header__back"
          type="button"
          :aria-label="ORDER_DETAIL_TEXT.backLabel"
          :disabled="state.navigationLocked"
          @click="controller.requestBack()"
        >
          <img :src="backAsset" alt="" />
        </button>
        <h1>{{ ORDER_DETAIL_TEXT.pageTitle }}</h1>
        <button
          class="order-detail-header__help"
          type="button"
          :aria-label="ORDER_DETAIL_TEXT.helpLabel"
          :disabled="state.navigationLocked"
          @click="controller.requestHelp()"
        >
          <img :src="customerServiceAsset" alt="" />
        </button>
      </header>

      <div v-if="showDisbursingNotice" class="order-detail-notice">
        <img :src="noticeAsset" alt="" />
        <p>{{ statusText?.notice }}</p>
      </div>

      <article v-if="isBusinessState" class="order-detail-status-card">
        <img :src="statusIcon" alt="" />
        <div>
          <h2>{{ statusText?.title }}</h2>
          <p>{{ statusText?.description }}</p>
        </div>
      </article>
    </section>

    <section v-if="isError" class="order-detail-error" role="alert">
      <p>{{ ORDER_DETAIL_TEXT.errorText }}</p>
    </section>

    <section v-else-if="isBusinessState" class="order-detail-content">
      <article v-if="isRepaymentState" class="order-detail-card">
        <div class="order-detail-row order-detail-row--amount">
          <span>{{ ORDER_DETAIL_TEXT.labels.repaymentAmount }}</span>
          <strong>{{ amountWithCurrency(state.displayModel.repaymentAmount) }}</strong>
        </div>
        <div class="order-detail-row">
          <span>{{ ORDER_DETAIL_TEXT.labels.dueDate }}</span>
          <span>{{ state.displayModel.dueDate }}</span>
        </div>
      </article>

      <article class="order-detail-card">
        <div class="order-detail-row">
          <span>{{ ORDER_DETAIL_TEXT.labels.orderNo }}</span>
          <span>{{ state.displayModel.orderNo }}</span>
        </div>
        <div class="order-detail-row">
          <span>{{ ORDER_DETAIL_TEXT.labels.loanAmount }}</span>
          <span>{{ amountWithCurrency(state.displayModel.loanAmount) }}</span>
        </div>
        <div v-if="isRepaymentState" class="order-detail-row">
          <span>{{ ORDER_DETAIL_TEXT.labels.receivedAmount }}</span>
          <span>{{ amountWithCurrency(state.displayModel.receivedAmount) }}</span>
        </div>
      </article>

      <article
        v-if="isRepaymentState"
        class="order-detail-card"
        :class="{ 'order-detail-card--penalty': state.rootState === 'overdue' }"
      >
        <div class="order-detail-row">
          <span>{{ ORDER_DETAIL_TEXT.labels.serviceFee }}</span>
          <span>{{ amountWithCurrency(state.displayModel.serviceFee) }}</span>
        </div>
        <div v-if="state.rootState === 'overdue'" class="order-detail-row">
          <span>{{ ORDER_DETAIL_TEXT.labels.penaltyFee }}</span>
          <span>{{ amountWithCurrency(String(state.displayModel.penaltyFee)) }}</span>
        </div>
      </article>

      <article class="order-detail-card">
        <div class="order-detail-row">
          <span>{{ ORDER_DETAIL_TEXT.labels.applicationDate }}</span>
          <span>{{ state.displayModel.applicationDate }}</span>
        </div>
        <div v-if="isRepaymentState" class="order-detail-row">
          <span>{{ ORDER_DETAIL_TEXT.labels.arrivalDate }}</span>
          <span>{{ state.displayModel.arrivalDate }}</span>
        </div>
      </article>

      <article class="order-detail-card">
        <div class="order-detail-row">
          <span>{{ ORDER_DETAIL_TEXT.labels.bankName }}</span>
          <span>{{ state.displayModel.bankName }}</span>
        </div>
        <div class="order-detail-row">
          <span>{{ ORDER_DETAIL_TEXT.labels.bankAccount }}</span>
          <span class="order-detail-row__account">{{ state.displayModel.bankAccount }}</span>
        </div>
      </article>

      <button
        v-if="showHistory"
        class="order-detail-card order-detail-history"
        type="button"
        :disabled="state.navigationLocked"
        @click="controller.requestHistory()"
      >
        <span>{{ ORDER_DETAIL_TEXT.labels.extensionHistory }}</span>
        <span class="order-detail-history__count">{{ historyCountText }}</span>
        <img :src="historyChevronAsset" alt="" />
      </button>
    </section>

    <footer
      v-if="isBusinessState && actionCount > 0"
      class="order-detail-actions"
      :class="actionCount === 2 ? 'order-detail-actions--double' : 'order-detail-actions--single'"
    >
      <button
        v-if="showExtensionAction"
        class="order-detail-action order-detail-action--secondary"
        type="button"
        :disabled="state.navigationLocked || state.paymentSubmitting"
        @click="controller.requestExtension()"
      >
        {{ ORDER_DETAIL_TEXT.actions.extension }}
      </button>
      <button
        v-if="showPaymentAction"
        class="order-detail-action order-detail-action--primary"
        type="button"
        :disabled="state.navigationLocked || state.paymentSubmitting"
        @click="controller.requestPayment()"
      >
        {{ ORDER_DETAIL_TEXT.actions.payNow }}
      </button>
      <button
        v-if="showReapplyAction"
        class="order-detail-action order-detail-action--primary"
        type="button"
        :disabled="state.navigationLocked"
        @click="controller.requestReapply()"
      >
        {{ ORDER_DETAIL_TEXT.actions.applyAgain }}
      </button>
      <button
        v-if="showBankAction"
        class="order-detail-action order-detail-action--primary"
        type="button"
        :disabled="state.navigationLocked"
        @click="controller.requestBankDetail()"
      >
        {{ ORDER_DETAIL_TEXT.actions.changeBankAccount }}
      </button>
    </footer>
  </main>
</template>
