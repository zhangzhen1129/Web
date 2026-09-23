<script setup>
import { computed } from 'vue'
import {
  ORDER_LIST_CARD_VARIANT,
  getOrderListBadgeColor,
  getOrderListCardVariant,
} from '../orderListConstants.js'
import {
  ORDER_LIST_TEXT,
  getOrderCardAmountLabel,
  getOrderCardDateLabel,
  getOrderStatusText,
} from '../orderListText.js'

const props = defineProps({
  order: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['open'])

const statusText = computed(() => getOrderStatusText(props.order.statusCode))
const amountLabel = computed(() => getOrderCardAmountLabel(props.order.cardMode))
const dateLabel = computed(() => getOrderCardDateLabel(props.order.cardMode))
const badgeColor = computed(() => getOrderListBadgeColor(props.order.statusCode))
const isOverdue = computed(
  () => getOrderListCardVariant(props.order.statusCode) === ORDER_LIST_CARD_VARIANT.OVERDUE,
)

function openOrder() {
  if (props.disabled) return
  emit('open', props.order)
}
</script>

<template>
  <article class="order-card" :class="{ 'order-card--overdue': isOverdue }">
    <span
      class="order-card__badge order-card__badge--corner"
      :style="{ backgroundColor: badgeColor }"
    >
      {{ statusText }}
    </span>

    <div class="order-card__body">
      <div class="order-card__icon-wrap">
        <img class="order-card__icon" :src="order.productIconUrl" alt="" />
      </div>

      <div class="order-card__details">
        <div class="order-card__heading">
          <h2 class="order-card__title">{{ order.productName }}</h2>
          <span
            class="order-card__badge order-card__badge--measure"
            aria-hidden="true"
          >
            {{ statusText }}
          </span>
        </div>

        <div class="order-card__row">
          <span class="order-card__row-label">{{ amountLabel }}</span>
          <strong class="order-card__amount">
            {{ ORDER_LIST_TEXT.labels.currency }} {{ order.amountText }}
          </strong>
        </div>

        <div class="order-card__row order-card__row--date">
          <span class="order-card__row-label">{{ dateLabel }}</span>
          <span class="order-card__date">{{ order.dateText }}</span>
        </div>
      </div>
    </div>

    <button
      class="order-card__action"
      type="button"
      :disabled="disabled"
      @click="openOrder"
    >
      {{ order.actionText }}
    </button>
  </article>
</template>

<style scoped>
.order-card {
  position: relative;
  width: 100%;
  min-height: 4.92308rem;
  overflow: hidden;
  padding: .41026rem;
  border: .02564rem solid #f3f4f6;
  border-radius: .41026rem;
  background: #fff;
  box-sizing: border-box;
}

.order-card--overdue {
  min-height: 5.12821rem;
}

.order-card__badge {
  display: inline-flex;
  min-height: .82051rem;
  align-items: center;
  padding: 0 .41026rem;
  color: #fff;
  font-size: .30769rem;
  font-weight: 500;
  line-height: .82051rem;
  white-space: nowrap;
}

.order-card__badge--corner {
  position: absolute;
  top: .02564rem;
  right: .02564rem;
  border-bottom-left-radius: .41026rem;
}

.order-card__badge--measure {
  flex: 0 0 auto;
  margin-right: -.38462rem;
  margin-left: .20513rem;
  visibility: hidden;
}

.order-card__body {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: .20513rem;
}

.order-card__icon-wrap {
  display: grid;
  width: 1.4359rem;
  height: 1.4359rem;
  flex: 0 0 1.4359rem;
  place-items: center;
  overflow: hidden;
  border-radius: .20513rem;
  background: #d8d8d8;
}

.order-card__icon {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.order-card__details {
  min-width: 0;
  flex: 1;
}

.order-card__heading {
  display: flex;
  min-width: 0;
  align-items: flex-start;
}

.order-card__title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: #1e2939;
  font-size: .41026rem;
  font-weight: 400;
  line-height: .61538rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-card--overdue .order-card__title {
  font-weight: 500;
}

.order-card__row {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: .20513rem;
  margin-top: .20513rem;
  color: #6a7282;
  font-size: .35897rem;
  line-height: .51282rem;
}

.order-card__row-label {
  min-width: 0;
  flex: 1;
}

.order-card__row--date {
  min-height: .82051rem;
}

.order-card__amount {
  flex: 0 0 auto;
  background: linear-gradient(90deg, #155dfc, #4f39f6);
  background-clip: text;
  color: transparent;
  font-size: .41026rem;
  font-weight: 400;
  line-height: .61538rem;
  white-space: nowrap;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.order-card--overdue .order-card__amount {
  background: linear-gradient(90deg, #e7000b, #f54900);
  background-clip: text;
  -webkit-background-clip: text;
}

.order-card__date {
  flex: 0 0 auto;
  color: #1e2939;
  font-size: .41026rem;
  line-height: .61538rem;
  white-space: nowrap;
}

.order-card--overdue .order-card__date {
  display: inline-flex;
  min-height: .82051rem;
  align-items: center;
  padding: 0 .35897rem;
  border-radius: 999px;
  background: #ffeeee;
  color: #e7000b;
}

.order-card__action {
  width: 100%;
  height: 1.23077rem;
  margin-top: .61538rem;
  border: 0;
  border-radius: .35897rem;
  background: #155dfc;
  color: #fff;
  font-size: .35897rem;
  font-weight: 900;
  line-height: .51282rem;
}

.order-card--overdue .order-card__action {
  background: linear-gradient(90deg, #fb2c36, #f54900);
}

.order-card__action:disabled {
  opacity: .65;
}

.order-card__action:focus-visible {
  outline: .07692rem solid #111827;
  outline-offset: .05128rem;
}
</style>
