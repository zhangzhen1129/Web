<script setup>
import { computed, ref, watch } from 'vue'
import HomeBroadcast from './HomeBroadcast.vue'
import HomeError from './HomeError.vue'
import HomeSteps from './HomeSteps.vue'
import lockIcon from '../../../assets/home/lock.svg'
import refreshIcon from '../../../assets/home/refresh.svg'

defineOptions({ name: 'MultiPushHome' })
const props = defineProps({
  data: { type: Object, default: null },
  broadcastIndex: { type: Number, default: 0 },
  creditRefreshPending: { type: Boolean, default: false },
})
const emit = defineEmits(['action'])
const isSelectorOpen = ref(false)
const submitted = ref(false)
const state = computed(() => {
  if (props.data?.primaryAction === 'apply') return 'available-and-active'
  if (props.data?.primaryAction === 'repay') return 'active-only'
  if (props.data?.primaryAction === 'processing') return 'processing-only'
  return 'invalid'
})
const products = computed(() => (props.data?.products ?? []).filter((item) => item.selectable === true))
const selectedProducts = computed(() => products.value.filter((item) => item.selected === true))
const canSubmit = computed(() => selectedProducts.value.length >= (props.data?.minimumSelectionCount ?? 1))
const broadcastItem = computed(() => props.data?.broadcast?.items?.[props.broadcastIndex] || null)
const canRefreshCredit = computed(() => !props.data?.locked && props.data?.refreshEnabled === true)
watch(() => props.data, () => { submitted.value = false })
function openSelector() { if (products.value.length > 0) isSelectorOpen.value = true }
function closeSelector() { isSelectorOpen.value = false }
function toggleProduct(product) {
  if (product.selected && selectedProducts.value.length <= (props.data?.minimumSelectionCount ?? 1)) return
  emit('action', { type: 'TOGGLE_PRODUCT_SELECTION', productId: product.id, selected: !product.selected })
}
function submitSelection() {
  if (!canSubmit.value || submitted.value) return
  submitted.value = true
  emit('action', { type: 'SUBMIT_SELECTED_PRODUCTS', productIds: selectedProducts.value.map((item) => item.id) })
  closeSelector()
}
function primaryAction() {
  if (props.data?.primaryAction !== 'processing') emit('action', { type: 'PRIMARY_ACTION' })
}
function refreshCredit() {
  if (canRefreshCredit.value && !props.creditRefreshPending) emit('action', { type: 'REFRESH_CREDIT' })
}

