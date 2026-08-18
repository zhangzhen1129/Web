<script setup>
import { computed } from 'vue'
import minusIcon from '../../../assets/home/minus.svg'
import plusIcon from '../../../assets/home/plus.svg'

const props = defineProps({ product: { type: Object, required: true } })
const emit = defineEmits(['select-amount', 'select-term'])
const selectedIndex = computed(() => props.product.amountOptions.findIndex(({ key }) => key === props.product.selectedAmountKey))
const previous = computed(() => props.product.amountOptions.slice(0, selectedIndex.value).findLast(({ disabled }) => !disabled))
const next = computed(() => props.product.amountOptions.slice(selectedIndex.value + 1).find(({ disabled }) => !disabled))

function choose(option) {
  if (option && !option.disabled) emit('select-amount', option.key)
}
</script>

<template>
  <div class="product-selection">
    <section class="amount-card" :aria-label="product.amountLabelText">
      <h2>{{ product.amountLabelText }}</h2>
      <div class="amount-card__controls">
        <button class="round-control" type="button" :disabled="!previous" aria-label="Previous option" @click="choose(previous)"><img :src="minusIcon" alt="" /></button>
        <strong class="amount-card__value">{{ product.amountOptions[selectedIndex].text }}</strong>
        <button class="round-control" type="button" :disabled="!next" aria-label="Next option" @click="choose(next)"><img :src="plusIcon" alt="" /></button>
      </div>
    </section>
    <section class="term-card" :aria-label="product.termLabelText">
      <h2>{{ product.termLabelText }}</h2>
      <div class="term-card__options" role="radiogroup">
        <button
          v-for="option in product.termOptions"
          :key="option.key"
          class="term-option"
          :class="{ 'term-option--selected': option.key === product.selectedTermKey }"
          type="button"
          role="radio"
          :aria-checked="option.key === product.selectedTermKey"
          :disabled="option.disabled"
          @click="emit('select-term', option.key)"
        >{{ option.text }}</button>
      </div>
      <p v-if="product.rateText" class="term-card__rate">{{ product.rateText }}</p>
    </section>
  </div>
</template>
