<script setup>
defineProps({ item: { type: Object, default: null }, pullText: { type: String, default: '' } })
</script>

<template>
  <div v-if="pullText || item" class="home-broadcast" aria-live="polite">
    <span class="home-broadcast__signal" aria-hidden="true"></span>
    <span class="home-broadcast__text">{{ pullText || item.text }}</span>
  </div>
</template>
