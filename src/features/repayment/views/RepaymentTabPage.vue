<script setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { showToast, Skeleton } from 'vant'
import 'vant/es/skeleton/style'
import 'vant/es/toast/style'
import { useRouter } from 'vue-router'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { hideNativeLoading, showNativeLoading } from '../../../shared/bridge/nativeLoading.js'
import { setRepaymentCount } from '../../shell/appModeStore.js'
import OverdueOrderCard from '../components/OverdueOrderCard.vue'
import RepayingOrderCard from '../components/RepayingOrderCard.vue'
import { REPAYMENT_ROOT_STATE } from '../repaymentConstants.js'
import { createRepaymentController } from '../repaymentController.js'
import { REPAYMENT_TEXT } from '../repaymentText.js'
import { createRepaymentOrderListService } from '../services/repaymentOrderListService.js'
import emptyStateAsset from '../../../assets/repayment/empty-state.png'
import './repaymentPage.css'

defineOptions({ name: 'RepaymentPage' })

const router = useRouter()
const globalStore = useGlobalStore()
const state = ref(null)
let hasBeenActivated = false

function showMessage(message) {
  if (!message) return
  showToast({ message, forbidClick: true })
}

const controller = createRepaymentController({
  service: createRepaymentOrderListService({
    getGlobalState: () => globalStore,
  }),
  showNativeLoading,
  hideNativeLoading,
  setRepaymentCount,
  navigateOrderDetail({ orderId }) {
    void router.push({ name: 'orderDetail', query: { orderId } })
  },
  navigateHome() {
    void router.replace({ name: 'home' })
  },
  onBusinessFailure: showMessage,
  onRequestFailure: showMessage,
})

const unsubscribe = controller.subscribe((nextState) => {
  state.value = nextState
})

const isLoading = computed(() => state.value?.rootState === REPAYMENT_ROOT_STATE.LOADING)
const isList = computed(() => state.value?.rootState === REPAYMENT_ROOT_STATE.LIST)
const isEmpty = computed(() => state.value?.rootState === REPAYMENT_ROOT_STATE.EMPTY)
const isError = computed(() => state.value?.rootState === REPAYMENT_ROOT_STATE.ERROR)

onMounted(() => {
  controller.start()
})

onActivated(() => {
  if (hasBeenActivated) controller.activate()
  hasBeenActivated = true
})

onDeactivated(() => {
  controller.deactivate()
})

onBeforeUnmount(() => {
  unsubscribe()
  controller.dispose()
  hasBeenActivated = false
})
</script>

<template>
  <main
    v-if="state"
    class="repayment-page"
    :aria-busy="isLoading ? 'true' : 'false'"
  >
    <section v-if="isLoading" class="repayment-page__loading" :aria-label="REPAYMENT_TEXT.loadingLabel">
      <Skeleton
        v-for="index in 4"
        :key="index"
        class="repayment-page__skeleton-card"
        :row="4"
        animate
      />
    </section>

    <section v-else-if="isList" class="repayment-page__list">
      <template v-for="order in state.orders" :key="order.key">
        <RepayingOrderCard
          v-if="order.statusKey === 'repaying'"
          :order="order"
          :disabled="state.navigationLocked"
          @open="controller.requestOrderDetail"
        />
        <OverdueOrderCard
          v-else
          :order="order"
          :disabled="state.navigationLocked"
          @open="controller.requestOrderDetail"
        />
      </template>
    </section>

    <section v-else-if="isEmpty" class="repayment-page__empty">
      <img class="repayment-page__empty-image" :src="emptyStateAsset" alt="" />
      <p class="repayment-page__empty-text">{{ REPAYMENT_TEXT.empty.message }}</p>
      <button
        class="repayment-page__empty-action"
        type="button"
        :disabled="state.navigationLocked"
        @click="controller.requestHome()"
      >
        {{ REPAYMENT_TEXT.empty.action }}
      </button>
    </section>

    <section v-else-if="isError" class="repayment-page__error" role="alert">
      <p>{{ state.errorMessage || REPAYMENT_TEXT.error.message }}</p>
    </section>
  </main>
</template>
