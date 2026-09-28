<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { showToast } from 'vant'
import 'vant/es/toast/style'
import { useRoute, useRouter } from 'vue-router'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { hideNativeLoading, showNativeLoading } from '../../../shared/bridge/nativeLoading.js'
import { setPhysicalBackIntercept } from '../../../shared/bridge/nativePhysicalBackIntercept.js'
import { createDeferHistoryController } from '../deferHistoryController.js'
import { DEFER_HISTORY_PHASE } from '../deferHistoryConstants.js'
import { createDeferHistoryServices } from '../services/deferHistoryServices.js'
import { DEFER_HISTORY_TEXT } from '../deferHistoryText.js'
import backAsset from '../assets/back.svg'
import './deferHistoryPage.css'

const route = useRoute()
const router = useRouter()
const globalStore = useGlobalStore()

function showMessage(message) {
  const text = typeof message === 'string' ? message.trim() : ''
  if (!text) return
  showToast({ message: text, forbidClick: true })
}

const controller = createDeferHistoryController({
  services: createDeferHistoryServices({ getGlobalState: () => globalStore }),
  showNativeLoading,
  hideNativeLoading,
  setPhysicalBackIntercept,
  onBusinessFailure: showMessage,
  onRequestFailure: showMessage,
  onNavigateBack() {
    const canGoBack = typeof window !== 'undefined' && Boolean(window.history.state?.back)
    if (canGoBack) router.back()
    else void router.replace({ name: 'home' })
  },
})

const state = ref(typeof controller.getState === 'function' ? controller.getState() : null)
const unsubscribe = controller.subscribe((nextState) => {
  state.value = nextState
})

onMounted(() => {
  if (!controller.initialize(route.query)) void router.replace({ name: 'home' })
})

onBeforeUnmount(() => {
  unsubscribe()
  controller.dispose()
})

const isLoading = computed(() => state.value?.phase === DEFER_HISTORY_PHASE.LOADING)
const isReady = computed(() => state.value?.phase === DEFER_HISTORY_PHASE.READY)
const records = computed(() => (Array.isArray(state.value?.records) ? state.value.records : []))

function applicationDate(record) {
  return record?.approvalDate ?? ''
}

function amount(record) {
  return record?.amountText ?? ''
}

function extendedTerm(record) {
  return record?.extendedTermText ?? ''
}

function updatedDueDate(record) {
  return record?.updatedDueDate ?? ''
}
</script>

<template>
  <main class="defer-history-page" :aria-busy="isLoading ? 'true' : 'false'">
    <header class="defer-history-header">
      <button
        class="defer-history-header__back"
        type="button"
        :aria-label="DEFER_HISTORY_TEXT.backLabel"
        :disabled="state?.navigationLocked"
        @click="controller.requestBack()"
      >
        <img :src="backAsset" alt="" />
      </button>
      <h1 class="defer-history-header__title">{{ DEFER_HISTORY_TEXT.pageTitle }}</h1>
    </header>

    <section class="defer-history-list">
      <template v-if="isReady">
        <article v-for="(record, index) in records" :key="index" class="defer-history-item">
          <h2 class="defer-history-item__title">{{ DEFER_HISTORY_TEXT.recordTitle }}</h2>
          <div class="defer-history-card">
            <div class="defer-history-card__row">
              <span class="defer-history-card__label">{{ DEFER_HISTORY_TEXT.applicationDate }}</span>
              <span class="defer-history-card__value">{{ applicationDate(record) }}</span>
            </div>
            <div class="defer-history-card__row">
              <span class="defer-history-card__label">{{ DEFER_HISTORY_TEXT.amount }}</span>
              <span class="defer-history-card__value defer-history-card__value--amount">{{ amount(record) }}</span>
            </div>
            <div class="defer-history-card__row">
              <span class="defer-history-card__label">{{ DEFER_HISTORY_TEXT.extendedTerm }}</span>
              <span class="defer-history-card__value">{{ extendedTerm(record) }}</span>
            </div>
            <div class="defer-history-card__row">
              <span class="defer-history-card__label">{{ DEFER_HISTORY_TEXT.updatedDueDate }}</span>
              <span class="defer-history-card__value">{{ updatedDueDate(record) }}</span>
            </div>
          </div>
        </article>
      </template>
    </section>
  </main>
</template>