function isApprovedIconUrl(value) {
  return typeof value === 'string' && (/^https:\/\//.test(value) || value.startsWith('/'))
}
</script>

<template>
  <main class="multi-push-home" :class="`multi-push-home--${state}`">
    <template v-if="state !== 'invalid'">
      <HomeBroadcast :item="broadcastItem" />
      <section class="multi-push-home__content">
        <HomeSteps :title="data.titleText" :steps="data.steps" />
        <section class="multi-push-credit">
          <h1>{{ data.availableLabelText }}</h1>
          <strong>{{ data.selectedMinimumAmount || data.availableAmount }}</strong>
          <img v-if="data.locked" class="multi-push-credit__lock" :src="lockIcon" alt="" aria-hidden="true" />
          <button v-else-if="canRefreshCredit" class="multi-push-credit__refresh" type="button"
            :disabled="creditRefreshPending" :aria-label="data.creditRefreshLabelText" @click="refreshCredit">
            <img :src="refreshIcon" alt="" aria-hidden="true" />
          </button>
        </section>
        <section class="multi-push-summary">
          <div><span>{{ data.totalCreditLabelText }}</span><strong>{{ data.totalCredit }}</strong></div>
          <div><span>{{ data.usedCreditLabelText }}</span><strong>{{ data.usedCredit }}</strong></div>
        </section>
        <button v-if="products.length" class="multi-push-products" type="button" @click="openSelector">
          <strong>{{ data.productSummaryText }}</strong><span>{{ data.productCountText }}</span><b
            aria-hidden="true">›</b>
        </button>
        <p v-if="data.statusDescription" class="multi-push-notice">{{ data.statusDescription }}</p>
        <button class="multi-push-action" type="button" :disabled="data.primaryAction === 'processing'"
          @click="primaryAction">{{ data.primaryButtonText }}</button>
      </section>
    </template>
    <section v-else class="multi-push-home__error">
      <HomeError :error="{ messageText: data?.statusDescription || '' }" :pending="false" />
    </section>
    <Transition name="product-selector">
      <div v-if="isSelectorOpen" class="product-selector" role="dialog" aria-modal="true" @touchstart.stop
        @touchmove.stop @touchend.stop @touchcancel.stop @pointerdown.stop @pointermove.stop @pointerup.stop
        @pointercancel.stop @wheel.stop>
        <button class="product-selector__scrim" type="button" @click="closeSelector" />
        <section class="product-selector__sheet">
          <button class="product-selector__close" type="button" @click="closeSelector">×</button>
          <div class="product-selector__list">
            <button v-for="product in products" :key="product.id" class="product-selector__item"
              :class="{ 'product-selector__item--selected': product.selected }" type="button" role="checkbox"
              :aria-checked="product.selected" @click="toggleProduct(product)">
              <span class="product-selector__icon" aria-hidden="true">
                <img v-if="isApprovedIconUrl(product.iconUrl)" :src="product.iconUrl" alt="" />
              </span>
              <span class="product-selector__details"><strong>{{ product.name }}</strong><small>{{ data.loanAmountLabelText }}
                  <em>{{ product.loanAmountText }}</em></small><small>{{ data.dueDateLabelText }} <em>{{ product.dueDateText }}</em></small></span>
              <span v-if="product.isReloan" class="product-selector__badge">{{ data.reloanLabelText }}</span>
            </button>
          </div>
          <div class="product-selector__footer"><button type="button" :disabled="!canSubmit || submitted" @click="submitSelection">{{
                data.selectionSubmitText || data.primaryButtonText }}<b class="product-selector__submit-badge">{{
                data.selectedProductCount }}</b></button></div>
        </section>
      </div>
    </Transition>
  </main>
</template>

<style>
.multi-push-home {
  min-height: 100%;
  padding-bottom: calc(1.76923rem + env(safe-area-inset-bottom));
  background: #f8f9fc;
  color: #364153;
}

.multi-push-home__content {
  padding: .41026rem .41026rem 1.64103rem;
}

.multi-push-home .home-steps {
  margin-bottom: .41026rem;
}

.multi-push-credit {
  position: relative;
  min-height: 3.69231rem;
  padding: .58974rem;
  border: .02564rem solid #dbeafe;
  border-radius: .41026rem;
  background: #f0f7ff;
  text-align: center;
}

.multi-push-credit h1 {
  margin: 0;
  color: #333;
  font-size: .51282rem;
  font-weight: 500;
  line-height: .61538rem;
}

.multi-push-credit strong {
  display: block;
  margin-top: .61538rem;
  color: #155dfc;
  font-size: 1.02564rem;
  font-weight: 400;
  line-height: 1.23077rem;
  white-space: nowrap;
}

.multi-push-credit__lock {
  position: absolute;
  top: .71795rem;
  right: .61538rem;
  width: .41026rem;
  height: .41026rem;
}

.multi-push-credit__refresh {
  position: absolute;
  top: .58974rem;
  right: .48718rem;
  display: grid;
  width: .87179rem;
  height: .87179rem;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
}

.multi-push-credit__refresh img {
  width: .42308rem;
  height: .39744rem;
}

.multi-push-credit__refresh:disabled {
  opacity: .5;
}

.multi-push-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .25641rem;
  margin-top: .41026rem;
}

.multi-push-summary div {
  min-height: 1.84615rem;
  border: .02564rem solid #e5e7eb;
  border-radius: .41026rem;
  background: #fff;
}

.multi-push-products {
  min-height: 1.4359rem;
  border: .02564rem solid #e5e7eb;
  border-radius: .41026rem;
  background: #fff;
}

.multi-push-summary div {
  display: grid;
  place-content: center;
  text-align: center;
}

.multi-push-summary span {
  font-size: .30769rem;
  line-height: .41026rem;
}

.multi-push-summary strong,
.multi-push-products strong {
  font-size: .41026rem;
  line-height: .61538rem;
}

.multi-push-products {
  position: relative;
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  margin-top: .41026rem;
  padding: .41026rem 2.15385rem .41026rem .41026rem;
  color: #364153;
  font: inherit;
}

.multi-push-products span {
  position: absolute;
  right: .74359rem;
  padding: .10256rem .20513rem;
  border-radius: .38462rem;
  background: #ff4a43;
  color: #fff;
  font-size: .30769rem;
  line-height: .41026rem;
}

.multi-push-products b {
  position: absolute;
  right: .30769rem;
  color: #6a7282;
  font-size: .51282rem;
  font-weight: 400;
}

.multi-push-notice {
  margin: .41026rem 0 0;
  color: #ff4a43;
  font-size: .30769rem;
  line-height: .41026rem;
  text-align: center;
}

