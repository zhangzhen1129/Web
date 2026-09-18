<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { showToast } from 'vant'
import 'vant/es/toast/style'
import { useRoute, useRouter } from 'vue-router'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { hideNativeLoading, showNativeLoading } from '../../../shared/bridge/nativeLoading.js'
import { openGooglePlayNative } from '../../../shared/bridge/nativeBusinessActions.js'
import { setPhysicalBackIntercept } from '../../../shared/bridge/nativePhysicalBackIntercept.js'
import { getProjectMessage } from '../../../shared/config/projectLanguage.js'
import { createDataCollectionService } from '../../dataCollection/index.js'
import LoadingBar from '../../dataCollection/components/LoadingBar.vue'
import backAsset from '../assets/back.svg'
import checkboxCheckedAsset from '../assets/checkbox-checked.svg'
import checkboxUncheckedAsset from '../assets/checkbox-unchecked.svg'
import interceptIconAsset from '../assets/intercept-icon.svg'
import reviewHeaderGradientAsset from '../assets/review-header-gradient.svg'
import reviewHeaderGradientLowAsset from '../assets/review-header-gradient-low.svg'
import reviewRefreshAsset from '../assets/review-refresh.svg'
import reviewStarAsset from '../assets/review-star.png'
import reviewStarLowAsset from '../assets/review-star-low.png'
import starEmptyAsset from '../assets/star-empty.png'
import starFilledAsset from '../assets/star-filled.png'
import successIllustrationAsset from '../assets/success-illustration.png'
import vipBadgeAsset from '../assets/vip-badge.png'
import { formatDecimalString } from '../loanSuccessAmount.js'
import { createLoanSuccessController } from '../loanSuccessController.js'
import { LOAN_SUCCESS_TEXT } from '../loanSuccessText.js'
import { createLoanSuccessServices } from '../services/loanSuccessServices.js'
import './loanSuccessPage.css'

const route = useRoute()
const router = useRouter()
const globalStore = useGlobalStore()
const state = ref(null)
const dataCollectionService = createDataCollectionService()

async function copyText(value) {
  if (typeof value !== 'string' || value.length === 0) return false
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {}
  try {
    const input = document.createElement('textarea')
    input.value = value
    input.setAttribute('readonly', '')
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.select()
    const copied = document.execCommand('copy')
    input.remove()
    return copied
  } catch {
    return false
  }
}

function showMessage(message) {
  if (!message) return
  showToast({ message, forbidClick: true })
}

const controller = createLoanSuccessController({
  services: createLoanSuccessServices({ getGlobalState: () => globalStore }),
  triggerUpload: dataCollectionService.triggerUpload,
  uploadFailureMessage: getProjectMessage('41'),
  showNativeLoading,
  hideNativeLoading,
  setPhysicalBackIntercept,
  openGooglePlay: openGooglePlayNative,
  copyText,
  onBusinessFailure: showMessage,
  onUploadFailure: showMessage,
  onSuccessNotice: () => showMessage(LOAN_SUCCESS_TEXT.successToast),
  onCopySuccess: () => showMessage(LOAN_SUCCESS_TEXT.copySuccess),
  onCopyFailure: () => showMessage(LOAN_SUCCESS_TEXT.copyFailure),
  onNavigateOrderList() {
    void router.replace({ name: 'orderList' })
  },
  onNavigateOrderDetail({ orderId }) {
    void router.push({ name: 'orderDetail', query: { orderId } })
  },
  onNavigateBack() {
    const canGoBack = typeof window !== 'undefined' && Boolean(window.history.state?.back)
    if (canGoBack) router.back()
    else void router.replace({ name: 'home' })
  },
})

const unsubscribe = controller.subscribe((nextState) => { state.value = nextState })

onMounted(() => controller.initialize(route.query))
onBeforeUnmount(() => {
  unsubscribe()
  controller.dispose()
})

const isRecommendation = computed(() => state.value?.rootState === 'recommendation')
const isOrderList = computed(() => state.value?.rootState === 'order_list')
const isEmptyResult = computed(() => state.value?.rootState === 'empty_result')
const isLoading = computed(() => state.value?.rootState === 'loading')
const isReviewVisible = computed(() => state.value?.overlay === 'review_prompt' || state.value?.overlay === 'review_submitting')
const isReviewHighRating = computed(() => state.value?.reviewRating >= 4)
const isReviewSubmitting = computed(() => state.value?.reviewSubmitting === true)
const productCountText = computed(() => LOAN_SUCCESS_TEXT.productCountTemplate.replace('{count}', String(state.value?.selectedCount ?? 0)))
const applyButtonText = computed(() => LOAN_SUCCESS_TEXT.applyButtonTemplate.replace('{amount}', state.value?.selectedAmount || '0'))

