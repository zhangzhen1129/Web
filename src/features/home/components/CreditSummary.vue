<script setup>
defineProps({ summary: { type: Object, required: true } })
</script>

<template>
  <div class="credit-summary">
    <section class="credit-summary__available">
      <h2>{{ summary.availableLabelText }}</h2>
      <span v-if="summary.locked" class="credit-summary__lock" aria-hidden="true"></span>
      <strong>{{ summary.availableText }}</strong>
    </section>
    <div class="credit-summary__details">
      <div><span>{{ summary.totalLabelText }}</span><strong>{{ summary.totalText }}</strong></div>
      <div><span>{{ summary.usedLabelText }}</span><strong>{{ summary.usedText }}</strong></div>
    </div>
  </div>
</template>