.multi-push-action {
  width: 100%;
  min-height: 1.4359rem;
  margin-top: 1.02564rem;
  border: 0;
  border-radius: .41026rem;
  background: linear-gradient(90deg, #155dfc, #4f39f6, #9810fa);
  color: #fff;
  font-size: .41026rem;
  font-weight: 800;
}

.multi-push-home__error {
  display: grid;
  min-height: calc(100dvh - 1.76923rem);
  place-items: center;
  padding: .61538rem;
}

.product-selector {
  position: fixed;
  inset: 0;
  z-index: 10;
  overscroll-behavior: contain;
}

.product-selector__scrim {
  position: absolute;
  inset: 0;
  width: 100%;
  border: 0;
  background: rgba(0, 0, 0, .7);
}

.product-selector__sheet {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: calc(100dvh - 3.07692rem);
  min-height: 15.89744rem;
  padding-top: .41026rem;
  border-radius: .41026rem .41026rem 0 0;
  background: #f8f9fc;
  box-shadow: 0 -.10256rem .30769rem rgba(0, 0, 0, .16);
}

.product-selector__close {
  position: absolute;
  top: -1.02564rem;
  right: .41026rem;
  z-index: 2;
  display: grid;
  width: .61538rem;
  height: .61538rem;
  place-items: center;
  border: .05128rem solid #fff;
  border-radius: 50%;
  background: transparent;
  color: #fff;
  font-size: .46154rem;
  line-height: 1;
}

.product-selector__list {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 .41026rem 2.25641rem;
}

.product-selector__item {
  position: relative;
  display: flex;
  width: 100%;
  min-height: 3.02564rem;
  align-items: flex-start;
  gap: .30769rem;
  margin-bottom: .30769rem;
  padding: .41026rem;
  border: .02564rem solid #e5e7eb;
  border-radius: .41026rem;
  background: #fff;
  text-align: left;
}

.product-selector__item--selected {
  border-color: #155dfc;
}

.product-selector__icon {
  display: grid;
  width: 1.4359rem;
  height: 1.4359rem;
  flex: none;
  place-items: center;
  border-radius: .20513rem;
  background: #d8d8d8;
  overflow: hidden;
}

.product-selector__icon img { width: 100%; height: 100%; object-fit: cover; }

.product-selector__details {
  display: grid;
  min-width: 0;
  gap: .10256rem;
  flex: 1;
}

.product-selector__details strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #1e2939;
  font-size: .41026rem;
  font-weight: 400;
  line-height: .61538rem;
}

.product-selector__details small {
  display: flex;
  justify-content: space-between;
  color: #6a7282;
  font-size: .35897rem;
  line-height: .51282rem;
}

.product-selector__details em {
  margin-left: auto;
  color: #155dfc;
  font-style: normal;
  text-align: right;
}

.product-selector__details small:nth-of-type(2) em {
  color: #1e2939;
}

.product-selector__badge {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 3.02564rem;
  padding: .15385rem .30769rem;
  border-radius: 0 .41026rem 0 .41026rem;
  background: linear-gradient(165deg, #ffc673, #ffbd5c);
  color: #fff;
  font-size: .30769rem;
  text-align: center;
}

.product-selector__footer {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 2.25641rem;
  padding: .20513rem .41026rem env(safe-area-inset-bottom);
  background: #fff;
  box-shadow: 0 -.10256rem .30769rem rgba(0, 0, 0, .16);
}

.product-selector__footer button {
  position: relative;
  width: 100%;
  min-height: 1.4359rem;
  border: 0;
  border-radius: .41026rem;
  background: #155dfc;
  color: #fff;
  font-size: .41026rem;
  font-weight: 800;
}

.product-selector__submit-badge {
  position: absolute;
  top: 0;
  right: 0;
  transform: translateY(-50%);
  padding: .10256rem .41026rem;
  border-radius: .61538rem;
  background: #f7de5a;
  color: #111827;
  font-size: .30769rem;
  text-align: center;
}

.product-selector__footer button:disabled {
  opacity: .5;
}

.product-selector-enter-active,
.product-selector-leave-active {
  transition: opacity .22s ease;
}

.product-selector-enter-active .product-selector__sheet,
.product-selector-leave-active .product-selector__sheet {
  transition: transform .22s cubic-bezier(.22, .61, .36, 1);
}

.product-selector-enter-from,
.product-selector-leave-to {
  opacity: 0;
}

.product-selector-enter-from .product-selector__sheet,
.product-selector-leave-to .product-selector__sheet {
  transform: translateY(100%);
}
</style>
