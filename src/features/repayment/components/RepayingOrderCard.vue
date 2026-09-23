<script setup>
import { computed } from 'vue'
import { getRepaymentStatusText, REPAYMENT_TEXT } from '../repaymentText.js'

const props = defineProps({
  order: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['open'])

const statusText = computed(() => getRepaymentStatusText(props.order.statusCode))

function openOrder() {
  if (props.disabled) return
  emit('open', props.order.orderId)
}
</script>

<template>
  <article
    class="repaying-card"
    :aria-disabled="disabled ? 'true' : 'false'"
    @click="openOrder"
  >
    <span class="repaying-card__status">{{ statusText }}</span>

    <div class="repaying-card__body">
      <div class="repaying-card__icon-wrap">
        <img class="repaying-card__icon" :src="order.productIconUrl" alt="" />
      </div>

      <div class="repaying-card__details">
        <h2 class="repaying-card__title">{{ order.productName }}</h2>
        <div class="repaying-card__row">
          <span>{{ REPAYMENT_TEXT.labels.amount }}</span>
          <strong class="repaying-card__amount">
            {{ REPAYMENT_TEXT.labels.currency }} {{ order.amountText }}
          </strong>
        </div>
        <div class="repaying-card__row">
          <span>{{ REPAYMENT_TEXT.labels.dueDate }}</span>
          <span>{{ order.dueDateText }}</span>
        </div>
      </div>
    </div>

    <button
      class="repaying-card__action"
      type="button"
      :disabled="disabled"
      @click.stop="openOrder"
    >
      {{ order.actionText }}
    </button>
  </article>
</template>

<style scoped>
.repaying-card {
  position: relative;
  width: 100%;
  min-height: 4.92308rem;
  overflow: hidden;
  padding: .41026rem;
  border: .02564rem solid #f3f4f6;
  border-radius: .41026rem;
  background: #fff;
  box-sizing: border-box;
  cursor: pointer;
}

.repaying-card__status {
  position: absolute;
  top: .02564rem;
  right: .02564rem;
  min-height: .82051rem;
  padding: 0 .41026rem;
  border-bottom-left-radius: .41026rem;
  background: #ff7c00;
  color: #fff;
  font-size: .30769rem;
  font-weight: 500;
  line-height: .82051rem;
  white-space: nowrap;
}

.repaying-card__body {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: .20513rem;
}

.repaying-card__icon-wrap {
  display: grid;
  width: 1.4359rem;
  height: 1.4359rem;
  flex: 0 0 1.4359rem;
  place-items: center;
  overflow: hidden;
  border-radius: .20513rem;
  background: #d8d8d8;
}

.repaying-card__icon {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.repaying-card__details {
  min-width: 0;
  flex: 1;
}

.repaying-card__title {
  margin: 0;
  padding-right: 1.53846rem;
  overflow: hidden;
  color: #1e2939;
  font-size: .41026rem;
  font-weight: 400;
  line-height: .61538rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repaying-card__row {
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

.repaying-card__row > span:first-child {
  min-width: 0;
  flex: 1;
}

.repaying-card__row > :last-child {
  min-width: 0;
  text-align: right;
}

.repaying-card__amount {
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

.repaying-card__action {
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

.repaying-card__action:disabled {
  opacity: .65;
}

.repaying-card__action:focus-visible {
  outline: .07692rem solid #111827;
  outline-offset: .05128rem;
}
</style>
