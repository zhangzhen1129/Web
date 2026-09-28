<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { showToast } from 'vant'
import 'vant/es/toast/style'
import { useRoute, useRouter } from 'vue-router'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { hideNativeLoading, showNativeLoading } from '../../../shared/bridge/nativeLoading.js'
import { setPhysicalBackIntercept } from '../../../shared/bridge/nativePhysicalBackIntercept.js'
import { openPrivacyAgreementInAppNat } from '../../../shared/bridge/nativePrivacyAgreement.js'
import { createOrderDeferralController, ORDER_DEFERRAL_PHASE } from '../orderDeferralController.js'
import { fillDeferralTemplate } from '../orderDeferralDisplay.js'
import { ORDER_DEFERRAL_TEXT } from '../orderDeferralText.js'
import { createOrderDeferralServices } from '../services/orderDeferralServices.js'
import backAsset from '../assets/back.svg'
import chevronAsset from '../assets/chevron.svg'
import customerServiceAsset from '../assets/customer-service.svg'
import progressActiveAsset from '../assets/progress-active.svg'
import progressInactiveAsset from '../assets/progress-inactive.svg'
import summaryCalendarBaseAsset from '../assets/summary-calendar-base.svg'
import './orderDeferralPage.css'

const route = useRoute()
const router = useRouter()
const globalStore = useGlobalStore()
const state = ref(null)

function showMessage(message) {
  if (!message) return
  showToast({ message, forbidClick: true })
}

const controller = createOrderDeferralController({
  services: createOrderDeferralServices({ getGlobalState: () => globalStore }),
  showNativeLoading,
  hideNativeLoading,
  setPhysicalBackIntercept,
  openPaymentPage: openPrivacyAgreementInAppNat,
  onBusinessFailure: showMessage,
  onRequestFailure: showMessage,
  onNavigateBack() {
    const canGoBack = typeof window !== 'undefined' && Boolean(window.history.state?.back)
    if (canGoBack) router.back()
    else void router.replace({ name: 'home' })
  },
  onNavigateHelpCenter() {
    void router.push({ name: 'helpCenter' })
  },
})

const unsubscribe = controller.subscribe((nextState) => { state.value = nextState })

onMounted(() => {
  if (!controller.initialize(route.query)) void router.replace({ name: 'home' })
})

onBeforeUnmount(() => {
  unsubscribe()
  controller.dispose()
})

const isLoading = computed(() => state.value?.phase === ORDER_DEFERRAL_PHASE.LOADING)
const isReady = computed(() => state.value?.phase === ORDER_DEFERRAL_PHASE.READY)
const summaryTitle = computed(() => fillDeferralTemplate(ORDER_DEFERRAL_TEXT.summaryTitleTemplate, {
  days: state.value?.displayModel.extensionDaysText ?? '',
}))
const summaryDescription = computed(() => fillDeferralTemplate(ORDER_DEFERRAL_TEXT.summaryDescriptionTemplate, {
  amount: state.value?.displayModel.paymentAmountText ?? '',
  days: state.value?.displayModel.extensionDaysText ?? '',
}))
const noticeText = computed(() => fillDeferralTemplate(ORDER_DEFERRAL_TEXT.noticeTemplate, {
  days: state.value?.displayModel.extensionDaysText ?? '',
}))
</script>

<template>
  <main
    v-if="state"
    class="order-deferral-page"
    :aria-busy="isLoading || state.submitting ? 'true' : 'false'"
  >
    <section class="order-deferral-hero">
      <header class="order-deferral-header">
        <button
          class="order-deferral-header__back"
          type="button"
          :aria-label="ORDER_DEFERRAL_TEXT.backLabel"
          :disabled="state.navigationLocked"
          @click="controller.requestBack()"
        >
          <img :src="backAsset" alt="" />
        </button>
        <h1>{{ ORDER_DEFERRAL_TEXT.pageTitle }}</h1>
        <button
          class="order-deferral-header__help"
          type="button"
          :aria-label="ORDER_DEFERRAL_TEXT.helpLabel"
          :disabled="state.navigationLocked"
          @click="controller.requestHelp()"
        >
          <img :src="customerServiceAsset" alt="" />
        </button>
      </header>

      <article v-if="state.entryValid" class="order-deferral-summary">
        <div class="order-deferral-summary__icon" aria-hidden="true">
          <img :src="summaryCalendarBaseAsset" alt="" />
          <span>{{ state.displayModel.extensionDaysText }}</span>
        </div>
        <h2>{{ summaryTitle }}</h2>
        <p>{{ summaryDescription }}</p>
      </article>
    </section>

    <template v-if="state.entryValid">
      <section class="order-deferral-content">
        <article class="order-deferral-date-card">
          <div class="order-deferral-timeline" aria-hidden="true">
            <img :src="progressActiveAsset" alt="" />
            <span></span>
            <img :src="progressInactiveAsset" alt="" />
          </div>
          <div class="order-deferral-date-rows">
            <div class="order-deferral-date-row">
              <span>{{ ORDER_DEFERRAL_TEXT.applicationDate }}</span>
              <span>{{ state.displayModel.applicationDate }}</span>
            </div>
            <div class="order-deferral-date-row">
              <span>{{ ORDER_DEFERRAL_TEXT.dueDate }}</span>
              <span>{{ state.displayModel.dueDate }}</span>
            </div>
          </div>
        </article>

        <article class="order-deferral-fee-card">
          <button
            class="order-deferral-fee-trigger"
            type="button"
            aria-controls="order-deferral-cost-detail"
            :aria-expanded="state.expanded ? 'true' : 'false'"
            @click="controller.toggleDetails()"
          >
            <span>{{ ORDER_DEFERRAL_TEXT.detailsTrigger }}</span>
            <img
              :class="{ 'order-deferral-fee-trigger__icon--expanded': state.expanded }"
              :src="chevronAsset"
              alt=""
            />
          </button>
          <div
            v-if="state.expanded"
            id="order-deferral-cost-detail"
            class="order-deferral-cost-detail"
            :aria-label="ORDER_DEFERRAL_TEXT.detailsRegionLabel"
          >
            <div class="order-deferral-cost-row">
              <span>{{ ORDER_DEFERRAL_TEXT.serviceFee }}</span>
              <span>{{ state.displayModel.serviceFeeText }}</span>
            </div>
            <div class="order-deferral-cost-row">
              <span>{{ ORDER_DEFERRAL_TEXT.overdueFee }}</span>
              <span>{{ state.displayModel.overdueFeeText }}</span>
            </div>
          </div>
        </article>

        <div class="order-deferral-notice">
          <p>{{ ORDER_DEFERRAL_TEXT.noticeLabel }}</p>
          <p>{{ noticeText }}</p>
        </div>
      </section>

      <footer class="order-deferral-footer">
        <button
          class="order-deferral-submit"
          type="button"
          :disabled="!isReady || state.submitting || state.navigationLocked"
          @click="controller.requestSubmit()"
        >
          {{ ORDER_DEFERRAL_TEXT.submitAction }}
        </button>
      </footer>
    </template>
  </main>
</template>
