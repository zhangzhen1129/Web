<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

defineOptions({ name: 'HomeOverlayNotice' })

const props = defineProps({
  notice: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close'])
const isVisible = ref(Boolean(props.notice))

function closeNotice() {
  isVisible.value = false
  emit('close')
}

function handleKeydown(event) {
  if (event.key === 'Escape' && isVisible.value) closeNotice()
}

watch(() => props.notice?.noticeId, (noticeId) => {
  isVisible.value = Boolean(noticeId)
})

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Transition name="home-overlay-notice">
    <div
      v-if="notice && isVisible"
      class="home-overlay-notice"
      role="presentation"
      @click.self="closeNotice"
    >
      <div
        class="home-overlay-notice__dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="notice.text"
        @click.stop
      >
        {{ notice.text }}
      </div>
    </div>
  </Transition>
</template>
