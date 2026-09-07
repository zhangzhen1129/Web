<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import progressBubbleUrl from './assets/loading-progress-bubble.svg'
import { getProjectMessage } from '../../../shared/config/projectLanguage.js'

defineOptions({ name: 'DataCollectionLoadingBar' })

const props = defineProps({
  status: {
    type: String,
    default: null,
  },
})

const PROCESSING_STATUSES = new Set(['collecting', 'uploading', 'pre_applying', 'applying'])
const progress = ref(1)
const message = getProjectMessage('40')
const isVisible = computed(() => PROCESSING_STATUSES.has(props.status))
let progressTimer = null

function stopProgressTimer() {
  if (progressTimer === null) return
  clearInterval(progressTimer)
  progressTimer = null
}

function startProgressTimer() {
  stopProgressTimer()
  progressTimer = setInterval(() => {
    progress.value = Math.min(progress.value + 1, 99)
  }, 100)
}

watch(isVisible, (visible, wasVisible) => {
  if (visible && !wasVisible) {
    progress.value = 1
    startProgressTimer()
    return
  }
  if (!visible) stopProgressTimer()
}, { immediate: true })

onBeforeUnmount(stopProgressTimer)
</script>

<template>
  <div
    v-if="isVisible"
    class="data-collection-loading-bar"
    role="presentation"
  >
    <section
      class="data-collection-loading-bar__dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="message"
      aria-live="polite"
    >
      <div
        class="data-collection-loading-bar__track"
        role="progressbar"
        :aria-label="message"
        aria-valuemin="1"
        aria-valuemax="99"
        :aria-valuenow="progress"
        :style="{ '--loading-progress': `${progress}%` }"
      >
        <div class="data-collection-loading-bar__fill" aria-hidden="true" />
        <div class="data-collection-loading-bar__bubble" aria-hidden="true">
          <img :src="progressBubbleUrl" alt="" />
          <span>{{ progress }}%</span>
        </div>
      </div>
      <p class="data-collection-loading-bar__message">{{ message }}</p>
    </section>
  </div>
</template>

<style scoped>
.data-collection-loading-bar {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  background: rgba(0, 0, 0, .7);
}

.data-collection-loading-bar__dialog {
  box-sizing: border-box;
  width: 7.5641rem;
  height: 3.74359rem;
  padding: .61538rem .41026rem 0;
  overflow: visible;
  background: #fff;
  border-radius: .41026rem;
}

.data-collection-loading-bar__track {
  position: relative;
  width: 6.74359rem;
  height: .25641rem;
  border-radius: .12821rem;
  background: #b9cefe;
}

.data-collection-loading-bar__fill {
  width: var(--loading-progress);
  height: 100%;
  border-radius: inherit;
  background: #155dfc;
}

.data-collection-loading-bar__bubble {
  position: absolute;
  bottom: .20513rem;
  left: clamp(0rem, calc(var(--loading-progress) - .46154rem), 5.82051rem);
  display: grid;
  width: .92308rem;
  height: .61538rem;
  place-items: center;
  color: #fff;
  font-family: Roboto, Arial, sans-serif;
  font-size: .30769rem;
  font-weight: 400;
  line-height: .41026rem;
}

.data-collection-loading-bar__bubble img {
  position: absolute;
  width: 100%;
  height: 100%;
}

.data-collection-loading-bar__bubble span {
  position: relative;
}

.data-collection-loading-bar__message {
  margin: .41026rem 0 0;
  color: #000601;
  font-family: Roboto, Arial, sans-serif;
  font-size: .35897rem;
  font-weight: 400;
  line-height: .51282rem;
  text-align: center;
}
</style>