function productAmountText(product) {
  return `S/ ${formatDecimalString(product.minAmount)}`
}

function orderAmountText(order) {
  return `S/ ${formatDecimalString(order.approvalAmount)}`
}

function productSelected(product) {
  return state.value?.selectedIds.includes(product.id) === true
}

function reviewStarSource(index) {
  return index <= state.value?.reviewRating ? starFilledAsset : starEmptyAsset
}

function handleReviewInput(event) {
  controller.setReviewContent(event.target.value)
}

function openOrder(order) {
  if (!order?.orderId) return
  void router.push({ name: 'orderDetail', query: { orderId: order.orderId } })
}
</script>

<template>
  <main
    v-if="state"
    class="loan-success-page"
    :aria-busy="isLoading || state.submitting ? 'true' : 'false'"
  >
    <template v-if="state.rootState !== 'inactive'">
      <header class="loan-success-header">
        <nav class="loan-success-header__nav" aria-label="Navegación del préstamo">
          <button
            class="loan-success-header__back"
            type="button"
            :aria-label="LOAN_SUCCESS_TEXT.backLabel"
            :disabled="state.navigationLocked"
          @click="controller?.requestBack()"
          >
            <img :src="backAsset" alt="" />
          </button>
          <h1>{{ LOAN_SUCCESS_TEXT.pageTitle }}</h1>
        </nav>
      </header>

      <div class="loan-success-scroll">
        <section class="loan-success-hero">
          <img class="loan-success-hero__illustration" :src="successIllustrationAsset" alt="" />
          <h2 v-if="isRecommendation || isEmptyResult">
            {{ isRecommendation ? LOAN_SUCCESS_TEXT.successTitle : LOAN_SUCCESS_TEXT.emptyResultTitle }}
          </h2>
          <p v-if="isRecommendation">{{ LOAN_SUCCESS_TEXT.successDescription }}</p>
        </section>

        <button
          v-if="isRecommendation"
          class="loan-success-primary"
          type="button"
          :disabled="state.submitting || state.navigationLocked || state.selectedCount < 1"
          @click="controller?.submitRecommendation()"
        >
          {{ applyButtonText }}
        </button>

        <section v-if="isRecommendation" class="loan-success-vip" aria-label="VIP">
          <img class="loan-success-vip__badge" :src="vipBadgeAsset" alt="" />
          <p>{{ LOAN_SUCCESS_TEXT.vipDescription }}</p>
        </section>

        <section v-if="isRecommendation" class="loan-success-products" aria-label="Productos recomendados">
          <h2>{{ productCountText }}</h2>
          <button
            v-for="product in state.products"
            :key="product.id"
            class="loan-success-product"
            :class="{ 'loan-success-product--selected': productSelected(product) }"
            type="button"
            :aria-pressed="productSelected(product)"
            @click="controller?.toggleProduct(product.id)"
          >
            <img class="loan-success-product__icon" :src="product.icon" alt="" />
            <span class="loan-success-product__content">
              <strong>{{ product.productName }}</strong>
              <span class="loan-success-product__amount-row">
                <span>{{ LOAN_SUCCESS_TEXT.productAmountLabel }}</span>
                <span class="loan-success-product__amount">{{ productAmountText(product) }}</span>
              </span>
            </span>
            <img
              class="loan-success-product__check"
              :src="productSelected(product) ? checkboxCheckedAsset : checkboxUncheckedAsset"
              alt=""
            />
          </button>
        </section>

        <button
          v-if="isOrderList || isEmptyResult"
          class="loan-success-primary loan-success-primary--result"
          type="button"
          :disabled="state.navigationLocked"
          @click="controller?.openReviewFromMain()"
        >
          {{ isOrderList ? LOAN_SUCCESS_TEXT.orderListButton : LOAN_SUCCESS_TEXT.emptyResultButton }}
        </button>

        <section v-if="isOrderList" class="loan-success-orders" aria-label="Órdenes">
          <button
            v-for="order in state.orders"
            :key="`${order.orderId}-${order.productName}-${order.approvalAmount}`"
            class="loan-success-order"
            type="button"
            :disabled="state.navigationLocked || order.orderId.length === 0"
            @click="openOrder(order)"
          >
            <img class="loan-success-order__icon" :src="order.productIcon" alt="" />
            <span class="loan-success-order__content">
              <strong>{{ order.productName }}</strong>
              <span>{{ LOAN_SUCCESS_TEXT.productAmountLabel }}</span>
              <span class="loan-success-order__amount">{{ orderAmountText(order) }}</span>
            </span>
            <span class="loan-success-order__status">{{ order.orderStatusText }}</span>
          </button>
        </section>
      </div>
    </template>

    <div v-if="state.overlay === 'back_intercept'" class="loan-success-mask">
      <section class="loan-success-intercept" role="dialog" aria-modal="true">
        <div class="loan-success-intercept__icon">
          <img :src="interceptIconAsset" alt="" />
        </div>
        <p class="loan-success-intercept__description">{{ LOAN_SUCCESS_TEXT.interceptDescription }}</p>
        <p class="loan-success-intercept__countdown-label">{{ LOAN_SUCCESS_TEXT.interceptCountdownLabel }}</p>
        <p class="loan-success-intercept__countdown">{{ LOAN_SUCCESS_TEXT.interceptCountdownValue }}</p>
        <button class="loan-success-modal__primary" type="button" @click="controller?.closeBackIntercept()">
          {{ LOAN_SUCCESS_TEXT.interceptContinue }}
        </button>
        <button class="loan-success-modal__cancel" type="button" @click="controller?.cancelBackIntercept()">
          {{ LOAN_SUCCESS_TEXT.cancel }}
        </button>
      </section>
    </div>

    <div v-if="isReviewVisible" class="loan-success-mask">
      <section class="loan-success-review" role="dialog" aria-modal="true" :aria-label="LOAN_SUCCESS_TEXT.reviewTitle">
        <header
          class="loan-success-review__header"
          :style="{ backgroundImage: `url(${isReviewHighRating ? reviewHeaderGradientAsset : reviewHeaderGradientLowAsset})` }"
        >
          <img
            class="loan-success-review__star"
            :src="isReviewHighRating ? reviewStarAsset : reviewStarLowAsset"
            alt=""
          />
          <h2>{{ LOAN_SUCCESS_TEXT.reviewTitle }}</h2>
          <div class="loan-success-review__rating" aria-label="Calificación">
            <button
              v-for="rating in 5"
              :key="rating"
              type="button"
              :aria-label="`${rating}`"
              :disabled="isReviewSubmitting"
              @click="controller?.setReviewRating(rating)"
            >
              <img :src="reviewStarSource(rating)" alt="" />
            </button>
          </div>
        </header>

        <div class="loan-success-review__body">
          <template v-if="isReviewHighRating">
            <div class="loan-success-review__label-row">
              <span>{{ LOAN_SUCCESS_TEXT.reviewRecommendedLabel }}</span>
              <button type="button" :disabled="isReviewSubmitting" @click="controller?.refreshRecommendedComment()">
                <img :src="reviewRefreshAsset" alt="" />
              </button>
            </div>
            <div class="loan-success-review__comment">{{ state.recommendedComment }}</div>
          </template>
          <textarea
            v-else
            class="loan-success-review__textarea"
            :value="state.reviewContent"
            :placeholder="LOAN_SUCCESS_TEXT.reviewPlaceholder"
            maxlength="100"
            :disabled="isReviewSubmitting"
            @input="handleReviewInput"
          />
        </div>

        <footer class="loan-success-review__actions">
          <button
            class="loan-success-modal__primary"
            type="button"
            :disabled="isReviewSubmitting"
            @click="controller?.submitReview()"
          >
            {{ isReviewHighRating ? LOAN_SUCCESS_TEXT.reviewCopySubmit : LOAN_SUCCESS_TEXT.reviewSubmit }}
          </button>
          <button class="loan-success-modal__cancel" type="button" :disabled="isReviewSubmitting" @click="controller?.cancelReview()">
            {{ LOAN_SUCCESS_TEXT.cancel }}
          </button>
        </footer>
      </section>
    </div>

    <LoadingBar :status="state.loadingBarStatus" />
  </main>
</template>
