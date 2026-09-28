<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { showToast } from 'vant'
import 'vant/es/toast/style'
import { useRoute, useRouter } from 'vue-router'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { hideNativeLoading, showNativeLoading } from '../../../shared/bridge/nativeLoading.js'
import { setPhysicalBackIntercept } from '../../../shared/bridge/nativePhysicalBackIntercept.js'
import { createBankDetailController } from '../bankDetailController.js'
import { BANK_DETAIL_TEXT, formatAccountLabel } from '../bankDetailText.js'
import { createBankDetailServices } from '../services/bankDetailServices.js'
import backAsset from '../../../assets/bankDetail/back.svg'
import bankSelectedAsset from '../../../assets/bankDetail/bank-selected.svg'
import bankUnselectedAsset from '../../../assets/bankDetail/bank-unselected.svg'
import checkAsset from '../../../assets/bankDetail/check.svg'
import emptyAsset from '../../../assets/bankDetail/empty.png'
import plusAsset from '../../../assets/bankDetail/plus.svg'
import './bankDetailPage.css'

const route = useRoute()
const router = useRouter()
const globalStore = useGlobalStore()
const state = ref(null)

function showMessage(message) {
  if (!message) return
  showToast({ message, forbidClick: true })
}

const controller = createBankDetailController({
  services: createBankDetailServices({ getGlobalState: () => globalStore }),
  showNativeLoading,
  hideNativeLoading,
  setPhysicalBackIntercept,
  onBusinessFailure: showMessage,
  onSuccessNotice: () => showMessage(BANK_DETAIL_TEXT.successToast),
  onNavigateBack() {
    const canGoBack = typeof window !== 'undefined' && Boolean(window.history.state?.back)
    if (canGoBack) router.back()
    else void router.replace({ name: 'home' })
  },
  async onNavigateAddPaymentMethod() {
    try {
      const failure = await router.push({ name: 'addPaymentMethod' })
      return failure === undefined
    } catch {
      return false
    }
  },
})

const unsubscribe = controller.subscribe((nextState) => { state.value = nextState })

onMounted(() => {
  controller.initialize(route.query)
})

onBeforeUnmount(() => {
  unsubscribe()
  controller.dispose()
})

function isSelected(account) {
  return state.value?.selectedAccountId === account.id
}

function showDefaultCard(account) {
  return isSelected(account) && account.markLoanCard === 1
}
</script>

<template>
  <main
    v-if="state"
    class="bank-detail-page"
    :class="{ 'bank-detail-page--loading': state.rootState === 'loading' }"
    :aria-busy="state.rootState === 'loading'"
  >
      <header class="bank-detail-header">
        <button
          class="bank-detail-header__back"
          type="button"
          :aria-label="BANK_DETAIL_TEXT.back"
          @click="controller.requestBack()"
        >
          <img :src="backAsset" alt="" aria-hidden="true" />
        </button>
        <h1>{{ BANK_DETAIL_TEXT.title }}</h1>
      </header>

      <div v-if="state.rootState !== 'loading'" class="bank-detail-scroll">
        <section v-if="state.rootState === 'list'" class="bank-detail-content" aria-label="Lista de cuentas">
          <div class="bank-detail-accounts">
            <button
              v-for="(account, index) in state.accounts"
              :key="`${index}-${account.accountLast4}`"
              class="bank-detail-account"
              :class="{
                'bank-detail-account--selected': isSelected(account),
                'bank-detail-account--default': showDefaultCard(account),
              }"
              type="button"
              :aria-pressed="isSelected(account)"
              :disabled="state.submitting || state.navigationLocked"
              @click="controller.selectAccount(account.id)"
            >
              <span class="bank-detail-account__icon" aria-hidden="true">
                <img
                  :src="isSelected(account) ? bankSelectedAsset : bankUnselectedAsset"
                  alt=""
                />
              </span>
              <span class="bank-detail-account__name">{{ formatAccountLabel(account) }}</span>
              <span class="bank-detail-account__control" aria-hidden="true">
                <img v-if="isSelected(account)" :src="checkAsset" alt="" />
              </span>
              <span v-if="showDefaultCard(account)" class="bank-detail-account__default">
                {{ BANK_DETAIL_TEXT.defaultCard }}
              </span>
            </button>
          </div>

          <button
            class="bank-detail-add"
            type="button"
            :disabled="state.submitting || state.navigationLocked"
            @click="controller.navigateAddPaymentMethod()"
          >
            <img :src="plusAsset" alt="" aria-hidden="true" />
            <span>{{ BANK_DETAIL_TEXT.addMethod }}</span>
          </button>
        </section>

        <section
          v-else-if="state.rootState === 'empty'"
          class="bank-detail-empty"
          aria-label="Sin cuentas agregadas"
        >
          <img :src="emptyAsset" alt="" aria-hidden="true" />
          <p>{{ BANK_DETAIL_TEXT.empty }}</p>
        </section>
      </div>

      <footer v-if="state.rootState === 'list'" class="bank-detail-footer">
        <button
          class="bank-detail-footer__submit"
          type="button"
          :disabled="!state.selectedAccountId || state.submitting || state.navigationLocked"
          @click="controller.submit()"
        >
          {{ BANK_DETAIL_TEXT.submit }}
        </button>
      </footer>
  </main>
</template>
