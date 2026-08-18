<script setup>
import lockIcon from '../../../assets/home/lock.svg'

defineProps({ summary: { type: Object, required: true } })
</script>

<template>
  <div class="credit-summary">
    <section class="credit-summary__available">
      <h2>{{ summary.availableLabelText }}</h2>
      <img v-if="summary.locked" class="credit-summary__lock" :src="lockIcon" alt="" />
      <strong>{{ summary.availableText }}</strong>
    </section>
    <div class="credit-summary__details">
      <div><span>{{ summary.totalLabelText }}</span><strong>{{ summary.totalText }}</strong></div>
      <div><span>{{ summary.usedLabelText }}</span><strong>{{ summary.usedText }}</strong></div>
    </div>
  </div>
</template>
