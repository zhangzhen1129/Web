<script setup>
import lockIcon from '../../../assets/home/lock.svg'
import refreshIcon from '../../../assets/home/refresh.svg'

const props = defineProps({
  summary: { type: Object, required: true },
  refreshPending: { type: Boolean, default: false },
})
const emit = defineEmits(['refresh'])
</script>

<template>
  <div class="credit-summary">
    <section class="credit-summary__available">
      <h2>{{ summary.availableLabelText }}</h2>
      <img v-if="summary.locked" class="credit-summary__lock" :src="lockIcon" alt="" aria-hidden="true" />
      <button
        v-else-if="summary.refreshEnabled"
        class="credit-summary__refresh"
        type="button"
        :disabled="props.refreshPending"
        :aria-label="summary.refreshLabelText"
        @click="emit('refresh')"
      ><img :src="refreshIcon" alt="" aria-hidden="true" /></button>
      <strong>{{ summary.availableText }}</strong>
    </section>
    <div class="credit-summary__details">
      <div><span>{{ summary.totalLabelText }}</span><strong>{{ summary.totalText }}</strong></div>
      <div><span>{{ summary.usedLabelText }}</span><strong>{{ summary.usedText }}</strong></div>
    </div>
  </div>
</template>
