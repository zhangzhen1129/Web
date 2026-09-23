<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Loading, PullRefresh, Skeleton, showToast } from 'vant'
import 'vant/es/loading/style'
import 'vant/es/pull-refresh/style'
import 'vant/es/skeleton/style'
import 'vant/es/toast/style'
import { useRouter } from 'vue-router'
import { useGlobalStore } from '../../../shared/globalStore/globalStore.js'
import { hideNativeLoading, showNativeLoading } from '../../../shared/bridge/nativeLoading.js'
import backAsset from '../../../assets/orderList/back.svg'
import emptyStateAsset from '../../../assets/orderList/empty-state.png'
import OrderListCard from '../components/OrderListCard.vue'
import { ORDER_LIST_FILTERS, ORDER_LIST_ROOT_STATE } from '../orderListConstants.js'
import { createOrderListController } from '../orderListController.js'
import { ORDER_LIST_TEXT } from '../orderListText.js'
import { createOrderListService } from '../services/orderListService.js'
import './orderListPage.css'

defineOptions({ name: 'OrderListPage' })

const router = useRouter()
const globalStore = useGlobalStore()
const state = ref(null)

function showMessage(message) {
  if (!message) return
  showToast({ message, forbidClick: true })
}

const controller = createOrderListController({
  service: createOrderListService({ getGlobalState: () => globalStore }),
  showNativeLoading,
  hideNativeLoading,
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

onMounted(() => {
  controller.start()
})

onBeforeUnmount(() => {
  unsubscribe()
  controller.dispose()
})

const rootState = computed(() => state.value?.rootState ?? ORDER_LIST_ROOT_STATE.LOADING)
const isLoading = computed(() => rootState.value === ORDER_LIST_ROOT_STATE.LOADING)
const isList = computed(() => rootState.value === ORDER_LIST_ROOT_STATE.LIST)
const isEmpty = computed(() => rootState.value === ORDER_LIST_ROOT_STATE.EMPTY)
const isError = computed(() => rootState.value === ORDER_LIST_ROOT_STATE.ERROR)
const navigationLocked = computed(() => state.value?.navigationLocked === true)
const canPullRefresh = computed(() => isList.value || isEmpty.value || isError.value)
const showFilters = computed(
  () => (isList.value || isEmpty.value) && (state.value?.allOrders.length ?? 0) > 0,
)
const filterOptions = computed(() => ORDER_LIST_FILTERS.map((key) => ({
  key,
  text: ORDER_LIST_TEXT.filters[key],
  selected: state.value?.activeFilter === key,
})))
const pullRefreshing = ref(false)

watch(
  () => state.value?.refreshing === true,
  (refreshing) => {
    pullRefreshing.value = refreshing
  },
  { immediate: true },
)

function handleRefresh() {
  if (!controller.refresh()) pullRefreshing.value = false
}

function handleBack() {
  const canGoBack = typeof window !== 'undefined' && Boolean(window.history.state?.back)
  if (canGoBack) router.back()
  else void router.replace({ name: 'home' })
}
</script>

<template>
  <main class="order-list-page" :aria-busy="isLoading ? 'true' : 'false'">
    <PullRefresh
      v-model="pullRefreshing"
      class="order-list-page__refresh"
      :disabled="!canPullRefresh"
      :head-height="52"
      :pull-distance="72"
      @refresh="handleRefresh"
    >
      <template #pulling><Loading type="spinner" size=".8rem" /></template>
      <template #loosing><Loading type="spinner" size=".8rem" /></template>
      <template #loading><Loading type="spinner" size=".8rem" /></template>

      <header class="order-list-header">
        <button
          class="order-list-header__back"
          type="button"
          :aria-label="ORDER_LIST_TEXT.back"
          :disabled="navigationLocked"
          @click="handleBack"
        >
          <img :src="backAsset" alt="" />
        </button>
        <h1 class="order-list-header__title">{{ ORDER_LIST_TEXT.title }}</h1>
      </header>

      <section
        v-if="isLoading"
        class="order-list-loading"
        :aria-label="ORDER_LIST_TEXT.loadingLabel"
      >
        <Skeleton
          v-for="index in 4"
          :key="index"
          class="order-list-skeleton-card"
          :row="4"
          animate
        />
      </section>

      <template v-else>
        <nav v-if="showFilters" class="order-list-filters">
          <button
            v-for="filter in filterOptions"
            :key="filter.key"
            class="order-list-filter"
            :class="{ 'order-list-filter--active': filter.selected }"
            type="button"
            :aria-pressed="filter.selected ? 'true' : 'false'"
            @click="controller.setFilter(filter.key)"
          >
            {{ filter.text }}
          </button>
        </nav>

        <section v-if="isList" class="order-list-items">
          <OrderListCard
            v-for="order in state.visibleOrders"
            :key="order.key"
            :order="order"
            :disabled="navigationLocked"
            @open="controller.requestOrderAction"
          />
        </section>

        <section v-else-if="isEmpty" class="order-list-empty">
          <img class="order-list-empty__image" :src="emptyStateAsset" alt="" />
          <p class="order-list-empty__text">{{ ORDER_LIST_TEXT.empty.message }}</p>
          <button
            class="order-list-empty__action"
            type="button"
            :disabled="navigationLocked"
            @click="controller.requestHome()"
          >
            {{ ORDER_LIST_TEXT.empty.action }}
          </button>
        </section>

        <section v-else-if="isError" class="order-list-error" role="alert">
          <p>{{ state.errorMessage || ORDER_LIST_TEXT.error.message }}</p>
        </section>
      </template>
    </PullRefresh>
  </main>
</template>
