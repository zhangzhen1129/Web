<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { showToast } from 'vant'
import 'vant/es/toast/style'
import { useRoute, useRouter } from 'vue-router'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { hideNativeLoading, showNativeLoading } from '../../../shared/bridge/nativeLoading.js'
import { setPhysicalBackIntercept } from '../../../shared/bridge/nativePhysicalBackIntercept.js'
import { getProjectMessage } from '../../../shared/config/projectLanguage.js'
import { createDataCollectionService } from '../../dataCollection/index.js'
import LoadingBar from '../../dataCollection/components/LoadingBar.vue'
import accountAsset from '../assets/account.svg'
import backAsset from '../assets/back.svg'
import bankAsset from '../assets/bank.svg'
import calendarAsset from '../assets/calendar.svg'
import receiptAsset from '../assets/receipt.svg'
import { createLoanConfirmController } from '../loanConfirmController.js'
import { createLoanConfirmServices } from '../services/loanConfirmServices.js'
import './loanConfirmPage.css'

const route = useRoute()
const router = useRouter()
const globalStore = useGlobalStore()
const state = ref(null)
const dataCollectionService = createDataCollectionService()

const controller = createLoanConfirmController({
  services: createLoanConfirmServices({ getGlobalState: () => globalStore }),
  triggerUpload: dataCollectionService.triggerUpload,
  uploadFailureMessage: getProjectMessage('41'),
  showNativeLoading,
  hideNativeLoading,
  setPhysicalBackIntercept,
  onBusinessFailure(message) {
    if (message) showToast({ message, forbidClick: true })
  },
  onUploadFailure(message) {
    if (message) showToast({ message, forbidClick: true })
  },
  onNavigateLoanSuccess({ systemTime }) {
    void router.replace({ name: 'loanSuccess', query: { systemTime } })
  },
  onNavigateLoanFail({ orderId }) {
    void router.replace({ name: 'loanFail', query: { orderId } })
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
</script>

<template>
  <main
    v-if="state"
    class="loan-confirm-page"
    :aria-busy="state.initialLoading || state.submitting ? 'true' : 'false'"
  >
    <header class="loan-confirm-header">
      <nav class="loan-confirm-header__nav" aria-label="Navegación del préstamo">
        <button
          class="loan-confirm-header__back"
          type="button"
          aria-label="Volver"
          :disabled="!state.entryValid || state.navigationLocked"
          @click="controller.requestBack()"
        >
          <img :src="backAsset" alt="" />
        </button>
        <h1>Confirmación del préstamo</h1>
      </nav>

      <section class="loan-confirm-amount" aria-label="Monto del préstamo">
        <p class="loan-confirm-amount__label">Monto del préstamo</p>
        <p class="loan-confirm-amount__value">
          <span>S/</span>
          <strong>{{ state.displayModel.loanAmount }}</strong>
        </p>
      </section>
    </header>

    <section class="loan-confirm-content" aria-label="Detalles de la solicitud">
      <article class="loan-confirm-card loan-confirm-card--two">
        <div class="loan-confirm-row">
          <img class="loan-confirm-row__icon" :src="receiptAsset" alt="" />
          <span class="loan-confirm-row__label">Monto total de recibo</span>
          <span class="loan-confirm-row__value">
            <span v-if="state.displayModel.receivedAmount" class="loan-confirm-row__currency">S/</span>
            {{ state.displayModel.receivedAmount }}
          </span>
        </div>
        <div class="loan-confirm-row">
          <img class="loan-confirm-row__icon" :src="receiptAsset" alt="" />
          <span class="loan-confirm-row__label">Monto total de reembolso</span>
          <span class="loan-confirm-row__value">
            <span v-if="state.displayModel.repaymentAmount" class="loan-confirm-row__currency">S/</span>
            {{ state.displayModel.repaymentAmount }}
          </span>
        </div>
      </article>

      <article class="loan-confirm-card loan-confirm-card--two">
        <div class="loan-confirm-row">
          <img class="loan-confirm-row__icon" :src="calendarAsset" alt="" />
          <span class="loan-confirm-row__label">Fecha de aplicación</span>
          <span class="loan-confirm-row__value">{{ state.displayModel.applicationDate }}</span>
        </div>
        <div class="loan-confirm-row">
          <img class="loan-confirm-row__icon" :src="calendarAsset" alt="" />
          <span class="loan-confirm-row__label">Fecha de reembolso</span>
          <span class="loan-confirm-row__value">{{ state.displayModel.repaymentDate }}</span>
        </div>
      </article>

      <article class="loan-confirm-card loan-confirm-card--bank">
        <div class="loan-confirm-row">
          <img class="loan-confirm-row__icon" :src="bankAsset" alt="" />
          <span class="loan-confirm-row__label">Nombre del banco</span>
          <span class="loan-confirm-row__value">{{ state.displayModel.bankName }}</span>
        </div>
        <div class="loan-confirm-row loan-confirm-row--account">
          <img class="loan-confirm-row__icon" :src="accountAsset" alt="" />
          <span class="loan-confirm-row__label">Número de cuenta bancaria</span>
          <span class="loan-confirm-row__value">{{ state.displayModel.bankAccount }}</span>
        </div>
      </article>
    </section>

    <footer class="loan-confirm-footer">
      <button
        class="loan-confirm-footer__submit"
        type="button"
        :disabled="!state.entryValid || state.submitting || state.navigationLocked"
        @click="controller.confirmApplication()"
      >
        Confirme el préstamo
      </button>
    </footer>

    <LoadingBar :status="state.loadingBarStatus" />
  </main>
</template>
