<script setup>
defineProps({ error: { type: Object, required: true }, pending: Boolean })
defineEmits(['retry'])
</script>

<template>
  <section class="home-error" role="alert">
    <p>{{ error.messageText }}</p>
    <button v-if="error.retryVisible" type="button" :disabled="pending" @click="$emit('retry')">{{ error.retryText }}</button>
  </section>
</template>
