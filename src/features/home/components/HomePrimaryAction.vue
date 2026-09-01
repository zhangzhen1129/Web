<script setup>
defineProps({ action: { type: Object, required: true } })
defineEmits(['activate'])
</script>

<template>
  <div class="primary-action-wrap">
    <span v-if="action.badgeText" class="primary-action__badge">{{ action.badgeText }}</span>
    <button class="primary-action" type="button" :disabled="!action.enabled || action.loading" :aria-busy="action.loading" @click="$emit('activate')">
      <span v-if="action.loading" class="button-spinner" aria-hidden="true"></span>{{ action.text }}
    </button>
    <p v-if="action.supportingText" class="primary-action__supporting-text">{{ action.supportingText }}</p>
  </div>
</template>
